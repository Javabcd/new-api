package controller

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func VideoPlaygroundModels(c *gin.Context) {
	group, groups, err := service.VideoPlaygroundGroup(c.GetString("user_group"), c.Query("group"))
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": err.Error()})
		return
	}
	options, err := service.VideoPlaygroundModels(jsplugin.DefaultRegistry.Generation(), groups)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Video models are unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"group": group, "models": options}})
}

func SubmitVideoPlayground(c *gin.Context) {
	value, _ := c.Get("video_playground_submission")
	record, ok := value.(*model.VideoPlaygroundSubmission)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Submission storage is unavailable"})
		return
	}
	c.Set("video_playground_executed", true)
	// The durable deduplication barrier exists before this bounded execution.
	// A browser disconnect cannot cancel insertion after upstream acceptance.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 16*time.Minute)
	defer cancel()
	c.Request = c.Request.WithContext(ctx)
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		_ = model.FinishVideoPlaygroundSubmission(ctx, record.ID, "rejected", "invalid_request")
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid video request"})
		return
	}
	info.PublicTaskID = record.TaskID
	info.Action = c.GetString("task_action")
	outcome, taskErr := executeTaskSubmission(c, info)
	rejectionValue, _ := c.Get("video_playground_upstream_rejection")
	rejection, _ := rejectionValue.(*dto.TaskError)
	if rejection != nil {
		taskErr = rejection
	}
	state, code := "accepted", ""
	if taskErr != nil {
		state, code = "rejected", taskErr.Code
		if c.GetBool("video_playground_upstream_attempted") && rejection == nil {
			state, code = "unknown", "submission_unknown"
		}
		// A failure after the existing persistence barrier still has a task.
		if _, exists, _ := model.GetByTaskId(record.UserID, record.TaskID); exists {
			state, code = "accepted", ""
		}
	}
	// A deadline can expire during execution; give the bookkeeping a separate
	// short bound. Never release the key for another upstream POST.
	finishCtx, finishCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer finishCancel()
	if err := model.FinishVideoPlaygroundSubmission(finishCtx, record.ID, state, code); err != nil {
		common.SysError("video submission bookkeeping failed: " + err.Error())
	}
	if taskErr != nil && state == "rejected" {
		respondTaskSubmissionError(c, taskErr)
		return
	}
	data := gin.H{"task_id": record.TaskID, "state": state, "error_code": code}
	if outcome != nil {
		data["task"] = videoPlaygroundTaskView(outcome.Task)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func VideoPlaygroundSubmission(c *gin.Context) {
	record, err := model.GetVideoPlaygroundSubmission(c.Request.Context(), c.GetInt("id"), c.Param("key"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Submission not found"})
		return
	}
	state := record.State
	if state == "pending" && time.Now().Unix()-record.CreatedAt > int64((16*time.Minute).Seconds()) {
		state = "unknown"
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"task_id": record.TaskID, "state": state, "error_code": record.ErrorCode}})
}

func VideoPlaygroundSubmissions(c *gin.Context) {
	records, err := model.GetUnresolvedVideoPlaygroundSubmissions(c.Request.Context(), c.GetInt("id"))
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Submission history is unavailable"})
		return
	}
	items := []gin.H{}
	for _, record := range records {
		state := record.State
		if state == "pending" && time.Now().Unix()-record.CreatedAt > int64((16*time.Minute).Seconds()) {
			state = "unknown"
		}
		items = append(items, gin.H{"task_id": record.TaskID, "state": state, "error_code": record.ErrorCode})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

func VideoPlaygroundTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	page = max(1, min(page, 10000))
	tasks, err := model.GetVideoPlaygroundTasks(c.Request.Context(), c.GetInt("id"), (page-1)*20, 20)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Task history is unavailable"})
		return
	}
	items := make([]gin.H, 0, len(tasks))
	for _, task := range tasks {
		items = append(items, videoPlaygroundTaskView(task))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

func videoPlaygroundTaskView(task *model.Task) gin.H {
	pluginKey := string(task.Platform)
	if execution := task.PrivateData.Execution; execution != nil && execution.TaskPlugin != nil {
		pluginKey = execution.TaskPlugin.Key
	}
	return gin.H{"task_id": task.TaskID, "plugin_key": pluginKey, "model": task.Properties.OriginModelName, "status": task.Status, "created_at": task.SubmitTime, "finish_time": task.FinishTime}
}
