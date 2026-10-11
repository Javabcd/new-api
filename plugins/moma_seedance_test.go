package plugins_test

import (
	"bytes"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	taskplugin "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const momaModel = "doubao-seedance-2-0-260128"

func newMomaPlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("moma-seedance")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "moma-seedance"})
	require.NoError(t, err)
	return plugin
}

func momaContext(request map[string]any) map[string]any {
	return map[string]any{"requestBody": request, "model": momaModel, "baseUrl": "https://zhenze-huhehaote.cmecloud.cn/", "apiKey": "test-secret", "publicTaskId": "task_public", "taskId": "cgt-test"}
}

func TestMomaSeedanceSubmission(t *testing.T) {
	plugin := newMomaPlugin(t)
	assert.Equal(t, "https://zhenze-huhehaote.cmecloud.cn", plugin.Meta.BaseURL)
	assert.Equal(t, []string{momaModel, "doubao-seedance-2.0"}, plugin.Meta.Models)
	assert.Empty(t, plugin.Meta.ChannelTypes)
	content := []any{
		map[string]any{"type": "text", "text": "fruit tea advertisement"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://example.com/image.png"}, "role": "reference_image"},
		map[string]any{"type": "video_url", "video_url": map[string]any{"url": "https://example.com/video.mp4"}, "role": "reference_video"},
		map[string]any{"type": "audio_url", "audio_url": map[string]any{"url": "https://example.com/audio.mp3"}, "role": "reference_audio"},
	}
	for _, surface := range []string{"native", "openai_video", "task"} {
		for _, mapped := range []bool{false, true} {
			t.Run(surface+map[bool]string{false: "/unmapped", true: "/mapped"}[mapped], func(t *testing.T) {
				metadata := map[string]any{"content": content, "duration": 11, "ratio": "16:9", "generate_audio": false, "watermark": false}
				request := map[string]any{"model": momaModel, "prompt": "fruit tea advertisement", "metadata": metadata}
				if surface != "task" {
					ctx := map[string]any{"model": momaModel, "body": map[string]any{"kind": "json", "value": request}}
					var intent any
					var err error
					if surface == "native" {
						body := maps.Clone(metadata)
						body["model"] = momaModel
						ctx["body"] = map[string]any{"kind": "json", "value": body}
						intent, err = plugin.Engine.CallMember(t.Context(), "native", "createTask", ctx)
					} else {
						intent, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, ctx)
					}
					require.NoError(t, err)
					request = alibabaObject(t, intent)["requestBody"].(map[string]any)
				}
				upstreamModel := momaModel
				if mapped {
					upstreamModel = "doubao-seedance-2.0"
				}
				info := &relaycommon.RelayInfo{OriginModelName: momaModel, TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"}, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: upstreamModel, ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}}
				adaptor := taskplugin.New(plugin)
				adaptor.Init(info)
				c, _ := gin.CreateTestContext(httptest.NewRecorder())
				encoded, err := common.Marshal(request)
				require.NoError(t, err)
				c.Request = httptest.NewRequest(http.MethodPost, "/v1/tasks/moma-seedance", bytes.NewReader(encoded))
				c.Request.Header.Set("Content-Type", "application/json")
				c.Set("task_request", request)
				require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
				upstream, err := http.NewRequest(http.MethodPost, plugin.Meta.BaseURL, nil)
				require.NoError(t, err)
				require.NoError(t, adaptor.BuildRequestHeader(c, upstream, info))
				assert.Equal(t, "Bearer test-secret", upstream.Header.Get("Authorization"))
				reader, err := adaptor.BuildRequestBody(c, info)
				require.NoError(t, err)
				encoded, err = io.ReadAll(reader)
				require.NoError(t, err)
				var body map[string]any
				require.NoError(t, common.Unmarshal(encoded, &body))
				want := maps.Clone(metadata)
				want["model"] = "doubao-seedance-2.0"
				assert.Equal(t, alibabaObject(t, want), body)
				assert.Equal(t, momaModel, info.OriginModelName)
				facts, err := adaptor.ExtractUsageFactsValidated(c, info)
				require.NoError(t, err)
				assert.Equal(t, map[string]any{"tokens": float64(534600)}, facts)
				_, err = adaptor.EstimateBillingValidated(c, info)
				require.Error(t, err, "legacy per-call pricing must be rejected")
			})
		}
	}
}

func TestMomaSeedanceOmissionAndMapping(t *testing.T) {
	plugin := newMomaPlugin(t)
	for _, mapped := range []string{"", momaModel, "doubao-seedance-2.0"} {
		ctx := momaContext(map[string]any{"prompt": "hello"})
		ctx["upstreamModel"] = mapped
		value, err := plugin.Engine.Call(t.Context(), "extractUsage", ctx)
		require.NoError(t, err)
		assert.Equal(t, map[string]any{"tokens": float64(729000)}, alibabaObject(t, value))
		value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
		require.NoError(t, err)
		body := alibabaObject(t, value)["body"].(map[string]any)
		assert.Equal(t, map[string]any{"model": "doubao-seedance-2.0", "content": []any{map[string]any{"type": "text", "text": "hello"}}}, body)
	}
	for _, kind := range []string{"vendor", "new_api"} {
		ctx := momaContext(map[string]any{"prompt": "hello", "seconds": "5"})
		ctx["authHeader"] = "Bearer test-secret"
		ctx["upstream"] = map[string]any{"kind": kind}
		prefix := plugin.Meta.BaseURL
		if kind == "new_api" {
			prefix += "/moma"
		}
		for hook, suffix := range map[string]string{"buildSubmitRequest": "", "buildQueryRequest": "/cgt-test"} {
			value, err := plugin.Engine.Call(t.Context(), hook, ctx)
			require.NoError(t, err)
			descriptor := alibabaObject(t, value)
			assert.Equal(t, prefix+"/api/v3/contents/generations/tasks"+suffix, descriptor["url"])
			assert.Equal(t, "Bearer test-secret", descriptor["headers"].(map[string]any)["Authorization"])
			if hook == "buildSubmitRequest" {
				assert.Equal(t, float64(5), descriptor["body"].(map[string]any)["duration"])
			}
		}
	}
}

func TestMomaSeedanceValidation(t *testing.T) {
	plugin := newMomaPlugin(t)
	for _, fields := range []map[string]any{
		{"duration": 0}, {"duration": -1}, {"duration": 3}, {"duration": 16}, {"duration": 3601}, {"duration": 5.5}, {"duration": true}, {"duration": nil}, {"duration": "1e1"},
		{"seconds": 5, "duration": 6}, {"ratio": "adaptive"}, {"ratio": nil}, {"generate_audio": "false"}, {"watermark": nil},
		{"resolution": "720p"}, {"size": "1280x720"}, {"frames": 120}, {"content": "text"}, {"content": []any{nil}},
		{"content": []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/png;base64,AAAA"}}}},
		{"content": []any{map[string]any{"type": "video_url", "video_url": map[string]any{"url": "https://example.com/a"}, "role": "user"}}},
	} {
		for _, nested := range []bool{false, true} {
			request := maps.Clone(fields)
			if nested {
				request = map[string]any{"metadata": request}
			}
			request["prompt"] = "hello"
			for _, hook := range []string{"buildSubmitRequest", "extractUsage"} {
				_, err := plugin.Engine.Call(t.Context(), hook, momaContext(request))
				require.Error(t, err, "%s: %v", hook, request)
			}
		}
	}
	for _, seconds := range []int{4, 15} {
		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", momaContext(map[string]any{"prompt": "hello", "seconds": seconds}))
		require.NoError(t, err)
	}
	for _, body := range []map[string]any{
		{"kind": "multipart", "fields": map[string]any{"prompt": []string{"hello"}}, "files": []any{map[string]any{"ref": "request_file:input_reference"}}},
		{"kind": "multipart", "fields": map[string]any{"prompt": []string{"hello"}, "seconds": []string{"5", "6"}}},
		{"kind": "multipart", "fields": map[string]any{"prompt": []string{"hello"}, "metadata": []string{`{"duration":16}`}}},
	} {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": momaModel, "body": body})
		require.Error(t, err)
	}
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": momaModel, "body": map[string]any{"kind": "multipart", "fields": map[string]any{"prompt": []string{"hello"}, "seconds": []string{"5"}, "generate_audio": []string{"false"}, "watermark": []string{"false"}}}})
	require.NoError(t, err)
	request := alibabaObject(t, value)["requestBody"].(map[string]any)
	assert.Equal(t, false, request["generate_audio"])
	assert.Equal(t, false, request["watermark"])
	assert.Equal(t, float64(5), request["duration"])
}

func TestMomaSeedanceCompletionAndBilling(t *testing.T) {
	plugin := newMomaPlugin(t)
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}})
	task := &model.Task{TaskID: "task_public", Properties: model.Properties{OriginModelName: momaModel, UpstreamModelName: "doubao-seedance-2.0"}}
	for status, want := range map[string]string{"queued": "QUEUED", "running": "IN_PROGRESS", "succeeded": "SUCCESS", "failed": "FAILURE", "cancelled": "FAILURE", "expired": "FAILURE", "unexpected": "UNKNOWN"} {
		body := map[string]any{"status": status, "model": momaModel, "content": map[string]any{"video_url": "https://example.com/video.mp4"}, "usage": map[string]any{"completion_tokens": 400000, "total_tokens": 410000}, "duration": 11, "resolution": "720p", "error": map[string]any{"message": "invalid request test-secret"}}
		encoded, err := common.Marshal(body)
		require.NoError(t, err)
		result, err := adaptor.ParseTaskResult(task, &http.Response{StatusCode: 200}, encoded)
		require.NoError(t, err)
		assert.Equal(t, want, result.Status)
		assert.NotContains(t, result.Reason, "test-secret")
		if want != "SUCCESS" {
			continue
		}
		assert.Equal(t, "https://example.com/video.mp4", result.Url)
		assert.Equal(t, map[string]any{"tokens": float64(410000)}, result.UsageFacts)
		// Synthetic pricing verifies the frozen estimate is replaced in both
		// directions; it makes no claim about MoMa's published monetary price.
		const expression = `tier("tokens", u("tokens") * 2 / 1000000)`
		schema, _ := plugin.Meta.UsageForModel(momaModel)
		require.NoError(t, billing_setting.SmokeTestTaskExpr(expression, schema))
		for _, reserved := range []float64{243000, 729000} {
			snapshot := &billingexpr.BillingSnapshot{BillingMode: billing_setting.BillingModeTieredExpr, ModelName: momaModel, ExprString: expression, ExprHash: billingexpr.ExprHashString(expression), GroupRatio: 1, QuotaPerUnit: 500000, ExprVersion: billingexpr.ExprVersion(expression), TaskUsageBilling: true, UsageFacts: map[string]any{"tokens": reserved}}
			settled, facts, err := service.EvaluateTaskCompletionUsage(snapshot, result.UsageFacts)
			require.NoError(t, err)
			assert.Equal(t, 410000, settled.ActualQuotaAfterGroup)
			assert.Equal(t, float64(410000), facts["tokens"])
			assert.Equal(t, reserved, snapshot.UsageFacts["tokens"])
		}
	}
	for _, tc := range []struct{ total, completion, want any }{
		{410000, 400000, float64(410000)}, {nil, 42, float64(42)}, {0, 42, float64(42)}, {-1, 42, float64(42)}, {1.5, 42, float64(42)}, {true, 42, float64(42)}, {"10", 42, float64(42)}, {2147483648, 42, float64(42)}, {nil, nil, nil}, {0, 0, nil},
	} {
		value, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{"status": "succeeded", "usage": map[string]any{"total_tokens": tc.total, "completion_tokens": tc.completion}})
		require.NoError(t, err)
		assert.Equal(t, tc.want, alibabaObject(t, value)["tokens"])
	}
}

func TestMomaSeedanceErrorsAndArtifacts(t *testing.T) {
	plugin := newMomaPlugin(t)
	ctx := momaContext(nil)
	for _, id := range []any{nil, "", " ", 42} {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", ctx, map[string]any{"body": map[string]any{"id": id}})
		require.Error(t, err)
	}
	for _, status := range []int{400, 401, 404, 409, 500} {
		body := map[string]any{"error": map[string]any{"code": "InvalidParameter", "type": "BadRequest", "message": "bad input test-secret"}}
		if status == 401 {
			body = map[string]any{"errorCode": "UNAUTHORIZED", "errorMessage": "api key is invalid test-secret", "state": "Error"}
		}
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", ctx, map[string]any{"statusCode": status, "body": body})
		require.Error(t, err)
		assert.NotContains(t, err.Error(), "test-secret")
		assert.Contains(t, err.Error(), "[redacted]")
	}
	value, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", ctx, map[string]any{"body": map[string]any{"id": "cgt-test", "model": momaModel}})
	require.NoError(t, err)
	assert.Equal(t, "cgt-test", alibabaObject(t, value)["taskId"])
	data := map[string]any{"id": "cgt-test", "model": momaModel, "status": "succeeded", "content": map[string]any{"video_url": "https://example.com/video?signature=a%2Bb"}, "duration": 11, "resolution": "720p", "usage": map[string]any{"total_tokens": 411300}}
	view := map[string]any{"task_id": "task_public", "status": "SUCCESS", "data": data}
	value, err = plugin.Engine.Call(t.Context(), "listArtifacts", view)
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"key":"video","type":"video","mimeType":"video/mp4"}]`, string(encoded))
	for _, method := range []string{"GET", "HEAD"} {
		value, err = plugin.Engine.Call(t.Context(), "buildContentRequest", map[string]any{"data": data, "artifactKey": "video", "apiKey": "test-secret", "clientRequest": map[string]any{"method": method}})
		require.NoError(t, err)
		assert.Equal(t, map[string]any{"url": data["content"].(map[string]any)["video_url"], "method": method, "credentialless": true}, alibabaObject(t, value))
	}
	want := maps.Clone(data)
	want["id"] = "task_public"
	for _, hook := range []string{"taskCreated", "taskStatus"} {
		value, err = plugin.Engine.CallMember(t.Context(), "native", hook, map[string]any{}, view)
		require.NoError(t, err)
		assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value))
	}
	value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "render"}, map[string]any{}, view)
	require.NoError(t, err)
	assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value))
	view["status"], view["fail_reason"] = "FAILURE", "polling failed"
	value, err = plugin.Engine.CallMember(t.Context(), "native", "taskStatus", map[string]any{}, view)
	require.NoError(t, err)
	assert.Equal(t, "failed", alibabaObject(t, value)["status"])
}
