package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func SetVideoPlaygroundRouter(router *gin.Engine) {
	video := router.Group("/pg/video", middleware.RouteTag("relay"), middleware.UserAuth(), middleware.VideoPlaygroundSession())
	video.GET("/models", controller.VideoPlaygroundModels)
	video.GET("/tasks", controller.VideoPlaygroundTasks)
	video.GET("/submissions", controller.VideoPlaygroundSubmissions)
	video.GET("/submissions/:key", controller.VideoPlaygroundSubmission)
	video.POST("/tasks", middleware.SystemPerformanceCheck(), middleware.PrepareVideoPlayground(),
		middleware.PrepareTaskPluginEndpoint(), middleware.ModelRequestRateLimit(), middleware.VideoPlaygroundIdempotency(),
		middleware.Distribute(), controller.SubmitVideoPlayground)
}
