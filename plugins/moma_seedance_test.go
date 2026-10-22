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
	"github.com/QuantumNous/new-api/relay/channel"
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

func momaMedia(kind, role, url string) map[string]any {
	return map[string]any{"type": kind, kind: map[string]any{"url": url}, "role": role}
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
				metadata := map[string]any{
					"content": content, "duration": 11, "resolution": "1080p", "ratio": "adaptive", "generate_audio": false, "watermark": false,
					"return_last_frame": false, "execution_expires_after": 172800, "tools": []any{map[string]any{"type": "web_search"}}, "safety_identifier": "3f4a1c9e",
				}
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
				assert.Equal(t, "true", upstream.Header.Get("Input-Has-Video"))
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
				assert.Equal(t, map[string]any{"tokens": float64(534600), "resolution": "1080p", "video_input": "video"}, facts)
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
		assert.Equal(t, map[string]any{"tokens": float64(108000), "resolution": "720p", "video_input": "none"}, alibabaObject(t, value))
		value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
		require.NoError(t, err)
		body := alibabaObject(t, value)["body"].(map[string]any)
		assert.Equal(t, map[string]any{"model": "doubao-seedance-2.0", "content": []any{map[string]any{"type": "text", "text": "hello"}}}, body)
	}
	for _, kind := range []string{"vendor", "new_api"} {
		for _, path := range []string{"", "/", "/api/v3", "/api/v3/", "/gateway/api/v3/"} {
			ctx := momaContext(map[string]any{"prompt": "hello", "seconds": "5"})
			ctx["baseUrl"] = plugin.Meta.BaseURL + path
			ctx["authHeader"] = "Bearer test-secret"
			ctx["upstream"] = map[string]any{"kind": kind}
			prefix := plugin.Meta.BaseURL
			if strings.HasPrefix(path, "/gateway") {
				prefix += "/gateway"
			}
			if kind == "new_api" {
				prefix += "/moma"
			}
			for hook, suffix := range map[string]string{"buildSubmitRequest": "", "buildQueryRequest": "/cgt-test"} {
				value, err := plugin.Engine.Call(t.Context(), hook, ctx)
				require.NoError(t, err)
				descriptor := alibabaObject(t, value)
				assert.Equal(t, prefix+"/api/v3/contents/generations/tasks"+suffix, descriptor["url"])
				headers := descriptor["headers"].(map[string]any)
				assert.Equal(t, "Bearer test-secret", headers["Authorization"])
				assert.NotContains(t, headers, "Input-Has-Video")
				if hook == "buildSubmitRequest" {
					assert.Equal(t, float64(5), descriptor["body"].(map[string]any)["duration"])
				}
			}
		}
	}
}

func TestMomaSeedanceRequestParameters(t *testing.T) {
	plugin := newMomaPlugin(t)
	for _, fields := range []map[string]any{
		{"resolution": "480p"}, {"resolution": "720p"}, {"resolution": "1080p"},
		{"ratio": "16:9"}, {"ratio": "4:3"}, {"ratio": "1:1"}, {"ratio": "3:4"}, {"ratio": "9:16"}, {"ratio": "21:9"}, {"ratio": "adaptive"},
		{"duration": 4}, {"duration": 15}, {"duration": -1},
		{"return_last_frame": false}, {"return_last_frame": true}, {"generate_audio": false}, {"watermark": false},
		{"execution_expires_after": 3600}, {"execution_expires_after": 259200},
		{"tools": []any{map[string]any{"type": "web_search"}}}, {"tools": []any{}},
		{"safety_identifier": strings.Repeat("a", 64)},
	} {
		for _, nested := range []bool{false, true} {
			request := maps.Clone(fields)
			if nested {
				request = map[string]any{"metadata": request}
			}
			request["model"], request["prompt"] = momaModel, "你好 🌄"
			for _, surface := range []string{"native", "openai_video"} {
				ctx := map[string]any{"model": momaModel, "body": map[string]any{"kind": "json", "value": request}}
				var value any
				var err error
				if surface == "native" {
					value, err = plugin.Engine.CallMember(t.Context(), "native", "createTask", ctx)
				} else {
					value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, ctx)
				}
				require.NoError(t, err, "%s: %v", surface, fields)
				normalized := alibabaObject(t, value)["requestBody"].(map[string]any)
				descriptor, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", momaContext(normalized))
				require.NoError(t, err)
				want := maps.Clone(fields)
				want["model"] = "doubao-seedance-2.0"
				want["content"] = []any{map[string]any{"type": "text", "text": "你好 🌄"}}
				assert.Equal(t, alibabaObject(t, want), alibabaObject(t, descriptor)["body"])
			}
		}
	}
}

func TestMomaSeedanceValidation(t *testing.T) {
	plugin := newMomaPlugin(t)
	for _, fields := range []map[string]any{
		{"duration": 0}, {"duration": -2}, {"duration": 3}, {"duration": 16}, {"duration": 3601}, {"duration": 5.5}, {"duration": true}, {"duration": nil}, {"duration": "5"}, {"duration": "1e1"},
		{"seconds": 5, "duration": 6}, {"seconds": "18446744073709551615"}, {"seconds": "5.5"}, {"ratio": "2:1"}, {"ratio": nil}, {"generate_audio": "false"}, {"watermark": nil},
		{"return_last_frame": "false"}, {"return_last_frame": nil}, {"execution_expires_after": 3599}, {"execution_expires_after": 259201}, {"execution_expires_after": 3600.5}, {"execution_expires_after": "3600"},
		{"tools": nil}, {"tools": map[string]any{}}, {"tools": []any{nil}}, {"tools": []any{map[string]any{"type": "unknown"}}},
		{"safety_identifier": 1}, {"safety_identifier": nil}, {"safety_identifier": strings.Repeat("a", 65)},
		{"resolution": "2k"}, {"resolution": "4k"}, {"resolution": "1080"}, {"resolution": "1920x1080"}, {"resolution": "auto"}, {"resolution": nil},
		{"size": "1280x720"}, {"frames": 120}, {"content": "text"}, {"content": []any{nil}}, {"enableVideoEncrypt": true}, {"publicKeyPath": "/tmp/public.pem"}, {"privateKeyPath": "/tmp/private.pem"},
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
			request["model"] = momaModel
			_, err := plugin.Engine.CallMember(t.Context(), "native", "createTask", map[string]any{"body": map[string]any{"kind": "json", "value": request}})
			require.Error(t, err, "native decode: %v", request)
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
		{"kind": "multipart", "fields": map[string]any{"prompt": []string{"hello"}, "duration": []string{"5.5"}}},
		{"kind": "multipart", "fields": map[string]any{"prompt": []string{"hello"}, "tools": []string{`[{"type":"unknown"}]`}}},
	} {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": momaModel, "body": body})
		require.Error(t, err)
	}
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": momaModel, "body": map[string]any{"kind": "multipart", "fields": map[string]any{
		"prompt": []string{"hello"}, "seconds": []string{"-1"}, "return_last_frame": []string{"false"}, "generate_audio": []string{"false"}, "watermark": []string{"false"},
		"execution_expires_after": []string{"3600"}, "resolution": []string{"480p"}, "ratio": []string{"21:9"}, "tools": []string{`[{"type":"web_search"}]`}, "safety_identifier": []string{"3f4a1c9e"},
	}}})
	require.NoError(t, err)
	request := alibabaObject(t, value)["requestBody"].(map[string]any)
	assert.Equal(t, false, request["generate_audio"])
	assert.Equal(t, false, request["watermark"])
	assert.Equal(t, false, request["return_last_frame"])
	assert.Equal(t, float64(-1), request["duration"])
	assert.Equal(t, float64(3600), request["execution_expires_after"])
	assert.Equal(t, "480p", request["resolution"])
	assert.Equal(t, "21:9", request["ratio"])
	assert.Equal(t, []any{map[string]any{"type": "web_search"}}, request["tools"])
	assert.Equal(t, "3f4a1c9e", request["safety_identifier"])
}

func TestMomaSeedanceMediaReferences(t *testing.T) {
	plugin := newMomaPlugin(t)
	image := momaMedia("image_url", "reference_image", "https://example.com/image.png")
	video := momaMedia("video_url", "reference_video", "asset://video-id")
	audio := momaMedia("audio_url", "reference_audio", "data:audio/wav;base64,AAAA")
	first := momaMedia("image_url", "first_frame", "asset://first-frame")
	last := momaMedia("image_url", "last_frame", "data:image/png;base64,AAAA")
	type mediaCase struct {
		name    string
		content []any
		valid   bool
	}
	cases := []mediaCase{
		{"reference without text", []any{image}, true},
		{"first frame", []any{first}, true},
		{"first and last frame", []any{first, last}, true},
		{"video asset", []any{video}, true},
		{"video URL", []any{momaMedia("video_url", "reference_video", "https://example.com/video.mp4")}, true},
		{"audio and image", []any{audio, image}, true},
		{"audio and video", []any{audio, video}, true},
		{"audio only", []any{audio}, false},
		{"audio and text", []any{audio, map[string]any{"type": "text", "text": "hello"}}, false},
		{"last without first", []any{last}, false},
		{"duplicate first", []any{first, first}, false},
		{"duplicate last", []any{first, last, last}, false},
		{"first and reference image", []any{first, image}, false},
		{"first and video", []any{first, video}, false},
		{"first and audio", []any{first, audio}, false},
		{"missing role", []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "asset://image-id", "role": "reference_image"}}}, false},
		{"invalid role", []any{momaMedia("audio_url", "reference_image", "https://example.com/audio.mp3"), image}, false},
		{"video Base64", []any{momaMedia("video_url", "reference_video", "data:video/mp4;base64,AAAA")}, false},
		{"trailing newline", []any{momaMedia("image_url", "reference_image", "data:image/png;base64,AAAA\n")}, false},
	}
	for _, source := range []string{"http://example.com/image.png", "asset://image-id", "data:image/jpeg;base64,AA==", "data:image/png;base64,AAA=", "data:image/webp;base64,AAAA", "data:image/bmp;base64,AAAA", "data:image/tiff;base64,AAAA", "data:image/gif;base64,AAAA"} {
		cases = append(cases, mediaCase{source, []any{momaMedia("image_url", "reference_image", source)}, true})
	}
	for _, source := range []string{"https://example.com/audio.mp3", "asset://audio-id", "data:audio/mp3;base64,AAAA"} {
		cases = append(cases, mediaCase{source, []any{image, momaMedia("audio_url", "reference_audio", source)}, true})
	}
	for _, source := range []string{"", "asset://", "asset://bad/id", "file:///tmp/image.png", "https://user:pass@example.com/image.png", "data:image/PNG;base64,AAAA", "data:image/svg;base64,AAAA", "data:audio/wav;base64,AAAA", "data:image/png;base64,", "data:image/png;base64,AAA", "data:image/png;base64,AA=A", "data:image/png;base64,A==="} {
		cases = append(cases, mediaCase{source, []any{momaMedia("image_url", "reference_image", source)}, false})
	}
	for role, reference := range map[string]any{"reference_image": image, "reference_video": video, "reference_audio": audio} {
		limit := 3
		if role == "reference_image" {
			limit = 9
		}
		content := make([]any, limit)
		for i := range content {
			content[i] = reference
		}
		if role == "reference_audio" {
			content = append(content, image)
		}
		cases = append(cases, mediaCase{role + " at limit", content, true}, mediaCase{role + " over limit", append(append([]any(nil), content...), reference), false})
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			value, err := plugin.Engine.CallMember(t.Context(), "native", "createTask", map[string]any{"body": map[string]any{"kind": "json", "value": map[string]any{"model": momaModel, "content": tc.content}}})
			if !tc.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			request := alibabaObject(t, value)["requestBody"].(map[string]any)
			value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", momaContext(request))
			require.NoError(t, err)
			descriptor := alibabaObject(t, value)
			assert.Equal(t, alibabaObject(t, map[string]any{"content": tc.content})["content"], descriptor["body"].(map[string]any)["content"])
			// Official download linked by the PDF, maas_seedance/client.py:155-157
			// and :243-254: only a video_url entry adds Input-Has-Video: true.
			// Wheel SHA-256: 32d36fc6a6638b6db7d05fb336ad4676eb7efe52e2d4aabaef18352c01303045
			hasVideo := false
			for _, entry := range tc.content {
				if entry.(map[string]any)["type"] == "video_url" {
					hasVideo = true
				}
			}
			headers := descriptor["headers"].(map[string]any)
			value, err = plugin.Engine.Call(t.Context(), "extractUsage", momaContext(request))
			require.NoError(t, err)
			facts := alibabaObject(t, value)
			if hasVideo {
				assert.Equal(t, "true", headers["Input-Has-Video"])
				assert.Equal(t, "video", facts["video_input"])
			} else {
				assert.NotContains(t, headers, "Input-Has-Video")
				assert.Equal(t, "none", facts["video_input"])
			}
		})
	}
}

func TestMomaSeedanceReservation(t *testing.T) {
	plugin := newMomaPlugin(t)
	for _, tc := range []struct {
		request    map[string]any
		tokens     float64
		resolution string
	}{
		{map[string]any{}, 108000, "720p"},
		{map[string]any{"duration": -1}, 324000, "720p"},
		{map[string]any{"seconds": "-1"}, 324000, "720p"},
		{map[string]any{"resolution": "480p"}, 48038, "480p"},
		{map[string]any{"resolution": "720p", "duration": 4}, 86400, "720p"},
		{map[string]any{"resolution": "1080p", "duration": 15}, 729000, "1080p"},
		{map[string]any{"metadata": map[string]any{"resolution": "1080p", "duration": -1}}, 729000, "1080p"},
		{map[string]any{"resolution": "480p", "metadata": map[string]any{"resolution": "1080p"}}, 48038, "480p"},
	} {
		tc.request["prompt"] = "hello"
		info := &relaycommon.RelayInfo{OriginModelName: momaModel, TaskRelayInfo: &relaycommon.TaskRelayInfo{}, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: momaModel, ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}}
		adaptor := taskplugin.New(plugin)
		adaptor.Init(info)
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
		c.Set("task_request", tc.request)
		require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info), "%v", tc.request)
		facts, err := adaptor.ExtractUsageFactsValidated(c, info)
		require.NoError(t, err)
		assert.Equal(t, map[string]any{"tokens": tc.tokens, "resolution": tc.resolution, "video_input": "none"}, facts)
	}
	for _, invalid := range []map[string]any{
		{"duration": -2}, {"duration": 3601}, {"seconds": -2}, {"count": -1},
		{"metadata": map[string]any{"duration": -2}}, {"metadata": map[string]any{"seconds": 3601}},
	} {
		invalid["prompt"] = "hello"
		info := &relaycommon.RelayInfo{OriginModelName: momaModel, TaskRelayInfo: &relaycommon.TaskRelayInfo{}, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: momaModel, ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}}
		adaptor := taskplugin.New(plugin)
		adaptor.Init(info)
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
		c.Set("task_request", invalid)
		taskErr := adaptor.ValidateRequestAndSetAction(c, info)
		require.NotNil(t, taskErr)
		assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	}

	// Opting in permits only the sentinel in requests; plugins without the
	// capability retain the host's negative-duration rejection.
	withoutAutoDuration := *plugin
	withoutAutoDuration.Meta.RequiredCapabilities = nil
	info := &relaycommon.RelayInfo{OriginModelName: momaModel, TaskRelayInfo: &relaycommon.TaskRelayInfo{}, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: momaModel, ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}}
	adaptor := taskplugin.New(&withoutAutoDuration)
	adaptor.Init(info)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
	c.Set("task_request", map[string]any{"prompt": "hello", "duration": -1})
	taskErr := adaptor.ValidateRequestAndSetAction(c, info)
	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
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
		assert.Equal(t, map[string]any{"tokens": float64(410000), "resolution": "720p"}, result.UsageFacts)
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

func TestMomaSeedanceResolutionPricing(t *testing.T) {
	plugin := newMomaPlugin(t)
	// Synthetic prices are USD per million tokens, not published MoMa prices.
	const expression = `u("resolution") == "480p" ? tier("480p", u("tokens") * 1 / 1000000) : u("resolution") == "720p" ? tier("720p", u("tokens") * 2 / 1000000) : tier("1080p", u("tokens") * 4 / 1000000)`
	for _, modelName := range plugin.Meta.Models {
		schema, _ := plugin.Meta.UsageForModel(modelName)
		require.NoError(t, billing_setting.SmokeTestTaskExpr(expression, schema), modelName)
		assert.Equal(t, []string{"480p", "720p", "1080p"}, schema["resolution"].Enum)
	}
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}})
	task := &model.Task{TaskID: "task_public", Properties: model.Properties{OriginModelName: momaModel, UpstreamModelName: "doubao-seedance-2.0"}}
	for _, tc := range []struct {
		name              string
		requestResolution string
		outputResolution  any
		tokens            any
		wantResolution    string
		wantTokens        float64
		wantQuota         int
	}{
		{"480p output lowers tier", "720p", "480p", 200000, "480p", 200000, 100000},
		{"720p output keeps tier", "720p", "720p", 200000, "720p", 200000, 200000},
		{"1080p output raises tier", "480p", "1080p", 200000, "1080p", 200000, 400000},
		{"output resolution is normalized", "720p", " 1080P ", 200000, "1080p", 200000, 400000},
		{"missing resolution keeps submission", "1080p", nil, 200000, "1080p", 200000, 400000},
		{"unsupported resolution keeps default", "", "4k", 200000, "720p", 200000, 200000},
		{"non-string resolution keeps submission", "480p", 1080, 200000, "480p", 200000, 100000},
		{"missing tokens keep estimate with actual resolution", "720p", "1080p", nil, "1080p", 108000, 216000},
		{"missing facts keep reservation", "", nil, nil, "720p", 108000, 108000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := map[string]any{"prompt": "hello"}
			if tc.requestResolution != "" {
				request["resolution"] = tc.requestResolution
			}
			value, err := plugin.Engine.Call(t.Context(), "extractUsage", momaContext(request))
			require.NoError(t, err)
			frozenFacts := alibabaObject(t, value)
			snapshot := &billingexpr.BillingSnapshot{
				BillingMode: billing_setting.BillingModeTieredExpr, ModelName: momaModel,
				ExprString: expression, ExprHash: billingexpr.ExprHashString(expression), ExprVersion: billingexpr.ExprVersion(expression),
				GroupRatio: 1, QuotaPerUnit: 500000, TaskUsageBilling: true, UsageFacts: maps.Clone(frozenFacts),
			}
			body := map[string]any{"status": "succeeded", "usage": map[string]any{"total_tokens": tc.tokens}}
			if tc.outputResolution != nil {
				body["resolution"] = tc.outputResolution
			}
			encoded, err := common.Marshal(body)
			require.NoError(t, err)
			result, err := adaptor.ParseTaskResult(task, &http.Response{StatusCode: 200}, encoded)
			require.NoError(t, err)
			require.Equal(t, "SUCCESS", result.Status)
			settled, facts, err := service.EvaluateTaskCompletionUsage(snapshot, result.UsageFacts)
			require.NoError(t, err)
			assert.Equal(t, tc.wantQuota, settled.ActualQuotaAfterGroup)
			assert.Equal(t, tc.wantResolution, settled.MatchedTier)
			assert.Equal(t, map[string]any{"tokens": tc.wantTokens, "resolution": tc.wantResolution, "video_input": "none"}, facts)
			assert.Equal(t, frozenFacts, snapshot.UsageFacts, "completion must not mutate the frozen submission facts")
		})
	}
}

func TestMomaSeedanceVideoInputPricing(t *testing.T) {
	plugin := newMomaPlugin(t)
	// Synthetic USD prices exercise both dimensions without installing a price.
	const expression = `u("resolution") == "1080p" && u("video_input") == "video" ? tier("1080p_video", u("tokens") * 4 / 1000000) : u("resolution") == "1080p" ? tier("1080p_none", u("tokens") * 8 / 1000000) : u("video_input") == "video" ? tier("480p_720p_video", u("tokens") * 2 / 1000000) : tier("480p_720p_none", u("tokens") * 6 / 1000000)`
	for _, modelName := range plugin.Meta.Models {
		schema, _ := plugin.Meta.UsageForModel(modelName)
		require.NoError(t, billing_setting.SmokeTestTaskExpr(expression, schema), modelName)
	}
	for _, tc := range []struct {
		resolution string
		videoInput string
		reserved   int
		settled    int
		tier       string
	}{
		{"480p", "none", 144114, 600000, "480p_720p_none"},
		{"480p", "video", 48038, 200000, "480p_720p_video"},
		{"720p", "none", 324000, 600000, "480p_720p_none"},
		{"720p", "video", 108000, 200000, "480p_720p_video"},
		{"1080p", "none", 972000, 800000, "1080p_none"},
		{"1080p", "video", 486000, 400000, "1080p_video"},
	} {
		t.Run(tc.resolution+"/"+tc.videoInput, func(t *testing.T) {
			// A supplied billing fact cannot override the actual request content.
			request := map[string]any{"prompt": "hello", "resolution": tc.resolution, "video_input": "video"}
			if tc.videoInput == "video" {
				request["video_input"] = "none"
				request["metadata"] = map[string]any{"content": []any{momaMedia("video_url", "reference_video", "asset://video-id")}}
			}
			info := &relaycommon.RelayInfo{OriginModelName: momaModel, TaskRelayInfo: &relaycommon.TaskRelayInfo{}, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "doubao-seedance-2.0", ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}}
			adaptor := taskplugin.New(plugin)
			adaptor.Init(info)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
			c.Set("task_request", request)
			require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
			facts, err := adaptor.ExtractUsageFactsValidated(c, info)
			require.NoError(t, err)
			require.Equal(t, tc.videoInput, facts["video_input"])
			snapshot := &billingexpr.BillingSnapshot{
				BillingMode: billing_setting.BillingModeTieredExpr, ModelName: momaModel,
				ExprString: expression, ExprHash: billingexpr.ExprHashString(expression), ExprVersion: billingexpr.ExprVersion(expression),
				GroupRatio: 1, QuotaPerUnit: 500000, TaskUsageBilling: true, UsageFacts: maps.Clone(facts),
			}
			reserved, err := billingexpr.ComputeTieredQuotaWithRequest(snapshot, billingexpr.TokenParams{}, billingexpr.RequestInput{Usage: facts})
			require.NoError(t, err)
			assert.Equal(t, tc.reserved, reserved.ActualQuotaAfterGroup)
			assert.Equal(t, tc.tier, reserved.MatchedTier)
			// The output URL and an upstream input flag must not replace the
			// submission fact frozen for the selected pricing expression.
			body := map[string]any{
				"status": "succeeded", "resolution": tc.resolution, "video_input": request["video_input"],
				"content": map[string]any{"video_url": "https://example.com/output.mp4"},
				"usage":   map[string]any{"total_tokens": 200000},
			}
			encoded, err := common.Marshal(body)
			require.NoError(t, err)
			task := &model.Task{TaskID: "task_public", Properties: model.Properties{OriginModelName: momaModel, UpstreamModelName: "doubao-seedance-2.0"}}
			result, err := adaptor.ParseTaskResult(task, &http.Response{StatusCode: 200}, encoded)
			require.NoError(t, err)
			require.Equal(t, "SUCCESS", result.Status)
			assert.NotContains(t, result.UsageFacts, "video_input")
			settled, actualFacts, err := service.EvaluateTaskCompletionUsage(snapshot, result.UsageFacts)
			require.NoError(t, err)
			assert.Equal(t, tc.settled, settled.ActualQuotaAfterGroup)
			assert.Equal(t, tc.tier, settled.MatchedTier)
			assert.Equal(t, map[string]any{"tokens": float64(200000), "resolution": tc.resolution, "video_input": tc.videoInput}, actualFacts)
			assert.Equal(t, facts, snapshot.UsageFacts)
		})
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
	data := map[string]any{
		"id": "cgt-test", "model": momaModel, "status": "succeeded", "content": map[string]any{"video_url": "https://example.com/video?signature=a%2Bb", "last_frame_url": "https://example.com/frame.png?signature=c%2Bd"},
		"duration": 11, "resolution": "720p", "ratio": "adaptive", "seed": 42, "framespersecond": 24, "generate_audio": false,
		"tools": []any{map[string]any{"type": "web_search"}}, "safety_identifier": "3f4a1c9e", "service_tier": "default", "execution_expires_after": 172800,
		"usage": map[string]any{"completion_tokens": 411300, "total_tokens": 411300},
	}
	view := map[string]any{"task_id": "task_public", "status": "SUCCESS", "data": data}
	value, err = plugin.Engine.Call(t.Context(), "listArtifacts", view)
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"key":"video","type":"video","mimeType":"video/mp4"},{"key":"last_frame","type":"image","mimeType":"image/png"}]`, string(encoded))
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: plugin.Meta.BaseURL, ApiKey: "test-secret"}})
	encoded, err = common.Marshal(data)
	require.NoError(t, err)
	task := &model.Task{TaskID: "task_public", Status: model.TaskStatusSuccess, Data: encoded, Properties: model.Properties{OriginModelName: momaModel}, PrivateData: model.TaskPrivateData{UpstreamTaskID: "cgt-test"}}
	artifacts, err := adaptor.ListArtifacts(task)
	require.NoError(t, err)
	assert.Equal(t, []channel.TaskArtifact{{Key: "video", Type: "video", MimeType: "video/mp4"}, {Key: "last_frame", Type: "image", MimeType: "image/png"}}, artifacts)
	for key, field := range map[string]string{"video": "video_url", "last_frame": "last_frame_url"} {
		for _, method := range []string{"GET", "HEAD"} {
			descriptor, err := adaptor.BuildContentRequest(task, key, channel.TaskArtifactClientRequest{Method: method})
			require.NoError(t, err)
			require.NotNil(t, descriptor)
			assert.Equal(t, data["content"].(map[string]any)[field], descriptor.URL)
			assert.Equal(t, method, descriptor.Method)
			assert.True(t, descriptor.Credentialless)
			assert.Empty(t, descriptor.Headers, "artifact downloads must not contain the channel credential")
		}
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
	for _, length := range []map[string]any{{"duration": 11}, {"frames": 264}, {}} {
		snapshot := maps.Clone(data)
		delete(snapshot, "duration")
		maps.Copy(snapshot, length)
		encoded, err = common.Marshal(snapshot)
		require.NoError(t, err)
		task.Data = encoded
		_, err = adaptor.ParseTaskResult(task, &http.Response{StatusCode: 200}, encoded)
		require.NoError(t, err)
		rendered, err := adaptor.ConvertToOpenAIVideo(task)
		require.NoError(t, err)
		var output map[string]any
		require.NoError(t, common.Unmarshal(rendered, &output))
		assert.Equal(t, "task_public", output["id"])
		for _, key := range []string{"content", "duration", "frames", "resolution", "ratio", "seed", "framespersecond", "generate_audio", "tools", "safety_identifier", "service_tier", "execution_expires_after", "usage"} {
			assert.Equal(t, alibabaObject(t, snapshot)[key], output[key], key)
		}
	}
	noFrame := maps.Clone(data)
	noFrame["content"] = map[string]any{"video_url": "https://example.com/video.mp4"}
	value, err = plugin.Engine.Call(t.Context(), "listArtifacts", map[string]any{"status": "SUCCESS", "data": noFrame})
	require.NoError(t, err)
	encoded, err = common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"key":"video","type":"video","mimeType":"video/mp4"}]`, string(encoded))
	_, err = plugin.Engine.Call(t.Context(), "buildContentRequest", map[string]any{"data": noFrame, "artifactKey": "last_frame", "clientRequest": map[string]any{"method": "GET"}})
	require.ErrorContains(t, err, "artifact_not_found")
	data["error"] = map[string]any{"code": "InvalidParameter", "message": "raw provider error"}
	view["status"], view["fail_reason"] = "FAILURE", "polling failed"
	value, err = plugin.Engine.CallMember(t.Context(), "native", "taskStatus", map[string]any{}, view)
	require.NoError(t, err)
	assert.Equal(t, "failed", alibabaObject(t, value)["status"])
	assert.Equal(t, map[string]any{"code": "InvalidParameter", "message": "polling failed"}, alibabaObject(t, value)["error"])
}
