package middleware

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"regexp"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

var videoPlaygroundKeyPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{16,128}$`)

func VideoPlaygroundSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		identity, ok := GetSessionAuthIdentity(c)
		if !ok || c.GetBool("use_access_token") {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": "AUTH_SESSION_REQUIRED", "message": "A dashboard session is required"})
			return
		}
		if expected := c.GetHeader("X-Auth-Session"); expected != "" && expected != identity.SessionID {
			c.AbortWithStatusJSON(http.StatusConflict, gin.H{"success": false, "code": "AUTH_SESSION_MISMATCH", "message": "Dashboard session changed"})
			return
		}
		c.Next()
	}
}

func PrepareVideoPlayground() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.ContentType() != "application/json" {
			abortWithOpenAiMessage(c, http.StatusUnsupportedMediaType, "JSON body required")
			return
		}
		key := c.GetHeader("Idempotency-Key")
		if !videoPlaygroundKeyPattern.MatchString(key) {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "A valid Idempotency-Key is required")
			return
		}
		data, err := io.ReadAll(io.LimitReader(c.Request.Body, 128*1024+1))
		if err != nil || len(data) > 128*1024 {
			abortWithOpenAiMessage(c, http.StatusRequestEntityTooLarge, "Video request exceeds size limit")
			return
		}
		var request dto.VideoPlaygroundRequest
		if err := common.UnmarshalStrict(data, &request); err != nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "Invalid video request: "+err.Error())
			return
		}
		user, err := model.GetUserCache(c.GetInt("id"))
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "User context is unavailable")
			return
		}
		if user.Status != common.UserStatusEnabled {
			abortWithOpenAiMessage(c, http.StatusForbidden, "User is disabled")
			return
		}
		group, groups, err := service.VideoPlaygroundGroup(user.Group, request.Group)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusForbidden, err.Error())
			return
		}
		request.Group = group
		canonical, err := common.Marshal(request)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "Invalid video request")
			return
		}
		fingerprint := fmt.Sprintf("%x", sha256.Sum256(canonical))
		// Check replay before current availability: accepted tasks remain
		// recoverable when a provider, model, or channel is disabled later.
		if existing, err := model.GetVideoPlaygroundSubmission(c.Request.Context(), user.Id, key); err == nil {
			if existing.Fingerprint != fingerprint {
				abortWithOpenAiMessage(c, http.StatusConflict, "Idempotency key conflicts with another request")
				return
			}
			c.AbortWithStatusJSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"task_id": existing.TaskID, "state": existing.State, "error_code": existing.ErrorCode}})
			return
		}
		generation := jsplugin.DefaultRegistry.Generation()
		options, err := service.VideoPlaygroundModels(generation, groups)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusInternalServerError, "Video models are unavailable")
			return
		}
		var selected *dto.VideoPlaygroundModel
		for i := range options {
			if options[i].PluginKey == request.PluginKey && options[i].Model == request.Model {
				selected = &options[i]
				break
			}
		}
		if selected == nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "Video model is not supported")
			return
		}
		if !selected.Available {
			abortWithOpenAiMessage(c, http.StatusBadRequest, selected.DisabledReason)
			return
		}
		body, err := service.BuildVideoPlaygroundRequest(request, selected.Capabilities)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, err.Error())
			return
		}
		encoded, err := common.Marshal(body)
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "Invalid video parameters")
			return
		}
		user.WriteContext(c)
		common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
		if err := SetupContextForToken(c, &model.Token{UserId: user.Id, Name: "video-playground", Group: group, UnlimitedQuota: true}); err != nil {
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(encoded))
		c.Request.ContentLength = int64(len(encoded))
		c.Set(contextKeyTaskPluginEndpointModel, ModelRequest{Model: request.Model, Group: group})
		plugin, ok := generation.Get(request.PluginKey)
		if !ok {
			abortWithOpenAiMessage(c, http.StatusBadRequest, "Video plugin is unavailable")
			return
		}
		_, operation, _ := jsplugin.LookupHostProtocolOperation(http.MethodPost, "/v1/videos")
		binding := jsplugin.ProtocolBinding{Plugin: plugin, Protocol: "openai_video", Operation: operation, Model: request.Model}
		mapped := ""
		if selected.DeclaredModel != request.Model {
			mapped = selected.DeclaredModel
		}
		c.Set(jsplugin.ContextKeyPinnedEndpoint, jsplugin.PinnedEndpoint{Generation: generation, Plugin: plugin, Protocol: "openai_video", Operation: operation, Model: request.Model, MappedModel: mapped, Candidates: []jsplugin.ProtocolBinding{binding}})
		c.Set(jsplugin.ContextKeyPinnedPlugin, jsplugin.PinnedPlugin{Generation: generation, Plugin: plugin})
		c.Set("video_playground_request", request)
		c.Set("video_playground_fingerprint", fingerprint)
		c.Next()
	}
}

// VideoPlaygroundIdempotency runs after validation/rate limiting and before
// distribution. All instances contend on the same primary key in the main DB.
func VideoPlaygroundIdempotency() gin.HandlerFunc {
	return func(c *gin.Context) {
		record, claimed, err := model.BeginVideoPlaygroundSubmission(c.Request.Context(), c.GetInt("id"), c.GetHeader("Idempotency-Key"), c.GetString("video_playground_fingerprint"))
		if err != nil {
			abortWithOpenAiMessage(c, http.StatusServiceUnavailable, "Submission storage is unavailable")
			return
		}
		if !claimed {
			if record.Fingerprint != c.GetString("video_playground_fingerprint") {
				abortWithOpenAiMessage(c, http.StatusConflict, "Idempotency key conflicts with another request")
				return
			}
			c.AbortWithStatusJSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"task_id": record.TaskID, "state": record.State, "error_code": record.ErrorCode}})
			return
		}
		c.Set("video_playground_submission", record)
		c.Next()
		if !c.GetBool("video_playground_executed") {
			_ = model.FinishVideoPlaygroundSubmission(c.Request.Context(), record.ID, "rejected", "channel_unavailable")
		}
	}
}
