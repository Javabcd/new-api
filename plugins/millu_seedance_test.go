package plugins_test

import (
	"bytes"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
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

const milluModel = "millu-sd-x-2-5-260801"

func newMilluPlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("millu-seedance")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "millu-seedance"})
	require.NoError(t, err)
	return plugin
}

func milluContext(request map[string]any) map[string]any {
	return map[string]any{"requestBody": request, "model": "seedance-2.5", "upstreamModel": milluModel,
		"baseUrl": "https://api.millu.tv/", "apiKey": "test-key", "publicTaskId": "task_public", "taskId": "cgt-test"}
}

func TestMilluSeedanceSubmission(t *testing.T) {
	plugin := newMilluPlugin(t)
	assert.Equal(t, "1.0.0", plugin.Meta.Version)
	assert.Equal(t, "https://api.millu.tv", plugin.Meta.BaseURL)
	assert.Equal(t, []string{milluModel}, plugin.Meta.Models)
	assert.Empty(t, plugin.Meta.ChannelTypes)
	require.Len(t, plugin.Meta.Routes, 2)
	assert.Equal(t, "/millu/api/v3/contents/generations/tasks", plugin.Meta.Routes[0].Path)
	assert.Equal(t, "/millu/api/v3/contents/generations/tasks/:task_id", plugin.Meta.Routes[1].Path)
	content := []any{
		map[string]any{"type": "text", "text": "first text"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": "asset://image"}, "role": "reference_image"},
		map[string]any{"type": "video_url", "video_url": map[string]any{"url": "asset://video"}, "role": "user"},
		map[string]any{"type": "audio_url", "audio_url": map[string]any{"url": "https://example.com/audio.mp3"}, "role": "reference_audio"},
		map[string]any{"type": "text", "text": "last text"},
	}
	for _, surface := range []string{"native", "task", "openai_video", "multipart"} {
		t.Run(surface, func(t *testing.T) {
			metadata := map[string]any{"content": content, "duration": 5, "resolution": "720P", "ratio": "16:9", "generate_audio": false,
				"watermark": false, "return_last_frame": true, "seed": 0, "priority": 0, "draft": false, "camera_fixed": false,
				"execution_expires_after": 172800, "tools": []any{map[string]any{"type": "web_search"}}, "web_search": false}
			request := map[string]any{"model": "seedance-2.5", "metadata": metadata}
			if surface == "task" {
				request["prompt"] = "generic task prompt"
			}
			if surface != "task" {
				ctx := map[string]any{"model": "seedance-2.5", "body": map[string]any{"kind": "json", "value": request}}
				var value any
				var err error
				if surface == "native" {
					body := maps.Clone(metadata)
					body["model"] = "seedance-2.5"
					ctx["body"] = map[string]any{"kind": "json", "value": body}
					value, err = plugin.Engine.CallMember(t.Context(), "native", "createTask", ctx)
				} else {
					if surface == "multipart" {
						encoded, err := common.Marshal(metadata)
						require.NoError(t, err)
						ctx["body"] = map[string]any{"kind": "multipart", "fields": map[string]any{"metadata": []string{string(encoded)}}}
					}
					value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, ctx)
				}
				require.NoError(t, err)
				intent := alibabaObject(t, value)
				assert.Equal(t, "seedance-2.5", intent["model"])
				request = intent["requestBody"].(map[string]any)
			}
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://api.millu.tv", ApiKey: "test-key", UpstreamModelName: milluModel},
				OriginModelName: "seedance-2.5", TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"}}
			adaptor := taskplugin.New(plugin)
			adaptor.Init(info)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			encoded, err := common.Marshal(request)
			require.NoError(t, err)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/tasks/millu-seedance", bytes.NewReader(encoded))
			c.Request.Header.Set("Content-Type", "application/json")
			c.Request.Header.Set("Idempotency-Key", "client-stable-key")
			c.Request.Header.Set("X-Request-ID", "client-trace-id")
			c.Request.Header.Set("Cookie", "must-not-leak")
			c.Request.Header.Set("X-Forwarded-For", "must-not-leak")
			// PrepareTaskPluginSubmit stores this parsed map for the generic route too.
			c.Set("task_request", request)
			require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
			upstream, err := http.NewRequest(http.MethodPost, "https://api.millu.tv/api/v3/contents/generations/tasks", nil)
			require.NoError(t, err)
			require.NoError(t, adaptor.BuildRequestHeader(c, upstream, info))
			assert.Equal(t, "client-stable-key", upstream.Header.Get("Idempotency-Key"))
			assert.Equal(t, "client-trace-id", upstream.Header.Get("X-Request-ID"))
			assert.Equal(t, "Bearer test-key", upstream.Header.Get("Authorization"))
			assert.Empty(t, upstream.Header.Get("Cookie"))
			assert.Empty(t, upstream.Header.Get("X-Forwarded-For"))
			reader, err := adaptor.BuildRequestBody(c, info)
			require.NoError(t, err)
			encoded, err = io.ReadAll(reader)
			require.NoError(t, err)
			var body map[string]any
			require.NoError(t, common.Unmarshal(encoded, &body))
			want := maps.Clone(metadata)
			want["model"], want["resolution"] = milluModel, "720p"
			if surface == "task" {
				want["content"] = append(append([]any{}, content...), map[string]any{"type": "text", "text": "generic task prompt"})
			}
			assert.Equal(t, alibabaObject(t, want), body)
			assert.Equal(t, "seedance-2.5", info.OriginModelName)
			facts, err := adaptor.ExtractUsageFactsValidated(c, info)
			require.NoError(t, err)
			assert.Equal(t, map[string]any{"tokens": float64(108000), "resolution": "720p", "video_input": "video"}, facts)
		})
	}
}

func TestMilluSeedanceHeadersAndDefaults(t *testing.T) {
	plugin := newMilluPlugin(t)
	for _, header := range []string{"preferred-key", "Bearer preferred-key"} {
		ctx := milluContext(map[string]any{"prompt": "hello"})
		ctx["authHeader"] = header
		for _, hook := range []string{"buildSubmitRequest", "buildQueryRequest"} {
			value, err := plugin.Engine.Call(t.Context(), hook, ctx)
			require.NoError(t, err)
			assert.Equal(t, "Bearer preferred-key", alibabaObject(t, value)["headers"].(map[string]any)["Authorization"])
		}
	}
	missingKey := milluContext(map[string]any{"prompt": "hello"})
	delete(missingKey, "apiKey")
	_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", missingKey)
	require.ErrorContains(t, err, "API key is required")
	for _, kind := range []string{"vendor", "new_api"} {
		for _, inbound := range []bool{false, true} {
			ctx := milluContext(map[string]any{"model": "seedance-2.5", "prompt": "hello"})
			ctx["upstream"] = map[string]any{"kind": kind}
			root, authorization := "https://api.millu.tv", "Bearer test-key"
			if kind == "new_api" {
				ctx["baseUrl"], ctx["authHeader"] = "https://gateway.example.com/", "Bearer gateway-key"
				root, authorization = "https://gateway.example.com/millu", "Bearer gateway-key"
			}
			idempotency, requestID := "task_public", "task_public"
			if inbound {
				ctx["requestHeaders"] = map[string]any{"iDeMpOtEnCy-kEy": "client-123", "x-request-id": "trace-123", "Cookie": "private", "X-Forwarded-For": "private", "Authorization": "private"}
				idempotency, requestID = "client-123", "trace-123"
			}
			for range 2 {
				value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
				require.NoError(t, err)
				descriptor := alibabaObject(t, value)
				assert.Equal(t, root+"/api/v3/contents/generations/tasks", descriptor["url"])
				assert.Equal(t, map[string]any{"Content-Type": "application/json", "Accept": "application/json", "Authorization": authorization, "Idempotency-Key": idempotency, "X-Request-ID": requestID}, descriptor["headers"])
				body := descriptor["body"].(map[string]any)
				assert.Equal(t, milluModel, body["model"])
				for _, key := range []string{"duration", "resolution", "generate_audio", "watermark", "return_last_frame", "execution_expires_after", "ratio"} {
					assert.NotContains(t, body, key)
				}
			}
			value, err := plugin.Engine.Call(t.Context(), "buildQueryRequest", ctx)
			require.NoError(t, err)
			query := alibabaObject(t, value)
			assert.Equal(t, root+"/api/v3/contents/generations/tasks/cgt-test", query["url"])
			assert.Equal(t, map[string]any{"Accept": "application/json", "Authorization": authorization, "X-Request-ID": "task_public"}, query["headers"])
			value, err = plugin.Engine.Call(t.Context(), "extractUsage", ctx)
			require.NoError(t, err)
			assert.Equal(t, map[string]any{"tokens": float64(108000), "resolution": "720p", "video_input": "none"}, alibabaObject(t, value))
		}
	}
	for _, resolution := range []string{"720p", "1080p"} {
		for _, role := range []string{"user", "reference_video"} {
			ctx := milluContext(map[string]any{"prompt": "hello", "seconds": 5, "metadata": map[string]any{"resolution": resolution, "content": []any{map[string]any{"type": "video_url", "role": role, "video_url": map[string]any{"url": "asset://reference"}}}}})
			value, err := plugin.Engine.Call(t.Context(), "extractUsage", ctx)
			require.NoError(t, err)
			assert.Equal(t, map[string]any{"tokens": map[string]float64{"720p": 108000, "1080p": 243000}[resolution], "resolution": resolution, "video_input": "video"}, alibabaObject(t, value))
		}
	}
}

func TestMilluSeedanceValidation(t *testing.T) {
	plugin := newMilluPlugin(t)
	image := map[string]any{"type": "image_url", "image_url": map[string]any{"url": "asset://image"}}
	first, last := maps.Clone(image), maps.Clone(image)
	first["role"], last["role"] = "first_frame", "last_frame"
	for _, tc := range []struct {
		name      string
		fields    map[string]any
		wantError string
	}{
		{"zero", map[string]any{"duration": 0}, "duration must"},
		{"negative", map[string]any{"duration": -2}, "duration must"},
		{"smart", map[string]any{"duration": -1}, "safe reservation upper bound"},
		{"fraction", map[string]any{"duration": 1.5}, "duration must"},
		{"overflow", map[string]any{"duration": relaycommon.MaxTaskDurationSeconds + 1}, "duration must"},
		{"null", map[string]any{"duration": nil}, "duration must"},
		{"boolean", map[string]any{"duration": true}, "duration must"},
		{"valid ten", map[string]any{"duration": 10}, ""},
		{"valid upper bound", map[string]any{"duration": relaycommon.MaxTaskDurationSeconds}, ""},
		{"480p", map[string]any{"resolution": "480p"}, "resolution must"},
		{"4k", map[string]any{"resolution": "4k"}, "resolution must"},
		{"2k", map[string]any{"resolution": "2k"}, "resolution must"},
		{"bad size", map[string]any{"size": "1024x1024"}, "resolution must"},
		{"size", map[string]any{"size": "1920x1080"}, ""},
		{"callback", map[string]any{"callback_url": "https://example.com"}, "callback_url is not supported"},
		{"frames", map[string]any{"frames": 120}, "frames is not enabled"},
		{"single image", map[string]any{"content": []any{image}}, ""},
		{"missing roles", map[string]any{"content": []any{image, first}}, "explicit role"},
		{"last alone", map[string]any{"content": []any{last}}, "requires first_frame"},
		{"paired", map[string]any{"content": []any{first, last}}, ""},
		{"adaptive", map[string]any{"content": []any{first, last}, "ratio": "adaptive"}, ""},
		{"fixed ratio", map[string]any{"content": []any{first, last}, "ratio": "16:9"}, "ratio=adaptive"},
		{"implicit first frame", map[string]any{"content": []any{image}, "ratio": "16:9"}, "ratio=adaptive"},
		{"invalid role", map[string]any{"content": []any{map[string]any{"type": "image_url", "image_url": image["image_url"], "role": "user"}}}, "invalid image_url role"},
		{"unknown tool", map[string]any{"tools": []any{map[string]any{"type": "unknown"}}}, "only supports web_search"},
		{"text boundary", map[string]any{"content": []any{map[string]any{"type": "text", "text": strings.Repeat("字", 20000)}}}, ""},
		{"text too long", map[string]any{"content": []any{map[string]any{"type": "text", "text": strings.Repeat("字", 20001)}}}, "20000 characters"},
		{"empty text", map[string]any{"content": []any{map[string]any{"type": "text", "text": " "}}}, "20000 characters"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			metadata := maps.Clone(tc.fields)
			if _, ok := metadata["content"]; !ok {
				metadata["content"] = []any{map[string]any{"type": "text", "text": "hello"}}
			}
			ctx := milluContext(map[string]any{"metadata": metadata})
			value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
			if tc.wantError != "" {
				require.ErrorContains(t, err, tc.wantError)
				return
			}
			require.NoError(t, err)
			if tc.name == "single image" {
				assert.Equal(t, alibabaObject(t, image), alibabaObject(t, value)["body"].(map[string]any)["content"].([]any)[0])
			}
		})
	}
	for _, count := range []int{64, 65} {
		content := make([]any, count)
		for i := range content {
			content[i] = map[string]any{"type": "text", "text": "hello"}
		}
		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", milluContext(map[string]any{"metadata": map[string]any{"content": content}}))
		if count == 64 {
			require.NoError(t, err)
		} else {
			require.ErrorContains(t, err, "64 items")
		}
	}
	for _, request := range []map[string]any{
		{"prompt": "hello", "seconds": 5, "metadata": map[string]any{"duration": 10}},
		{"prompt": "hello", "size": "1920x1080", "metadata": map[string]any{"resolution": "720p"}},
		{"prompt": "hello", "seconds": 5, "metadata": map[string]any{"duration": -1}},
	} {
		_, err := plugin.Engine.Call(t.Context(), "extractUsage", milluContext(request))
		require.Error(t, err)
	}
	for _, field := range []string{"image", "input_reference", "images"} {
		request := map[string]any{"prompt": "hello", field: "asset://image", "size": "1280x720", "seconds": "5"}
		if field == "images" {
			request[field] = []string{"asset://image"}
		}
		value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": "seedance-2.5", "body": map[string]any{"kind": "json", "value": request}})
		require.NoError(t, err)
		value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", milluContext(alibabaObject(t, value)["requestBody"].(map[string]any)))
		require.NoError(t, err)
		body := alibabaObject(t, value)["body"].(map[string]any)
		assert.Equal(t, "reference_image", body["content"].([]any)[0].(map[string]any)["role"])
		assert.Equal(t, "720p", body["resolution"])
	}
	for _, fields := range []map[string]any{
		{"seconds": []string{"5", "10"}}, {"seconds": []string{"1.5"}}, {"seconds": []string{"-1"}},
		{"metadata": []string{`{"duration":3601}`}}, {"metadata": []string{`{"frames":120}`}},
	} {
		fields["prompt"] = []string{"hello"}
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": milluModel, "body": map[string]any{"kind": "multipart", "fields": fields}})
		require.Error(t, err)
	}
}

func TestMilluSeedanceCompletion(t *testing.T) {
	plugin := newMilluPlugin(t)
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://api.millu.tv", ApiKey: "test-key"}})
	task := &model.Task{TaskID: "task_public", Properties: model.Properties{OriginModelName: "seedance-2.5", UpstreamModelName: milluModel}}
	for status, want := range map[string]string{"queued": "QUEUED", "pending": "QUEUED", "running": "IN_PROGRESS", "processing": "IN_PROGRESS", "succeeded": "SUCCESS", "failed": "FAILURE", "cancelled": "FAILURE", "expired": "FAILURE", "foo_bar": "UNKNOWN"} {
		body := map[string]any{"status": status, "content": map[string]any{"video_url": "https://example.com/video.mp4"}, "usage": map[string]any{"completion_tokens": 108900, "total_tokens": 999999, "tool_usage": map[string]any{"web_search": 1}}, "resolution": "720p", "error": map[string]any{"code": "InvalidParameter", "message": "request is invalid"}}
		encoded, err := common.Marshal(body)
		require.NoError(t, err)
		result, err := adaptor.ParseTaskResult(task, &http.Response{StatusCode: 200}, encoded)
		require.NoError(t, err)
		assert.Equal(t, want, result.Status, status)
		if want == "FAILURE" {
			assert.Equal(t, "InvalidParameter: request is invalid", result.Reason)
		}
		if want != "SUCCESS" {
			continue
		}
		assert.Equal(t, "https://example.com/video.mp4", result.Url)
		assert.Equal(t, map[string]any{"tokens": float64(108900), "resolution": "720p"}, result.UsageFacts)
		// Synthetic USD prices exercise tiers and measured-usage overlay, not Millu's CNY rates.
		const expression = `u("video_input") == "video" ? tier("video", u("tokens") * 1 / 1000000) : tier("none", u("tokens") * 2 / 1000000)`
		schema, _ := plugin.Meta.UsageForModel(milluModel)
		require.NoError(t, billing_setting.SmokeTestTaskExpr(expression, schema))
		snapshot := &billingexpr.BillingSnapshot{BillingMode: billing_setting.BillingModeTieredExpr, ModelName: milluModel, ExprString: expression, ExprHash: billingexpr.ExprHashString(expression), GroupRatio: 1, QuotaPerUnit: 500000, ExprVersion: billingexpr.ExprVersion(expression), TaskUsageBilling: true, UsageFacts: map[string]any{"tokens": float64(108000), "resolution": "720p", "video_input": "video"}}
		settled, facts, err := service.EvaluateTaskCompletionUsage(snapshot, result.UsageFacts)
		require.NoError(t, err)
		assert.Equal(t, 54450, settled.ActualQuotaAfterGroup)
		assert.Equal(t, "video", settled.MatchedTier)
		assert.Equal(t, map[string]any{"tokens": float64(108900), "resolution": "720p", "video_input": "video"}, facts)
	}
	for _, tc := range []struct{ completion, total, want any }{
		{108900, 999999, float64(108900)}, {nil, 108900, float64(108900)}, {0, 42, float64(42)}, {-1, 42, float64(42)},
		{1.5, 42, float64(42)}, {true, 42, float64(42)}, {2147483648, 42, float64(42)}, {nil, nil, nil},
	} {
		value, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{"status": "succeeded", "usage": map[string]any{"completion_tokens": tc.completion, "total_tokens": tc.total}, "resolution": "1080p"})
		require.NoError(t, err)
		facts := alibabaObject(t, value)
		assert.Equal(t, tc.want, facts["tokens"])
		assert.Equal(t, "1080p", facts["resolution"])
		assert.NotContains(t, facts, "video_input")
	}
	for _, id := range []any{nil, "", " ", 42} {
		_, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{}, map[string]any{"body": map[string]any{"id": id}})
		require.ErrorContains(t, err, "task_id is empty")
	}
	value, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{}, map[string]any{"body": map[string]any{"id": "cgt-test", "extra": true}})
	require.NoError(t, err)
	assert.Equal(t, map[string]any{"taskId": "cgt-test", "taskData": map[string]any{"id": "cgt-test", "extra": true}}, alibabaObject(t, value))
	_, err = plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{}, map[string]any{"body": map[string]any{"error": map[string]any{"code": "InvalidParameter", "message": "request is invalid"}}})
	require.ErrorContains(t, err, "InvalidParameter: request is invalid")
}

func TestMilluSeedanceArtifactsAndPresentation(t *testing.T) {
	plugin := newMilluPlugin(t)
	for _, format := range []string{"mp4", "mov", ""} {
		data := map[string]any{"id": "cgt-test", "model": milluModel, "status": "succeeded", "content": map[string]any{"video_url": "https://example.com/video?signature=a%2Bb", "last_frame_url": "https://example.com/frame.jpg"}, "usage": map[string]any{"completion_tokens": 108900, "tool_usage": map[string]any{"web_search": 1}}, "output_format": format, "future_field": true}
		view := map[string]any{"task_id": "task_public", "status": "SUCCESS", "data": data, "properties": map[string]any{"origin_model_name": "seedance-2.5"}}
		value, err := plugin.Engine.Call(t.Context(), "listArtifacts", view)
		require.NoError(t, err)
		encoded, err := common.Marshal(value)
		require.NoError(t, err)
		var artifacts []map[string]any
		require.NoError(t, common.Unmarshal(encoded, &artifacts))
		require.Len(t, artifacts, 2)
		assert.Equal(t, map[string]any{"key": "last_frame", "type": "image"}, artifacts[1])
		assert.Equal(t, "video", artifacts[0]["key"])
		assert.Equal(t, "video", artifacts[0]["type"])
		if format == "" {
			assert.NotContains(t, artifacts[0], "mimeType")
		} else {
			assert.Equal(t, map[string]string{"mp4": "video/mp4", "mov": "video/quicktime"}[format], artifacts[0]["mimeType"])
		}
		for key, field := range map[string]string{"video": "video_url", "last_frame": "last_frame_url"} {
			for _, method := range []string{"GET", "HEAD"} {
				value, err := plugin.Engine.Call(t.Context(), "buildContentRequest", map[string]any{"data": data, "artifactKey": key, "apiKey": "must-not-leak", "clientRequest": map[string]any{"method": method}})
				require.NoError(t, err)
				assert.Equal(t, map[string]any{"url": data["content"].(map[string]any)[field], "method": method, "credentialless": true}, alibabaObject(t, value))
			}
		}
		want := maps.Clone(data)
		want["id"], want["model"] = "task_public", "seedance-2.5"
		value, err = plugin.Engine.CallMember(t.Context(), "native", "taskStatus", map[string]any{}, view)
		require.NoError(t, err)
		assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value))
		value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "render"}, map[string]any{}, view)
		require.NoError(t, err)
		assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value))
		view["status"], view["fail_reason"] = "FAILURE", "polling failed"
		value, err = plugin.Engine.CallMember(t.Context(), "native", "taskStatus", map[string]any{}, view)
		require.NoError(t, err)
		assert.Equal(t, "failed", alibabaObject(t, value)["status"])
	}
}
