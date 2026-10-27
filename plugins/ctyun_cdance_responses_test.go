package plugins_test

import (
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	taskplugin "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const ctyunModel = "cdance2.5-0807"

func newCTYunPlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("ctyun-cdance")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "ctyun-cdance"})
	require.NoError(t, err)
	return plugin
}

func TestCTYunUsageProfiles(t *testing.T) {
	plugin := newCTYunPlugin(t)
	for _, tc := range []struct {
		model       string
		resolutions []string
	}{
		{"cdance2.0-0807", []string{"480p", "720p", "1080p", "4k"}},
		{"cdance2.0-fast-0807", []string{"480p", "720p"}},
		{"cdance2.0-mini-0807", []string{"480p", "720p"}},
		{ctyunModel, []string{"480p", "720p", "1080p"}},
		{"cdance2.0-0813", []string{"480p", "720p", "1080p"}},
	} {
		t.Run(tc.model, func(t *testing.T) {
			schema, examples := plugin.Meta.UsageForModel(tc.model)
			assert.Len(t, schema, 3)
			assert.Equal(t, tc.resolutions, schema["resolution"].Enum)
			assert.Equal(t, plugin.Meta.UsageSchema["tokens"], schema["tokens"])
			assert.Equal(t, plugin.Meta.UsageSchema["video_input"], schema["video_input"])
			require.Len(t, examples, 2)
			for index, example := range examples {
				assert.Len(t, example.Facts, 3)
				assert.EqualValues(t, 238500, example.Facts["tokens"])
				assert.Equal(t, "720p", example.Facts["resolution"])
				assert.Equal(t, []string{"none", "video"}[index], example.Facts["video_input"])
			}

			capabilities, supported := service.VideoPlaygroundCapabilitiesFor(plugin, tc.model)
			require.True(t, supported)
			assert.Equal(t, tc.resolutions, capabilities.Resolutions)
		})
	}

	t.Run("legacy plugin remains available in the playground", func(t *testing.T) {
		legacy := *plugin
		legacy.Meta.Version = "1.0.0"
		capabilities, supported := service.VideoPlaygroundCapabilitiesFor(&legacy, ctyunModel)
		require.True(t, supported)
		assert.Equal(t, []string{"480p", "720p", "1080p"}, capabilities.Resolutions)
	})

	t.Run("unresolved model retains the default pricing metadata", func(t *testing.T) {
		schema, examples := plugin.Meta.UsageForModel("ambiguous-alias")
		assert.Equal(t, []string{"480p", "720p", "1080p", "4k"}, schema["resolution"].Enum)
		assert.Equal(t, plugin.Meta.UsageExamples, examples)
	})
}

func TestCTYunResponsesProtocol(t *testing.T) {
	testVideoResponsesProtocol(t, videoResponsesTestCase{
		pluginKey: "ctyun-cdance", model: ctyunModel,
		requestBody: map[string]any{"model": ctyunModel, "input": "a running fox", "seconds": 11, "resolution": "720p"},
		wantAction:  "text_to_video", wantRequest: map[string]any{"model": ctyunModel, "prompt": "a running fox", "seconds": float64(11)},
		wantUsageKeys: []string{"tokens", "resolution", "video_input"}, wantVendorName: "ctyun-cdance",
	})
}

func TestCTYunResponsesVideoInput(t *testing.T) {
	plugin := newCTYunPlugin(t)
	videoURL := "https://example.com/ref.mp4?signature=a%2Bb&expires=123"
	video := map[string]any{"type": "video_url", "role": "reference_video", "video_url": map[string]any{"url": videoURL}}
	assetVideo := map[string]any{"type": "video_url", "role": "reference_video", "video_url": map[string]any{"url": "asset://asset-video"}}
	metadataContent := []any{
		map[string]any{"type": "text", "text": "existing text"},
		map[string]any{"type": "image_url", "role": "first_frame", "image_url": map[string]any{"url": "asset://asset-frame"}},
		map[string]any{"type": "audio_url", "role": "reference_audio", "audio_url": map[string]any{"url": "https://example.com/audio.mp3"}},
		map[string]any{"type": "video_url", "role": "reference_video", "video_url": map[string]any{"url": "asset://existing-video"}},
	}
	for _, tc := range []struct {
		name        string
		input       []any
		metadata    map[string]any
		wantContent []any
	}{
		{
			name:        "input_video string",
			input:       []any{map[string]any{"type": "input_video", "video_url": " " + videoURL + " "}},
			wantContent: []any{video},
		},
		{
			name:        "input_video object",
			input:       []any{map[string]any{"type": "input_video", "video_url": map[string]any{"url": "asset://asset-video"}}},
			wantContent: []any{assetVideo},
		},
		{
			name:        "video_url string",
			input:       []any{map[string]any{"type": "video_url", "video_url": videoURL}},
			wantContent: []any{video},
		},
		{
			name:        "video_url object",
			input:       []any{video},
			wantContent: []any{video},
		},
		{
			name:        "message content object",
			input:       []any{map[string]any{"role": "user", "content": map[string]any{"type": "input_video", "video_url": "asset://asset-video"}}},
			wantContent: []any{assetVideo},
		},
		{
			name: "mixed media and metadata",
			input: []any{
				map[string]any{"role": "user", "content": []any{
					map[string]any{"type": "input_video", "video_url": "asset://asset-video"},
					map[string]any{"type": "input_image", "image_url": "https://example.com/image.png"},
					map[string]any{"type": "input_text", "text": "first prompt"},
				}},
				video,
				map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": "second prompt"}}},
			},
			metadata: map[string]any{"content": metadataContent, "watermark": false, "future_option": true},
			wantContent: append(append([]any{}, metadataContent...), assetVideo, video,
				map[string]any{"type": "image_url", "role": "reference_image", "image_url": map[string]any{"url": "https://example.com/image.png"}},
				map[string]any{"type": "text", "text": "first prompt\nsecond prompt"}),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := map[string]any{"model": ctyunModel, "input": tc.input, "seconds": 11, "resolution": "720p"}
			if tc.metadata != nil {
				request["metadata"] = tc.metadata
			}
			original, err := common.Marshal(request)
			require.NoError(t, err)
			want := map[string]any{"model": ctyunModel, "duration": 11, "resolution": "720p"}
			maps.Copy(want, tc.metadata)
			want["content"] = tc.wantContent
			// Channel selection and execution decode the same client body separately.
			for range 2 {
				value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
					"model": ctyunModel, "body": map[string]any{"kind": "json", "value": request},
				})
				require.NoError(t, err)
				intent := alibabaObject(t, value)
				assert.Equal(t, "image_to_video", intent["action"])
				value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
					"requestBody": intent["requestBody"], "upstreamModel": ctyunModel, "baseUrl": "https://ai.ctaigw.cn/v1",
				})
				require.NoError(t, err)
				assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value)["body"])
				value, err = plugin.Engine.Call(t.Context(), "extractUsage", map[string]any{
					"requestBody": intent["requestBody"], "upstreamModel": ctyunModel,
				})
				require.NoError(t, err)
				assert.Equal(t, map[string]any{"tokens": float64(237600), "resolution": "720p", "video_input": "video"}, alibabaObject(t, value))
			}
			after, err := common.Marshal(request)
			require.NoError(t, err)
			assert.JSONEq(t, string(original), string(after))
		})
	}

	for _, tc := range []struct {
		name      string
		part      map[string]any
		metadata  any
		wantError string
	}{
		{name: "missing URL", part: map[string]any{"type": "input_video"}},
		{name: "null URL", part: map[string]any{"type": "input_video", "video_url": nil}},
		{name: "empty URL", part: map[string]any{"type": "video_url", "video_url": ""}},
		{name: "blank URL", part: map[string]any{"type": "input_video", "video_url": " \t\n"}},
		{name: "number URL", part: map[string]any{"type": "input_video", "video_url": 42}},
		{name: "array URL", part: map[string]any{"type": "video_url", "video_url": []any{videoURL}}},
		{name: "object without URL", part: map[string]any{"type": "input_video", "video_url": map[string]any{}}},
		{name: "non-string object URL", part: map[string]any{"type": "video_url", "video_url": map[string]any{"url": false}}},
		{name: "invalid metadata", part: video, metadata: "invalid", wantError: "metadata must be an object"},
		{name: "invalid content", part: video, metadata: map[string]any{"content": "invalid"}, wantError: "content must be an array"},
		{name: "null content", part: video, metadata: map[string]any{"content": nil}, wantError: "content must be an array"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := map[string]any{
				"model": ctyunModel, "seconds": 11, "resolution": "720p",
				"input": []any{map[string]any{"type": "input_text", "text": "a cat"}, tc.part},
			}
			if tc.metadata != nil {
				request["metadata"] = tc.metadata
			}
			_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
				"model": ctyunModel, "body": map[string]any{"kind": "json", "value": request},
			})
			wantError := tc.wantError
			if wantError == "" {
				wantError = "video references must be non-empty URLs"
			}
			require.ErrorContains(t, err, wantError)
		})
	}
}

func TestCTYunSubmission(t *testing.T) {
	plugin := newCTYunPlugin(t)
	assert.Empty(t, plugin.Meta.ChannelTypes)
	assert.Equal(t, "https://ai.ctaigw.cn/v1", plugin.Meta.BaseURL)
	assert.ElementsMatch(t, []string{"cdance2.0-0807", "cdance2.0-fast-0807", "cdance2.0-mini-0807", ctyunModel, "cdance2.0-0813"}, plugin.Meta.Models)
	content := []any{
		map[string]any{"type": "text", "text": "first text"},
		map[string]any{"type": "image_url", "role": "reference_image", "image_url": map[string]any{"url": "asset://asset-test"}},
		map[string]any{"type": "video_url", "role": "reference_video", "video_url": map[string]any{"url": "https://example.com/ref.mp4"}},
		map[string]any{"type": "audio_url", "role": "reference_audio", "audio_url": map[string]any{"url": "https://example.com/ref.mp3"}},
		map[string]any{"type": "image_url", "role": "first_frame", "image_url": map[string]any{"url": "https://example.com/frame.png"}},
		map[string]any{"type": "text", "text": "last text"},
	}
	for _, surface := range []string{"native", "task", "openai_video", "openai_responses", "multipart"} {
		t.Run(surface, func(t *testing.T) {
			metadata := map[string]any{"content": content, "duration": 11, "resolution": "720P", "watermark": false, "generate_audio": false, "return_last_frame": true, "seed": 0, "service_tier": "default", "draft": false, "future_option": map[string]any{"enabled": true}}
			request := map[string]any{"model": "seedance-2.5", "metadata": metadata}
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
					protocol := surface
					if surface == "multipart" {
						encoded, marshalErr := common.Marshal(metadata)
						require.NoError(t, marshalErr)
						ctx["body"] = map[string]any{"kind": "multipart", "fields": map[string]any{"metadata": []string{string(encoded)}}}
						protocol = "openai_video"
					}
					value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{protocol, "decodeRequest"}, ctx)
				}
				require.NoError(t, err)
				intent := alibabaObject(t, value)
				assert.Equal(t, "seedance-2.5", intent["model"])
				request = intent["requestBody"].(map[string]any)
			}
			info := &relaycommon.RelayInfo{
				ChannelMeta:     &relaycommon.ChannelMeta{ChannelBaseUrl: "https://ai.ctaigw.cn/v1", UpstreamModelName: ctyunModel},
				OriginModelName: "seedance-2.5", TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
			}
			adaptor := taskplugin.New(plugin)
			adaptor.Init(info)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/tasks/ctyun-cdance", nil)
			c.Set("task_request", request)
			require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
			reader, err := adaptor.BuildRequestBody(c, info)
			require.NoError(t, err)
			encoded, err := io.ReadAll(reader)
			require.NoError(t, err)
			var body map[string]any
			require.NoError(t, common.Unmarshal(encoded, &body))
			want := maps.Clone(metadata)
			want["model"] = ctyunModel
			want["resolution"] = "720p"
			assert.Equal(t, alibabaObject(t, want), body)
			assert.Equal(t, "seedance-2.5", info.OriginModelName)
			url, err := adaptor.BuildRequestURL(info)
			require.NoError(t, err)
			assert.Equal(t, "https://ai.ctaigw.cn/v1/contents/generations/tasks", url)
			assert.NotContains(t, url, "/api/v3/")
			facts, err := adaptor.ExtractUsageFactsValidated(c, info)
			require.NoError(t, err)
			assert.Equal(t, float64(237600), facts["tokens"])
			assert.Equal(t, "720p", facts["resolution"])
			assert.Equal(t, "video", facts["video_input"])
		})
	}

	ctx := map[string]any{"model": ctyunModel, "upstreamModel": ctyunModel, "baseUrl": "https://ai.ctaigw.cn/v1/", "apiKey": "test-key", "taskId": "cgt-test",
		"requestBody": map[string]any{"model": ctyunModel, "prompt": "hello", "seconds": 11, "images": []string{"https://example.com/image.png"}, "metadata": map[string]any{"resolution": "720p"}}}
	value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
	require.NoError(t, err)
	descriptor := alibabaObject(t, value)
	assert.Equal(t, "Bearer test-key", descriptor["headers"].(map[string]any)["Authorization"])
	body := descriptor["body"].(map[string]any)
	assert.Equal(t, []any{map[string]any{"type": "image_url", "role": "reference_image", "image_url": map[string]any{"url": "https://example.com/image.png"}}, map[string]any{"type": "text", "text": "hello"}}, body["content"])
	value, err = plugin.Engine.Call(t.Context(), "buildQueryRequest", ctx)
	require.NoError(t, err)
	query := alibabaObject(t, value)
	assert.Equal(t, "https://ai.ctaigw.cn/v1/contents/generations/tasks/cgt-test", query["url"])
	assert.Equal(t, "Bearer test-key", query["headers"].(map[string]any)["Authorization"])
	request := ctx["requestBody"].(map[string]any)
	topLevel := map[string]any{"generate_audio": false, "ratio": "16:9", "watermark": false, "return_last_frame": true, "seed": 0, "service_tier": "default", "draft": false}
	maps.Copy(request, topLevel)
	value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
	require.NoError(t, err)
	body = alibabaObject(t, value)["body"].(map[string]any)
	for key, expected := range alibabaObject(t, topLevel) {
		assert.Equal(t, expected, body[key], key)
	}
	for _, id := range []any{nil, "", " ", 42} {
		_, err = plugin.Engine.Call(t.Context(), "parseSubmitResponse", ctx, map[string]any{"body": map[string]any{"id": id}})
		require.ErrorContains(t, err, "upstream task id is empty")
	}
	value, err = plugin.Engine.Call(t.Context(), "parseSubmitResponse", ctx, map[string]any{"body": map[string]any{"id": "cgt-test", "extra": true}})
	require.NoError(t, err)
	assert.Equal(t, map[string]any{"taskId": "cgt-test", "taskData": map[string]any{"id": "cgt-test", "extra": true}}, alibabaObject(t, value))
}

func TestCTYunUsageFacts(t *testing.T) {
	plugin := newCTYunPlugin(t)
	for _, tc := range []struct {
		name          string
		content       []any
		reportedInput string
		wantInput     string
	}{
		{name: "text", wantInput: "none"},
		{name: "image", content: []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "asset://image"}, "role": "reference_image"}}, wantInput: "none"},
		{name: "audio", content: []any{map[string]any{"type": "audio_url", "audio_url": map[string]any{"url": "https://example.com/audio.mp3"}, "role": "reference_audio"}}, wantInput: "none"},
		{name: "video URL overrides claimed absence", content: []any{map[string]any{"type": "video_url", "video_url": map[string]any{"url": "https://example.com/video.mp4"}, "role": "reference_video"}}, reportedInput: "none", wantInput: "video"},
		{name: "video asset", content: []any{map[string]any{"type": "video_url", "video_url": map[string]any{"url": "asset://video"}, "role": "reference_video"}}, wantInput: "video"},
		{name: "claimed presence without video", reportedInput: "video", wantInput: "none"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			metadata := map[string]any{}
			if tc.content != nil {
				metadata["content"] = tc.content
			}
			request := map[string]any{"model": ctyunModel, "prompt": "a cat", "seconds": 11, "resolution": "720p", "metadata": metadata}
			if tc.reportedInput != "" {
				request["video_input"] = tc.reportedInput
				metadata["video_input"] = tc.reportedInput
			}
			ctx := map[string]any{"requestBody": request, "upstreamModel": ctyunModel, "baseUrl": "https://ai.ctaigw.cn/v1"}
			value, err := plugin.Engine.Call(t.Context(), "extractUsage", ctx)
			require.NoError(t, err)
			assert.Equal(t, map[string]any{"tokens": float64(237600), "resolution": "720p", "video_input": tc.wantInput}, alibabaObject(t, value))
			value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", ctx)
			require.NoError(t, err)
			assert.NotContains(t, alibabaObject(t, value)["body"], "video_input")
		})
	}
}

func TestCTYunValidation(t *testing.T) {
	plugin := newCTYunPlugin(t)
	for _, tc := range []struct {
		name      string
		model     string
		request   map[string]any
		wantError string
	}{
		{"missing duration", ctyunModel, map[string]any{"resolution": "720p"}, "duration or seconds is required"},
		{"missing resolution", ctyunModel, map[string]any{"seconds": 11}, "resolution or size is required"},
		{"zero", ctyunModel, map[string]any{"seconds": 0, "resolution": "720p"}, "duration must be an integer"},
		{"fraction", ctyunModel, map[string]any{"seconds": 1.5, "resolution": "720p"}, "duration must be an integer"},
		{"overflow", ctyunModel, map[string]any{"metadata": map[string]any{"duration": relaycommon.MaxTaskDurationSeconds + 1, "resolution": "720p"}}, "duration must be an integer"},
		{"conflicting duration", ctyunModel, map[string]any{"seconds": 11, "metadata": map[string]any{"duration": 5, "resolution": "720p"}}, "conflicting duration"},
		{"conflicting resolution", ctyunModel, map[string]any{"seconds": 11, "size": "1920x1080", "metadata": map[string]any{"resolution": "720p"}}, "conflicting resolution"},
		{"bad size", ctyunModel, map[string]any{"seconds": 11, "size": "bad"}, "resolution must be"},
		{"fast 1080p", "cdance2.0-fast-0807", map[string]any{"seconds": 11, "resolution": "1080p"}, "resolution 1080p is not supported"},
		{"2.5 4k", ctyunModel, map[string]any{"seconds": 11, "resolution": "4k"}, "resolution 4k is not supported"},
		{"model case", "Cdance2.0-0807", map[string]any{"seconds": 11, "resolution": "720p"}, "unsupported CTYun model"},
		{"2.0 4k", "cdance2.0-0807", map[string]any{"seconds": 11, "resolution": "4K"}, ""},
		{"normalize", ctyunModel, map[string]any{"seconds": "11", "metadata": map[string]any{"resolution": "720P"}}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := maps.Clone(tc.request)
			request["model"], request["prompt"] = tc.model, "a cat"
			value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"requestBody": request, "upstreamModel": tc.model, "baseUrl": "https://ai.ctaigw.cn/v1"})
			if tc.wantError != "" {
				require.ErrorContains(t, err, tc.wantError)
				return
			}
			require.NoError(t, err)
			body := alibabaObject(t, value)["body"].(map[string]any)
			assert.Contains(t, []string{"720p", "4k"}, body["resolution"])
		})
	}
	for _, tc := range []struct {
		name      string
		reference any
		wantError string
	}{
		{"missing video object", nil, "video_url must be an object"},
		{"string video object", "https://example.com/video.mp4", "video_url must be an object"},
		{"array video object", []any{"https://example.com/video.mp4"}, "video_url must be an object"},
		{"missing video URL", map[string]any{}, "video references must be non-empty URLs"},
		{"blank video URL", map[string]any{"url": " \t"}, "video references must be non-empty URLs"},
		{"numeric video URL", map[string]any{"url": 42}, "video references must be non-empty URLs"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
				"upstreamModel": ctyunModel,
				"requestBody": map[string]any{
					"seconds": 11, "resolution": "720p", "prompt": "a cat",
					"metadata": map[string]any{"content": []any{map[string]any{"type": "video_url", "video_url": tc.reference}}},
				},
			})
			require.ErrorContains(t, err, tc.wantError)
		})
	}
	for _, fields := range []map[string]any{
		{"seconds": []string{"11", "12"}, "size": []string{"720p"}},
		{"seconds": []string{"3601"}, "size": []string{"720p"}},
		{"seconds": []string{"11"}, "metadata": []string{`{"duration":0,"resolution":"720p"}`}},
		{"seconds": []string{"11"}},
	} {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": ctyunModel, "body": map[string]any{"kind": "multipart", "fields": fields}})
		require.Error(t, err)
	}
	value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"model": ctyunModel, "body": map[string]any{"kind": "multipart", "fields": map[string]any{
			"prompt": []string{"a cat"}, "seconds": []string{"11"}, "size": []string{"1280x720"},
			"watermark": []string{"false"}, "return_last_frame": []string{"true"}, "seed": []string{"0"},
		}},
	})
	require.NoError(t, err)
	value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
		"requestBody": alibabaObject(t, value)["requestBody"], "baseUrl": "https://ai.ctaigw.cn/v1",
	})
	require.NoError(t, err)
	body := alibabaObject(t, value)["body"].(map[string]any)
	assert.Equal(t, false, body["watermark"])
	assert.Equal(t, true, body["return_last_frame"])
	assert.Equal(t, float64(0), body["seed"])
	assert.Equal(t, "720p", body["resolution"])
}

func TestCTYunCompletionAndArtifacts(t *testing.T) {
	plugin := newCTYunPlugin(t)
	adaptor := taskplugin.New(plugin)
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://ai.ctaigw.cn/v1"}})
	task := &model.Task{TaskID: "task_public", Properties: model.Properties{OriginModelName: "seedance-2.5", UpstreamModelName: ctyunModel}}
	for status, want := range map[string]string{"pending": "QUEUED", "queued": "QUEUED", "processing": "IN_PROGRESS", "running": "IN_PROGRESS", "succeeded": "SUCCESS", "failed": "FAILURE", "expired": "FAILURE", "cancelled": "FAILURE", "new-status": "UNKNOWN"} {
		t.Run(status, func(t *testing.T) {
			body := map[string]any{"status": status, "content": map[string]any{"video_url": "https://example.com/video.mp4"}, "usage": map[string]any{"completion_tokens": 238500, "total_tokens": 999999}, "resolution": "720p", "error": map[string]any{"code": "blocked", "message": "not allowed"}}
			encoded, err := common.Marshal(body)
			require.NoError(t, err)
			result, err := adaptor.ParseTaskResult(task, &http.Response{StatusCode: 200}, encoded)
			require.NoError(t, err)
			assert.Equal(t, want, result.Status)
			if want == "SUCCESS" {
				assert.Equal(t, "https://example.com/video.mp4", result.Url)
				assert.Equal(t, map[string]any{"tokens": float64(238500), "resolution": "720p"}, result.UsageFacts)
			}
			if want == "FAILURE" {
				assert.Equal(t, "blocked: not allowed", result.Reason)
			}
		})
	}
	for _, tc := range []struct {
		completion any
		total      any
		want       any
	}{
		{238500, 999999, float64(238500)}, {0, 999999, float64(0)}, {nil, 42, float64(42)}, {-1, 42, float64(42)},
		{1.5, 42, float64(42)}, {"12", 42, float64(42)}, {false, 42, float64(42)}, {2147483648, 42, float64(42)}, {nil, nil, nil},
	} {
		value, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{"status": "succeeded", "usage": map[string]any{"completion_tokens": tc.completion, "total_tokens": tc.total}, "resolution": "720P", "content": map[string]any{"resolution": "1080p"}})
		require.NoError(t, err)
		facts := alibabaObject(t, value)
		assert.Equal(t, tc.want, facts["tokens"])
		assert.Equal(t, "720p", facts["resolution"])
	}
	data := map[string]any{"id": "cgt-test", "status": "succeeded", "content": map[string]any{"video_url": "https://example.com/video.mp4?signature=a%2Bb", "last_frame_url": "https://example.com/frame.png?signature=c%2Bd"}, "usage": map[string]any{"completion_tokens": 238500}, "seed": 0, "priority": 0, "future_field": true}
	data["model"] = "upstream-internal-model"
	view := map[string]any{"task_id": "task_public", "status": "SUCCESS", "data": data, "properties": map[string]any{"origin_model_name": "seedance-2.5"}}
	value, err := plugin.Engine.Call(t.Context(), "listArtifacts", view)
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"key":"video","type":"video"},{"key":"last_frame","type":"image"}]`, string(encoded))
	for key, field := range map[string]string{"video": "video_url", "last_frame": "last_frame_url"} {
		for _, method := range []string{"GET", "HEAD"} {
			value, err := plugin.Engine.Call(t.Context(), "buildContentRequest", map[string]any{"data": data, "artifactKey": key, "apiKey": "must-not-leak", "clientRequest": map[string]any{"method": method}})
			require.NoError(t, err)
			assert.Equal(t, map[string]any{"url": data["content"].(map[string]any)[field], "method": method, "credentialless": true}, alibabaObject(t, value))
		}
	}
	value, err = plugin.Engine.CallMember(t.Context(), "native", "taskStatus", map[string]any{}, view)
	require.NoError(t, err)
	want := maps.Clone(data)
	want["id"] = "task_public"
	want["model"] = "seedance-2.5"
	assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value))
	value, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "render"}, map[string]any{}, view)
	require.NoError(t, err)
	assert.Equal(t, alibabaObject(t, want), alibabaObject(t, value))
}
