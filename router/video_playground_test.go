package router

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/plugins"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	mysqldialect "gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type videoPlaygroundFixture struct {
	engine       *gin.Engine
	access       string
	otherAccess  string
	requests     map[string][]map[string]any
	mu           sync.Mutex
	fail         bool
	loseResponse bool
	submitStatus int
	submitBody   string
	entered      chan struct{}
	release      chan struct{}
}

func newVideoPlaygroundFixture(t *testing.T, dsn string) *videoPlaygroundFixture {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousPath, previousMaster, previousRedis, previousMemory := common.SQLitePath, common.IsMasterNode, common.RedisEnabled, common.MemoryCacheEnabled
	previousBatch, previousLog, previousSecret := common.BatchUpdateEnabled, common.LogConsumeEnabled, common.CryptoSecret
	common.SQLitePath = t.TempDir() + "/video.db"
	common.IsMasterNode, common.RedisEnabled, common.MemoryCacheEnabled = false, false, false
	common.BatchUpdateEnabled, common.LogConsumeEnabled = false, true
	common.CryptoSecret = "video-test-secret-not-a-production-key"
	previousQueryLimit := constant.TaskQueryLimit
	constant.TaskQueryLimit = 50
	t.Cleanup(func() { constant.TaskQueryLimit = previousQueryLimit })
	t.Setenv("SQL_DSN", dsn)
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitDB())
	model.LOG_DB = model.DB
	db := model.DB
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.UserAccessToken{}, &model.Token{}, &model.Channel{}, &model.Ability{}, &model.Model{}, &model.Task{}, &model.Log{}, &model.AuditLog{}, &model.Option{}, &model.UserSubscription{}, &model.SubscriptionPlan{}, &model.SubscriptionPreConsumeRecord{}))
	// Representative pre-feature data must survive repeated startup migration.
	baseline := &model.Task{TaskID: "task_existing_image", UserId: 701, Platform: "doubao", Action: "text_to_image", Status: model.TaskStatusSuccess, Properties: model.Properties{OriginModelName: "seedream"}}
	baseline.SetData(map[string]any{"retained": true})
	require.NoError(t, db.Create(baseline).Error)
	for range 2 {
		require.NoError(t, db.AutoMigrate(&model.VideoPlaygroundSubmission{}))
	}
	var preserved model.Task
	require.NoError(t, db.First(&preserved, baseline.ID).Error)
	assert.JSONEq(t, string(baseline.Data), string(preserved.Data))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	versionQuery := "SELECT VERSION()"
	if dsn == "" {
		versionQuery = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
	t.Logf("database %s version %s", db.Dialector.Name(), version)
	if dsn == "" {
		sqlDB.SetMaxOpenConns(1)
	}
	t.Cleanup(func() {
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.SQLitePath, common.IsMasterNode, common.RedisEnabled, common.MemoryCacheEnabled = previousPath, previousMaster, previousRedis, previousMemory
		common.BatchUpdateEnabled, common.LogConsumeEnabled, common.CryptoSecret = previousBatch, previousLog, previousSecret
	})
	previousRegistry := jsplugin.DefaultRegistry
	jsplugin.DefaultRegistry = jsplugin.NewRegistry()
	t.Cleanup(func() { jsplugin.DefaultRegistry = previousRegistry })
	settings := config.GlobalConfig.Get("billing_setting").(*billing_setting.BillingSetting)
	previousSettings := *settings
	settings.BillingMode, settings.BillingExpr, settings.PluginBillingExpr = maps.Clone(settings.BillingMode), maps.Clone(settings.BillingExpr), maps.Clone(settings.PluginBillingExpr)
	t.Cleanup(func() { *settings = previousSettings })
	models := map[string]string{"doubao": "doubao-seedance-2-0-260128", "millu-seedance": "millu-sd-x-2-5-260801", "ctyun-cdance": "cdance2.0-0807", "moma-seedance": "doubao-seedance-2-0-260128"}
	for key, name := range models {
		source, err := plugins.Source(key)
		require.NoError(t, err)
		_, err = jsplugin.DefaultRegistry.RegisterFactory(source, jsplugin.Options{Key: key})
		require.NoError(t, err)
		settings.PluginBillingExpr[billing_setting.PluginBillingExprKey(key, name)] = `tier("video", u("tokens") * 0.000001)`
	}
	for _, id := range []int{701, 702} {
		require.NoError(t, db.Create(&model.User{Id: id, Username: fmt.Sprintf("video-user-%d", id), AffCode: fmt.Sprintf("v%d", id), Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 10000000, Group: "default", AuthVersion: 1}).Error)
	}
	user, err := service.CreateLoginSession(701, "password", "127.0.0.1", "test")
	require.NoError(t, err)
	other, err := service.CreateLoginSession(702, "password", "127.0.0.1", "test")
	require.NoError(t, err)
	f := &videoPlaygroundFixture{access: user.AccessToken, otherAccess: other.AccessToken, requests: make(map[string][]map[string]any)}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")[0]
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			var body map[string]any
			if err := common.DecodeJson(r.Body, &body); err != nil {
				http.Error(w, "bad body", 400)
				return
			}
			f.mu.Lock()
			f.requests[key] = append(f.requests[key], body)
			count, lose := len(f.requests[key]), f.loseResponse
			entered, release := f.entered, f.release
			submitStatus, submitBody := f.submitStatus, f.submitBody
			f.mu.Unlock()
			if entered != nil {
				close(entered)
				<-release
			}
			if lose {
				conn, _, err := w.(http.Hijacker).Hijack()
				if err == nil {
					_ = conn.Close()
				}
				return
			}
			if submitStatus != 0 {
				w.WriteHeader(submitStatus)
				_, _ = w.Write([]byte(submitBody))
				return
			}
			_, _ = fmt.Fprintf(w, `{"id":%q}`, fmt.Sprintf("%s-private-%d", key, count))
			return
		}
		f.mu.Lock()
		failed := f.fail
		f.mu.Unlock()
		status := "succeeded"
		if failed {
			status = "failed"
		}
		_, _ = fmt.Fprintf(w, `{"status":%q,"content":{"video_url":"https://cdn.example/video.mp4"},"usage":{"total_tokens":100,"completion_tokens":100},"error":{"code":"generation_failed","message":"test failure"}}`, status)
	}))
	t.Cleanup(server.Close)
	previousPoll := service.GetTaskAdaptorFunc
	service.GetTaskAdaptorFunc = func(platform constant.TaskPlatform) service.TaskPollingAdaptor { return relay.GetTaskAdaptor(platform) }
	t.Cleanup(func() { service.GetTaskAdaptorFunc = previousPoll })
	service.InitHttpClient()
	previousPublic, previousServer := system_setting.TaskPublicAddress, system_setting.ServerAddress
	system_setting.TaskPublicAddress, system_setting.ServerAddress = "https://gateway.example", "https://gateway.example"
	t.Cleanup(func() {
		system_setting.TaskPublicAddress, system_setting.ServerAddress = previousPublic, previousServer
	})
	for key, name := range models {
		base := server.URL + "/" + key
		setting := fmt.Sprintf(`{"task_plugin_key":%q}`, key)
		channel := &model.Channel{Type: constant.ChannelTypeTaskPlugin, Key: "upstream-test-secret", Status: common.ChannelStatusEnabled, Name: key, Models: name, Group: "default", BaseURL: &base, Setting: &setting, AutoBan: common.GetPointer(0), Priority: common.GetPointer(int64(0))}
		if key == "moma-seedance" {
			channel.Priority = common.GetPointer(int64(100))
		}
		require.NoError(t, channel.Insert())
	}
	f.engine = newVideoPlaygroundTestEngine()
	return f
}

func newVideoPlaygroundTestEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(middleware.BodyStorageCleanup())
	SetVideoPlaygroundRouter(engine)
	engine.GET("/api/task/:task_id/artifacts", middleware.UserAuth(), controller.GetDashboardTaskArtifacts)
	return engine
}

func (f *videoPlaygroundFixture) request(method, path, access, key string, body []byte) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	if access != "" {
		req.Header.Set("Authorization", "Bearer "+access)
	}
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	f.engine.ServeHTTP(w, req)
	return w
}

func videoPlaygroundBody(t *testing.T, key, name string, reference bool) []byte {
	t.Helper()
	p := dto.VideoPlaygroundParameters{GenerateAudio: common.GetPointer(false), Watermark: common.GetPointer(false)}
	if key != "moma-seedance" {
		p.Duration = common.GetPointer(5)
		p.Resolution = common.GetPointer("720p")
	}
	request := dto.VideoPlaygroundRequest{PluginKey: key, Model: name, Group: "default", Prompt: "A cat runs through a meadow", Parameters: p}
	if reference {
		request.Media = []dto.VideoPlaygroundMedia{{Type: "image", URL: "https://media.example/cat.png", Role: "reference_image"}}
	}
	body, err := common.Marshal(request)
	require.NoError(t, err)
	return body
}

func TestVideoPlaygroundProviderContracts(t *testing.T) {
	for _, database := range []struct{ name, env string }{{"sqlite", ""}, {"mysql", "VIDEO_PLAYGROUND_TEST_MYSQL_DSN"}, {"postgres", "VIDEO_PLAYGROUND_TEST_POSTGRES_DSN"}} {
		t.Run(database.name, func(t *testing.T) {
			dsn := os.Getenv(database.env)
			if database.env != "" && dsn == "" {
				t.Skip("isolated database DSN is not configured")
			}
			f := newVideoPlaygroundFixture(t, dsn)
			t.Run("catalog contains only configured available models", func(t *testing.T) {
				var channel model.Channel
				require.NoError(t, model.DB.Where("name = ?", "doubao").First(&channel).Error)
				settings := config.GlobalConfig.Get("billing_setting").(*billing_setting.BillingSetting)
				priceKey := billing_setting.PluginBillingExprKey("doubao", channel.Models)
				for _, test := range []struct {
					name, group, expression string
					status                  int
					visible                 bool
				}{
					{name: "configured models only", group: "default", status: common.ChannelStatusEnabled, visible: true},
					{name: "disabled channel is omitted", group: "default", status: common.ChannelStatusManuallyDisabled},
					{name: "another group is omitted", group: "video-other", status: common.ChannelStatusEnabled},
					{name: "invalid price is omitted", group: "default", status: common.ChannelStatusEnabled, expression: `tier("invalid", u("missing_field"))`},
				} {
					t.Run(test.name, func(t *testing.T) {
						originalPrice := settings.PluginBillingExpr[priceKey]
						t.Cleanup(func() {
							settings.PluginBillingExpr[priceKey] = originalPrice
							restore := channel
							require.NoError(t, restore.Update())
						})
						changed := channel
						changed.Group, changed.Status = test.group, test.status
						require.NoError(t, changed.Update())
						if test.expression != "" {
							settings.PluginBillingExpr[priceKey] = test.expression
						}
						response := f.request("GET", "/pg/video/models?group=default", f.access, "", nil)
						require.Equal(t, http.StatusOK, response.Code, response.Body.String())
						var result struct {
							Data struct {
								Models []dto.VideoPlaygroundModel `json:"models"`
							} `json:"data"`
						}
						require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
						keys := make([]string, 0, len(result.Data.Models))
						for _, option := range result.Data.Models {
							assert.True(t, option.Available, option.DisabledReason)
							keys = append(keys, option.PluginKey+"::"+option.Model)
						}
						expected := []string{"ctyun-cdance::cdance2.0-0807", "millu-seedance::millu-sd-x-2-5-260801", "moma-seedance::doubao-seedance-2-0-260128"}
						if test.visible {
							expected = append(expected, "doubao::"+channel.Models)
						}
						assert.ElementsMatch(t, expected, keys)
						options, err := service.VideoPlaygroundModels(jsplugin.DefaultRegistry.Generation(), []string{"default"})
						require.NoError(t, err)
						for _, option := range options {
							assert.NotEqual(t, "doubao-seedance-2-0-fast-260128", option.Model, "plugin defaults must not create unconfigured candidates")
						}
					})
				}
			})
			t.Run("catalog is empty when no channels are enabled", func(t *testing.T) {
				var channelIDs []int
				require.NoError(t, model.DB.Model(&model.Channel{}).Where("status = ?", common.ChannelStatusEnabled).Pluck("id", &channelIDs).Error)
				t.Cleanup(func() {
					require.NoError(t, model.DB.Model(&model.Channel{}).Where("id IN ?", channelIDs).Update("status", common.ChannelStatusEnabled).Error)
				})
				require.NoError(t, model.DB.Model(&model.Channel{}).Where("id IN ?", channelIDs).Update("status", common.ChannelStatusManuallyDisabled).Error)
				response := f.request("GET", "/pg/video/models", f.access, "", nil)
				require.Equal(t, http.StatusOK, response.Code, response.Body.String())
				assert.Contains(t, response.Body.String(), `"models":[]`)
			})
			t.Run("catalog visibility follows metadata rules for public aliases", func(t *testing.T) {
				var channel model.Channel
				require.NoError(t, model.DB.Where("name = ?", "doubao").First(&channel).Error)
				for _, test := range []struct {
					name     string
					metadata []model.Model
					visible  bool
				}{
					{name: "video-open", visible: true},
					{name: "video-exact-hidden", metadata: []model.Model{{ModelName: "video-exact-hidden"}}},
					{name: "video-prefix-hidden", metadata: []model.Model{{ModelName: "video-prefix-", NameRule: model.NameRulePrefix}}},
					{name: "video-suffix-hidden", metadata: []model.Model{{ModelName: "-hidden", NameRule: model.NameRuleSuffix}}},
					{name: "video-contains-hidden", metadata: []model.Model{{ModelName: "contains", NameRule: model.NameRuleContains}}},
					{name: "video-prefix-override", metadata: []model.Model{{ModelName: "video-prefix-", NameRule: model.NameRulePrefix}, {ModelName: "video-prefix-override", Status: 1}}, visible: true},
					{name: "video-precedence-ending", metadata: []model.Model{{ModelName: "-ending", NameRule: model.NameRuleSuffix}, {ModelName: "video-", NameRule: model.NameRulePrefix, Status: 1}}, visible: true},
					{name: "video-contains-ending", metadata: []model.Model{{ModelName: "contains", NameRule: model.NameRuleContains}, {ModelName: "-ending", NameRule: model.NameRuleSuffix, Status: 1}}, visible: true},
					{name: "video-public-alias", metadata: []model.Model{{ModelName: channel.Models}}, visible: true},
				} {
					t.Run(test.name, func(t *testing.T) {
						changed := channel
						changed.Models = test.name
						mapping, err := common.Marshal(map[string]string{test.name: channel.Models})
						require.NoError(t, err)
						changed.ModelMapping = common.GetPointer(string(mapping))
						t.Cleanup(func() {
							restore := channel
							require.NoError(t, restore.Update())
						})
						require.NoError(t, changed.Update())
						for _, metadata := range test.metadata {
							status := metadata.Status
							require.NoError(t, model.DB.Create(&metadata).Error)
							t.Cleanup(func() { require.NoError(t, model.DB.Unscoped().Delete(&metadata).Error) })
							// GORM's create default would otherwise replace an explicit zero.
							require.NoError(t, model.DB.Model(&metadata).Update("status", status).Error)
						}
						response := f.request("GET", "/pg/video/models?group=default", f.access, "", nil)
						require.Equal(t, http.StatusOK, response.Code, response.Body.String())
						if test.visible {
							assert.Contains(t, response.Body.String(), `"model":"`+test.name+`"`)
						} else {
							require.NotContains(t, response.Body.String(), `"model":"`+test.name+`"`)
							var before model.User
							require.NoError(t, model.DB.First(&before, 701).Error)
							response = f.request("POST", "/pg/video/tasks", f.access, "hidden_catalog_"+test.name, videoPlaygroundBody(t, "doubao", test.name, false))
							assert.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
							var after model.User
							require.NoError(t, model.DB.First(&after, 701).Error)
							assert.Equal(t, before.Quota, after.Quota)
							f.mu.Lock()
							assert.Empty(t, f.requests)
							f.mu.Unlock()
						}
					})
				}
			})
			t.Run("upstream rejection and ambiguous failures never resubmit", func(t *testing.T) {
				for _, test := range []struct {
					name   string
					status int
					body   string
					state  string
				}{
					{"invalid duration", 400, `{"error":{"message":"unsupported duration"}}`, "rejected"},
					{"invalid parameters", 422, `{"error":{"message":"unsupported resolution"}}`, "rejected"},
					{"rate limit", 429, `{"error":{"message":"rate limited"}}`, "rejected"},
					{"upstream timeout", 408, `{"error":{"message":"timeout"}}`, "unknown"},
					{"upstream conflict", 409, `{"error":{"message":"conflict"}}`, "unknown"},
					{"upstream cancellation", 499, `{"error":{"message":"cancelled"}}`, "unknown"},
					{"upstream server failure", 500, `{"error":{"message":"server error"}}`, "unknown"},
					{"upstream gateway failure", 502, `{"error":{"message":"gateway error"}}`, "unknown"},
					{"upstream redirect", 307, `{"error":{"message":"redirect"}}`, "unknown"},
					{"accepted malformed response", 200, `{`, "unknown"},
				} {
					t.Run(test.name, func(t *testing.T) {
						f.mu.Lock()
						f.submitStatus, f.submitBody = test.status, test.body
						beforeRequests := len(f.requests["moma-seedance"])
						f.mu.Unlock()
						t.Cleanup(func() {
							f.mu.Lock()
							f.submitStatus, f.submitBody = 0, ""
							f.mu.Unlock()
						})
						var before model.User
						require.NoError(t, model.DB.First(&before, 701).Error)
						key := fmt.Sprintf("upstream_status_%d_0000000000", test.status)
						body := videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false)
						response := f.request("POST", "/pg/video/tasks", f.access, key, body)
						if test.state == "rejected" {
							require.Equal(t, test.status, response.Code, response.Body.String())
							if test.status != 429 {
								assert.Contains(t, response.Body.String(), "unsupported")
							}
						} else {
							require.Equal(t, 200, response.Code, response.Body.String())
							assert.Contains(t, response.Body.String(), `"state":"unknown"`)
						}
						record, err := model.GetVideoPlaygroundSubmission(t.Context(), 701, key)
						require.NoError(t, err)
						assert.Equal(t, test.state, record.State)
						_, exists, err := model.GetByTaskId(701, record.TaskID)
						require.NoError(t, err)
						assert.False(t, exists)
						replay := f.request("POST", "/pg/video/tasks", f.access, key, body)
						require.Equal(t, 200, replay.Code, replay.Body.String())
						assert.Contains(t, replay.Body.String(), `"state":"`+test.state+`"`)
						f.mu.Lock()
						assert.Len(t, f.requests["moma-seedance"], beforeRequests+1)
						f.mu.Unlock()
						// BillingSession refunds asynchronously on every database.
						require.EventuallyWithT(t, func(collect *assert.CollectT) {
							var after model.User
							if assert.NoError(collect, model.DB.First(&after, 701).Error) {
								assert.Equal(collect, before.Quota, after.Quota)
							}
						}, 5*time.Second, 10*time.Millisecond)
					})
				}
			})
			t.Run("single provider stored expressions retain removed usage fields", func(t *testing.T) {
				const legacyModel = "doubao-seedance-1-0-pro-250528"
				const legacyAlias = "video-legacy-alias"
				const sharedModel = "doubao-seedance-2-0-260128"
				const sharedAlias = "video-shared-alias"
				var existing model.Channel
				require.NoError(t, model.DB.Where("name = ?", "doubao").First(&existing).Error)
				legacyChannel := existing
				legacyChannel.Id, legacyChannel.Name = 0, "doubao-legacy"
				legacyChannel.Models = strings.Join([]string{legacyModel, legacyAlias, sharedAlias}, ",")
				mapping := fmt.Sprintf(`{%q:%q,%q:%q}`, legacyAlias, legacyModel, sharedAlias, sharedModel)
				legacyChannel.ModelMapping = &mapping
				require.NoError(t, legacyChannel.Insert())
				settings := config.GlobalConfig.Get("billing_setting").(*billing_setting.BillingSetting)
				previous := maps.Clone(settings.PluginBillingExpr)
				t.Cleanup(func() { settings.PluginBillingExpr = previous })
				legacyKey := billing_setting.PluginBillingExprKey("doubao", legacyModel)
				settings.PluginBillingExpr[legacyKey] = `u("video_input") == "none" ? tier("legacy", u("tokens") * 0.000001) : tier("video", u("tokens") * 0.000002)`
				settings.PluginBillingExpr[billing_setting.PluginBillingExprKey("doubao", sharedModel)] = `tier("invalid", u("missing_field") * 0.001)`
				options, err := service.VideoPlaygroundModels(jsplugin.DefaultRegistry.Generation(), []string{"default"})
				require.NoError(t, err)
				byName := make(map[string]dto.VideoPlaygroundModel)
				for _, option := range options {
					if option.PluginKey == "doubao" {
						byName[option.Model] = option
					}
				}
				for _, name := range []string{sharedModel, sharedAlias} {
					require.Contains(t, byName, name)
					assert.False(t, byName[name].Available)
					assert.Equal(t, "model_price_error", byName[name].DisabledReason)
				}
				for _, name := range []string{legacyModel, legacyAlias} {
					require.Contains(t, byName, name)
					assert.True(t, byName[name].Available, byName[name].DisabledReason)
					body, err := common.Marshal(dto.VideoPlaygroundRequest{PluginKey: "doubao", Model: name, Group: "default", Prompt: "A cat runs through a meadow", Parameters: dto.VideoPlaygroundParameters{Duration: common.GetPointer(5), Resolution: common.GetPointer("720p")}})
					require.NoError(t, err)
					response := f.request("POST", "/pg/video/tasks", f.access, "legacy_expression_"+name, body)
					require.Equal(t, 200, response.Code, response.Body.String())
					assert.Contains(t, response.Body.String(), `"state":"accepted"`)
				}
				service.RunTaskPollingOnce(t.Context(), nil)
				for _, expression := range []string{"", `tier("broken",`, `tier("request", fixed(0.01))`} {
					settings.PluginBillingExpr[legacyKey] = expression
					options, err := service.VideoPlaygroundModels(jsplugin.DefaultRegistry.Generation(), []string{"default"})
					require.NoError(t, err)
					for _, option := range options {
						if option.PluginKey == "doubao" && option.Model == legacyModel {
							assert.False(t, option.Available, expression)
							assert.Equal(t, "model_price_error", option.DisabledReason)
						}
					}
				}
			})
			t.Run("duplicate channel abilities do not exhaust SQL variables", func(t *testing.T) {
				var channel model.Channel
				require.NoError(t, model.DB.Where("name = ?", "moma-seedance").First(&channel).Error)
				// SQLite accepts at most 32766 bind variables in its default build.
				// Each distinct chat model used to append the same channel ID.
				abilities := make([]model.Ability, 33000)
				for i := range abilities {
					abilities[i] = model.Ability{Group: "default", Model: fmt.Sprintf("video-review-chat-%d", i), ChannelId: channel.Id, Enabled: true}
				}
				require.NoError(t, model.DB.CreateInBatches(abilities, 128).Error)
				t.Cleanup(func() {
					require.NoError(t, model.DB.Where("channel_id = ? AND model LIKE ?", channel.Id, "video-review-chat-%").Delete(&model.Ability{}).Error)
				})
				response := f.request("GET", "/pg/video/models", f.access, "", nil)
				require.Equal(t, 200, response.Code, response.Body.String())
				assert.Contains(t, response.Body.String(), "moma-seedance")
				response = f.request("POST", "/pg/video/tasks", f.access, "catalog_duplicate_abilities_0000", videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false))
				require.Equal(t, 200, response.Code, response.Body.String())
				assert.Contains(t, response.Body.String(), `"state":"accepted"`)
				service.RunTaskPollingOnce(t.Context(), nil)
			})
			for _, test := range []struct{ key, name string }{{"doubao", "doubao-seedance-2-0-260128"}, {"millu-seedance", "millu-sd-x-2-5-260801"}, {"ctyun-cdance", "cdance2.0-0807"}, {"moma-seedance", "doubao-seedance-2-0-260128"}} {
				for _, reference := range []bool{false, true} {
					t.Run(fmt.Sprintf("%s/reference=%t", test.key, reference), func(t *testing.T) {
						key := fmt.Sprintf("intent_%s_%t_000000", test.key, reference)
						payload := videoPlaygroundBody(t, test.key, test.name, reference)
						before := &model.User{}
						require.NoError(t, model.DB.First(before, 701).Error)
						response := f.request("POST", "/pg/video/tasks", f.access, key, payload)
						require.Equal(t, 200, response.Code, response.Body.String())
						var result struct {
							Data struct {
								TaskID string `json:"task_id"`
								State  string `json:"state"`
							} `json:"data"`
						}
						require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
						require.Equal(t, "accepted", result.Data.State, response.Body.String())
						assert.NotContains(t, response.Body.String(), "private-")
						assert.NotContains(t, response.Body.String(), "upstream-test-secret")
						task, exists, err := model.GetByTaskId(701, result.Data.TaskID)
						require.NoError(t, err)
						require.True(t, exists)
						assert.Equal(t, test.key, string(task.Platform))
						assert.Equal(t, test.key, task.PrivateData.Execution.TaskPlugin.Key)
						assert.Equal(t, 0, task.PrivateData.TokenId)
						assert.Equal(t, "wallet", task.PrivateData.BillingSource)
						f.mu.Lock()
						upstream := f.requests[test.key][len(f.requests[test.key])-1]
						f.mu.Unlock()
						assert.Equal(t, false, upstream["generate_audio"])
						assert.Equal(t, false, upstream["watermark"])
						assert.NotContains(t, upstream, "seconds")
						if test.key == "moma-seedance" {
							assert.NotContains(t, upstream, "duration")
							assert.NotContains(t, upstream, "resolution")
							assert.Equal(t, "doubao-seedance-2.0", upstream["model"])
						} else {
							assert.Equal(t, float64(5), upstream["duration"])
							assert.Equal(t, "720p", upstream["resolution"])
						}
						content := upstream["content"].([]any)
						texts, images := 0, 0
						for _, raw := range content {
							item := raw.(map[string]any)
							if item["type"] == "text" {
								texts++
								assert.Equal(t, "A cat runs through a meadow", item["text"])
							}
							if item["type"] == "image_url" {
								images++
								assert.Equal(t, "reference_image", item["role"])
								assert.Equal(t, "https://media.example/cat.png", item["image_url"].(map[string]any)["url"])
							}
						}
						assert.Equal(t, 1, texts)
						wantImages := 0
						if reference {
							wantImages = 1
						}
						assert.Equal(t, wantImages, images)
						if test.key == "doubao" && !reference {
							metadata := model.Model{ModelName: test.name, Status: 1}
							require.NoError(t, model.DB.Create(&metadata).Error)
							t.Cleanup(func() { require.NoError(t, model.DB.Unscoped().Delete(&metadata).Error) })
							require.NoError(t, model.DB.Model(&metadata).Update("status", 0).Error)
							catalog := f.request("GET", "/pg/video/models", f.access, "", nil)
							require.Equal(t, http.StatusOK, catalog.Code, catalog.Body.String())
							assert.NotContains(t, catalog.Body.String(), `"model":"`+test.name+`"`)
							f.mu.Lock()
							beforeRequests := len(f.requests[test.key])
							f.mu.Unlock()
							var beforeHidden model.User
							require.NoError(t, model.DB.First(&beforeHidden, 701).Error)
							rejected := f.request("POST", "/pg/video/tasks", f.access, "new_hidden_model_intent_0000", payload)
							assert.Equal(t, http.StatusBadRequest, rejected.Code, rejected.Body.String())
							var afterHidden model.User
							require.NoError(t, model.DB.First(&afterHidden, 701).Error)
							assert.Equal(t, beforeHidden.Quota, afterHidden.Quota)
							f.mu.Lock()
							assert.Len(t, f.requests[test.key], beforeRequests)
							f.mu.Unlock()
						}
						replay := f.request("POST", "/pg/video/tasks", f.access, key, payload)
						require.Equal(t, 200, replay.Code, replay.Body.String())
						assert.Contains(t, replay.Body.String(), task.TaskID)
						service.RunTaskPollingOnce(t.Context(), nil)
						done, _, err := model.GetByTaskId(701, task.TaskID)
						require.NoError(t, err)
						assert.Equal(t, model.TaskStatus(model.TaskStatusSuccess), done.Status)
						artifacts := f.request("GET", "/api/task/"+task.TaskID+"/artifacts", f.access, "", nil)
						require.Equal(t, 200, artifacts.Code, artifacts.Body.String())
						assert.Contains(t, artifacts.Body.String(), "content_url")
						assert.NotContains(t, artifacts.Body.String(), "cdn.example")
						assert.Equal(t, 404, f.request("GET", "/api/task/"+task.TaskID+"/artifacts", f.otherAccess, "", nil).Code)
						after := &model.User{}
						require.NoError(t, model.DB.First(after, 701).Error)
						assert.Equal(t, done.Quota, before.Quota-after.Quota)
						service.RunTaskPollingOnce(t.Context(), nil)
						var again model.User
						require.NoError(t, model.DB.First(&again, 701).Error)
						assert.Equal(t, after.Quota, again.Quota)
					})
				}
			}
			t.Run("failed tasks refund once for each provider", func(t *testing.T) {
				f.mu.Lock()
				f.fail = true
				f.mu.Unlock()
				var before model.User
				require.NoError(t, model.DB.First(&before, 701).Error)
				for _, provider := range []struct{ key, name string }{{"doubao", "doubao-seedance-2-0-260128"}, {"millu-seedance", "millu-sd-x-2-5-260801"}, {"ctyun-cdance", "cdance2.0-0807"}, {"moma-seedance", "doubao-seedance-2-0-260128"}} {
					response := f.request("POST", "/pg/video/tasks", f.access, "failed_"+provider.key+"_0000000000", videoPlaygroundBody(t, provider.key, provider.name, false))
					require.Equal(t, 200, response.Code, response.Body.String())
				}
				service.RunTaskPollingOnce(t.Context(), nil)
				var failures int64
				require.NoError(t, model.DB.Model(&model.Task{}).Where("user_id = ? AND status = ?", 701, model.TaskStatusFailure).Count(&failures).Error)
				assert.Equal(t, int64(4), failures)
				var after model.User
				require.NoError(t, model.DB.First(&after, 701).Error)
				assert.Equal(t, before.Quota, after.Quota)
				service.RunTaskPollingOnce(t.Context(), nil)
				require.NoError(t, model.DB.First(&after, 701).Error)
				assert.Equal(t, before.Quota, after.Quota)
			})
			t.Run("concurrent durable keys survive repeated migration", func(t *testing.T) {
				type claim struct {
					record *model.VideoPlaygroundSubmission
					won    bool
					err    error
				}
				results := make(chan claim, 2)
				start := make(chan struct{})
				for range 2 {
					go func() {
						<-start
						record, won, err := model.BeginVideoPlaygroundSubmission(t.Context(), 701, "concurrent_database_key_0000", "same_fingerprint")
						results <- claim{record, won, err}
					}()
				}
				close(start)
				first, second := <-results, <-results
				require.NoError(t, first.err)
				require.NoError(t, second.err)
				assert.NotEqual(t, first.won, second.won)
				assert.Equal(t, first.record.TaskID, second.record.TaskID)
				for range 2 {
					require.NoError(t, model.DB.AutoMigrate(&model.VideoPlaygroundSubmission{}))
				}
				stored, won, err := model.BeginVideoPlaygroundSubmission(t.Context(), 701, "concurrent_database_key_0000", "same_fingerprint")
				require.NoError(t, err)
				assert.False(t, won)
				assert.Equal(t, first.record.TaskID, stored.TaskID)
			})
			if database.name == "mysql" {
				t.Run("clientFoundRows cannot claim an existing intent", func(t *testing.T) {
					connection, err := mysqldriver.ParseDSN(dsn)
					require.NoError(t, err)
					connection.ClientFoundRows = true
					foundRowsDB, err := gorm.Open(mysqldialect.Open(connection.FormatDSN()), &gorm.Config{})
					require.NoError(t, err)
					previous := model.DB
					model.DB = foundRowsDB
					t.Cleanup(func() {
						model.DB = previous
						db, err := foundRowsDB.DB()
						require.NoError(t, err)
						require.NoError(t, db.Close())
					})
					first, won, err := model.BeginVideoPlaygroundSubmission(t.Context(), 701, "found_rows_intent_000000", "same_fingerprint")
					require.NoError(t, err)
					require.True(t, won)
					replay, won, err := model.BeginVideoPlaygroundSubmission(t.Context(), 701, "found_rows_intent_000000", "same_fingerprint")
					require.NoError(t, err)
					assert.False(t, won)
					assert.Equal(t, first.TaskID, replay.TaskID)
				})
			}
			t.Run("history includes legacy video actions and excludes images and other users", func(t *testing.T) {
				cases := []struct {
					id       string
					platform constant.TaskPlatform
					action   string
					userID   int
					visible  bool
				}{
					{"task_history_legacy_i2v", "54", "generate", 701, true},
					{"task_history_legacy_t2v", "54", "textGenerate", 701, true},
					{"task_history_canonical_i2v", "doubao", constant.TaskActionImageToVideo, 701, true},
					{"task_history_canonical_t2v", "moma-seedance", constant.TaskActionTextToVideo, 701, true},
					{"task_history_text_image", "doubao", "text_to_image", 701, false},
					{"task_history_image_image", "54", "image_to_image", 701, false},
					{"task_history_other_user", "54", "generate", 702, false},
					{"task_history_other_provider", "vidu", "generate", 701, false},
				}
				for _, test := range cases {
					require.NoError(t, model.DB.Create(&model.Task{
						TaskID: test.id, UserId: test.userID, Platform: test.platform, Action: test.action,
						Status: model.TaskStatusSuccess, Properties: model.Properties{OriginModelName: "doubao-seedance-2-0-260128"},
					}).Error)
				}
				response := f.request("GET", "/pg/video/tasks", f.access, "", nil)
				require.Equal(t, http.StatusOK, response.Code, response.Body.String())
				var result struct {
					Success bool `json:"success"`
					Data    []struct {
						TaskID string `json:"task_id"`
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				require.True(t, result.Success)
				ids := make([]string, 0, len(result.Data))
				for _, task := range result.Data {
					ids = append(ids, task.TaskID)
				}
				for _, test := range cases {
					if test.visible {
						assert.Contains(t, ids, test.id)
					} else {
						assert.NotContains(t, ids, test.id)
					}
				}
				assert.NotContains(t, ids, "task_existing_image")
			})
		})
	}
}

func TestVideoPlaygroundIsolationAndValidation(t *testing.T) {
	f := newVideoPlaygroundFixture(t, "")
	body := videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false)
	for _, test := range []struct {
		name, body string
		status     int
	}{
		{"unknown parameter", strings.Replace(string(body), `"parameters":{`, `"parameters":{"frames":24,`, 1), 400},
		{"duplicate quantity", strings.Replace(string(body), `"parameters":{`, `"parameters":{"duration":5,"duration":10,`, 1), 400},
		{"case variant duplicate quantity", strings.Replace(string(body), `"parameters":{`, `"parameters":{"duration":5,"Duration":10,`, 1), 400},
		{"conflicting seconds", strings.Replace(string(body), `"parameters":{`, `"parameters":{"duration":5,"seconds":10,`, 1), 400},
		{"zero quantity", strings.Replace(string(body), `"parameters":{`, `"parameters":{"duration":0,`, 1), 400},
		{"overflow quantity", strings.Replace(string(body), `"parameters":{`, `"parameters":{"duration":18446744073709551615,`, 1), 400},
		{"unsupported resolution", strings.Replace(string(body), `"parameters":{`, `"parameters":{"resolution":"720p",`, 1), 400},
		{"group access", strings.Replace(string(body), `"default"`, `"secret-admin-group"`, 1), 403},
		{"metadata bypass", strings.TrimSuffix(string(body), "}") + `,"metadata":{"model":"evil"}}`, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := f.request("POST", "/pg/video/tasks", f.access, "invalid_submission_0000", []byte(test.body))
			assert.Equal(t, test.status, response.Code, response.Body.String())
		})
	}
	assert.Equal(t, 401, f.request("GET", "/pg/video/models", "", "", nil).Code)
	assert.Equal(t, 401, f.request("POST", "/pg/video/tasks", "", "valid_key_000000000", body).Code)
	pat := "nap_video_personal_access_test"
	require.NoError(t, model.DB.Create(&model.UserAccessToken{UserId: 701, TokenHash: model.AccessTokenFingerprint(pat), Name: "test", Scopes: `["usage:read"]`}).Error)
	assert.Equal(t, 403, f.request("GET", "/pg/video/models", pat, "", nil).Code)
	assert.Equal(t, 403, f.request("POST", "/pg/video/tasks", pat, "valid_key_000000000", body).Code)
	f.mu.Lock()
	assert.Empty(t, f.requests)
	f.mu.Unlock()
	models := f.request("GET", "/pg/video/models", f.access, "", nil)
	require.Equal(t, 200, models.Code, models.Body.String())
	assert.Contains(t, models.Body.String(), "moma-seedance")
	assert.NotContains(t, models.Body.String(), "upstream-test-secret")
	assert.NotContains(t, models.Body.String(), "base_url")
}

func TestVideoPlaygroundConcurrentReplayAndUnknownResult(t *testing.T) {
	f := newVideoPlaygroundFixture(t, "")
	key := "same_intent_two_instances_0000"
	payload := videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false)
	f.entered, f.release = make(chan struct{}), make(chan struct{})
	firstDone := make(chan *httptest.ResponseRecorder, 1)
	go func() { firstDone <- f.request("POST", "/pg/video/tasks", f.access, key, payload) }()
	select {
	case <-f.entered:
	case <-time.After(10 * time.Second):
		t.Fatal("submission did not reach upstream")
	}
	secondEngine := newVideoPlaygroundTestEngine()
	req := httptest.NewRequest("POST", "/pg/video/tasks", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+f.access)
	req.Header.Set("Idempotency-Key", key)
	req.Header.Set("Content-Type", "application/json")
	second := httptest.NewRecorder()
	secondEngine.ServeHTTP(second, req)
	require.Equal(t, 200, second.Code, second.Body.String())
	assert.Contains(t, second.Body.String(), "pending")
	conflict := f.request("POST", "/pg/video/tasks", f.access, key, bytes.Replace(payload, []byte("A cat runs"), []byte("A dog runs"), 1))
	assert.Equal(t, 409, conflict.Code)
	close(f.release)
	first := <-firstDone
	require.Equal(t, 200, first.Code, first.Body.String())
	f.mu.Lock()
	assert.Len(t, f.requests["moma-seedance"], 1)
	f.entered, f.release, f.loseResponse = nil, nil, true
	f.mu.Unlock()
	unknownKey := "lost_upstream_response_0000"
	unknown := f.request("POST", "/pg/video/tasks", f.access, unknownKey, payload)
	require.Equal(t, 200, unknown.Code, unknown.Body.String())
	assert.Contains(t, unknown.Body.String(), "unknown")
	replay := f.request("POST", "/pg/video/tasks", f.access, unknownKey, payload)
	assert.Contains(t, replay.Body.String(), "unknown")
	f.mu.Lock()
	assert.Len(t, f.requests["moma-seedance"], 2)
	f.mu.Unlock()
	assert.Equal(t, 404, f.request("GET", "/pg/video/submissions/"+unknownKey, f.otherAccess, "", nil).Code)
	assert.Contains(t, f.request("GET", "/pg/video/submissions", f.access, "", nil).Body.String(), "unknown")
	assert.NotContains(t, f.request("GET", "/pg/video/submissions", f.otherAccess, "", nil).Body.String(), "task_")
}

func TestVideoPlaygroundPersistenceFailureNeverResubmits(t *testing.T) {
	f := newVideoPlaygroundFixture(t, "")
	require.NoError(t, model.DB.Callback().Create().Before("gorm:create").Register("video_task_insert_failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "tasks" {
			tx.AddError(errors.New("injected task insert failure"))
		}
	}))
	t.Cleanup(func() { _ = model.DB.Callback().Create().Remove("video_task_insert_failure") })
	body := videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false)
	response := f.request("POST", "/pg/video/tasks", f.access, "insert_failure_intent_0000", body)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), "unknown")
	replay := f.request("POST", "/pg/video/tasks", f.access, "insert_failure_intent_0000", body)
	assert.Contains(t, replay.Body.String(), "unknown")
	f.mu.Lock()
	assert.Len(t, f.requests["moma-seedance"], 1)
	f.mu.Unlock()
}

func TestVideoPlaygroundCapabilitiesVersionContract(t *testing.T) {
	for _, test := range []struct {
		name, plugin, version, model string
		supported                    bool
	}{
		{"moma current version", "moma-seedance", "1.3.0", "doubao-seedance-2-0-260128", true},
		{"moma upstream model alias", "moma-seedance", "1.3.0", "doubao-seedance-2.0", true},
		{"moma verified legacy version", "moma-seedance", "1.1.0", "doubao-seedance-2-0-260128", true},
		{"moma previous version", "moma-seedance", "1.0.0", "doubao-seedance-2-0-260128", false},
		{"moma unknown version", "moma-seedance", "1.1.1", "doubao-seedance-2-0-260128", false},
		{"moma unknown current patch", "moma-seedance", "1.3.1", "doubao-seedance-2-0-260128", false},
		{"doubao verified version", "doubao", "1.2.1", "doubao-seedance-2-0-260128", true},
		{"doubao unsupported version", "doubao", "1.1.0", "doubao-seedance-2-0-260128", false},
		{"ctyun verified version", "ctyun-cdance", "1.0.0", "cdance2.0-0807", true},
		{"ctyun unsupported version", "ctyun-cdance", "1.1.0", "cdance2.0-0807", false},
		{"millu verified version", "millu-seedance", "1.0.0", "millu-sd-x-2-5-260801", true},
		{"millu unsupported version", "millu-seedance", "1.1.0", "millu-sd-x-2-5-260801", false},
		{"unknown plugin", "unknown-plugin", "1.0.0", "doubao-seedance-2-0-260128", false},
		{"moma unknown model", "moma-seedance", "1.1.0", "unknown-video-model", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			plugin := &jsplugin.LoadedPlugin{Meta: jsplugin.Meta{Key: test.plugin, Version: test.version}}
			_, supported := service.VideoPlaygroundCapabilitiesFor(plugin, test.model)
			assert.Equal(t, test.supported, supported)
		})
	}
}

func TestVideoPlaygroundChannelIdentityAndAliases(t *testing.T) {
	for _, test := range []struct {
		name, plugin, model string
		typeID              int
		status              int
	}{
		{"legacy doubao", "doubao", "doubao-seedance-2-0-260128", constant.ChannelTypeDoubaoVideo, 200},
		{"moma cascade", "moma-seedance", "doubao-seedance-2-0-260128", constant.ChannelTypeNewAPI, 200},
		{"ctyun cascade is unsupported", "ctyun-cdance", "cdance2.0-0807", constant.ChannelTypeNewAPI, 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newVideoPlaygroundFixture(t, "")
			require.NoError(t, model.DB.Model(&model.Channel{}).Where("name = ?", test.plugin).Update("type", test.typeID).Error)
			if test.plugin == "moma-seedance" {
				catalog := f.request("GET", "/pg/video/models?group=default", f.access, "", nil)
				require.Equal(t, http.StatusOK, catalog.Code, catalog.Body.String())
				var result struct {
					Data struct {
						Models []dto.VideoPlaygroundModel `json:"models"`
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(catalog.Body.Bytes(), &result))
				var option *dto.VideoPlaygroundModel
				for i := range result.Data.Models {
					candidate := &result.Data.Models[i]
					if candidate.PluginKey == test.plugin && candidate.Model == test.model {
						option = candidate
						break
					}
				}
				require.NotNil(t, option, "MoMa model must appear in the video playground catalog")
				assert.Equal(t, "1.3.0", option.PluginVersion)
				assert.True(t, option.Available, option.DisabledReason)
			}
			response := f.request("POST", "/pg/video/tasks", f.access, "channel_identity_intent_0000", videoPlaygroundBody(t, test.plugin, test.model, false))
			require.Equal(t, test.status, response.Code, response.Body.String())
			f.mu.Lock()
			defer f.mu.Unlock()
			if test.status == 200 {
				assert.Len(t, f.requests[test.plugin], 1)
			} else {
				assert.Empty(t, f.requests)
			}
		})
	}
	t.Run("no fallback to another provider", func(t *testing.T) {
		f := newVideoPlaygroundFixture(t, "")
		require.NoError(t, model.DB.Model(&model.Channel{}).Where("name = ?", "doubao").Update("status", common.ChannelStatusManuallyDisabled).Error)
		response := f.request("POST", "/pg/video/tasks", f.access, "missing_doubao_channel_0000", videoPlaygroundBody(t, "doubao", "doubao-seedance-2-0-260128", false))
		assert.Equal(t, 400, response.Code, response.Body.String())
		f.mu.Lock()
		assert.Empty(t, f.requests)
		f.mu.Unlock()
	})
	t.Run("mapped public alias preserves billing identity", func(t *testing.T) {
		f := newVideoPlaygroundFixture(t, "")
		var channel model.Channel
		require.NoError(t, model.DB.Where("name = ?", "doubao").First(&channel).Error)
		channel.Models = "video-alias"
		channel.ModelMapping = common.GetPointer(`{"video-alias":"doubao-seedance-2-0-260128"}`)
		require.NoError(t, channel.Update())
		response := f.request("POST", "/pg/video/tasks", f.access, "mapped_public_alias_0000", videoPlaygroundBody(t, "doubao", "video-alias", false))
		require.Equal(t, 200, response.Code, response.Body.String())
		var task model.Task
		require.NoError(t, model.DB.Where("user_id = ? AND action = ?", 701, "text_to_video").First(&task).Error)
		assert.Equal(t, "video-alias", task.Properties.OriginModelName)
		assert.Equal(t, "doubao", task.PrivateData.Execution.TaskPlugin.Key)
		f.mu.Lock()
		assert.Equal(t, "doubao-seedance-2-0-260128", f.requests["doubao"][0]["model"])
		f.mu.Unlock()
	})
	for _, test := range []struct {
		name, mapping string
		secondChannel bool
	}{
		{"declared model mapped to an Ark endpoint", `{"doubao-seedance-2-0-fast-260128":"ep-video-test"}`, false},
		{"declared model mapped through a chain to an Ark endpoint", `{"doubao-seedance-2-0-fast-260128":"video-endpoint-alias","video-endpoint-alias":"ep-video-test"}`, false},
		{"matching channel endpoints remain available", `{"doubao-seedance-2-0-fast-260128":"ep-video-test"}`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newVideoPlaygroundFixture(t, "")
			const publicModel = "doubao-seedance-2-0-fast-260128"
			const endpoint = "ep-video-test"
			const endpointExpr = `tier("endpoint", u("tokens") * 0.000002)`
			settings := config.GlobalConfig.Get("billing_setting").(*billing_setting.BillingSetting)
			settings.PluginBillingExpr[billing_setting.PluginBillingExprKey("doubao", endpoint)] = endpointExpr
			var channel model.Channel
			require.NoError(t, model.DB.Where("name = ?", "doubao").First(&channel).Error)
			channel.Models = publicModel
			channel.ModelMapping = common.GetPointer(test.mapping)
			require.NoError(t, channel.Update())
			if test.secondChannel {
				channel.Id, channel.Name = 0, "doubao-second"
				require.NoError(t, channel.Insert())
			}
			catalog := f.request("GET", "/pg/video/models?group=default", f.access, "", nil)
			require.Equal(t, http.StatusOK, catalog.Code, catalog.Body.String())
			var result struct {
				Data struct {
					Models []dto.VideoPlaygroundModel `json:"models"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(catalog.Body.Bytes(), &result))
			var option *dto.VideoPlaygroundModel
			for i := range result.Data.Models {
				if result.Data.Models[i].PluginKey == "doubao" && result.Data.Models[i].Model == publicModel {
					option = &result.Data.Models[i]
					break
				}
			}
			require.NotNil(t, option)
			require.True(t, option.Available, option.DisabledReason)
			assert.Equal(t, []string{"480p", "720p"}, option.Capabilities.Resolutions)
			response := f.request("POST", "/pg/video/tasks", f.access, "mapped_ark_endpoint_0000", videoPlaygroundBody(t, "doubao", publicModel, false))
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			var task model.Task
			require.NoError(t, model.DB.Where("user_id = ? AND action = ?", 701, "text_to_video").First(&task).Error)
			assert.Equal(t, publicModel, task.Properties.OriginModelName)
			assert.Equal(t, endpoint, task.Properties.UpstreamModelName)
			require.NotNil(t, task.PrivateData.BillingContext)
			require.NotNil(t, task.PrivateData.BillingContext.TieredSnapshot)
			assert.Equal(t, endpointExpr, task.PrivateData.BillingContext.TieredSnapshot.ExprString)
			f.mu.Lock()
			defer f.mu.Unlock()
			require.Len(t, f.requests["doubao"], 1)
			assert.Equal(t, endpoint, f.requests["doubao"][0]["model"])
		})
	}
	for _, test := range []struct {
		name, firstMapping, secondMapping string
		firstPriority, secondPriority     int64
	}{
		{"different declared channel targets are disabled", "", `{"doubao-seedance-2-0-260128":"doubao-seedance-2-0-fast-260128"}`, 0, 100},
		{"different Ark channel endpoints are disabled", `{"doubao-seedance-2-0-260128":"ep-first"}`, `{"doubao-seedance-2-0-260128":"ep-second"}`, 0, 100},
		{"a higher priority unknown target disables a valid first channel", "", `{"doubao-seedance-2-0-260128":"unknown-video-model"}`, 0, 100},
		{"a higher priority unknown first channel disables a valid second channel", `{"doubao-seedance-2-0-260128":"unknown-video-model"}`, "", 100, 0},
		{"a cyclic target disables a valid first channel", "", `{"doubao-seedance-2-0-260128":"video-loop","video-loop":"doubao-seedance-2-0-260128"}`, 0, 100},
		{"a cyclic first channel keeps the model visible but disabled", `{"doubao-seedance-2-0-260128":"video-loop","video-loop":"doubao-seedance-2-0-260128"}`, "", 100, 0},
		{"an invalid JSON mapping keeps the model visible but disabled", "{", "", 100, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newVideoPlaygroundFixture(t, "")
			var channel model.Channel
			require.NoError(t, model.DB.Where("name = ?", "doubao").First(&channel).Error)
			channel.ModelMapping = common.GetPointer(test.firstMapping)
			channel.Priority = common.GetPointer(test.firstPriority)
			require.NoError(t, channel.Update())
			channel.Id, channel.Name = 0, "doubao-second"
			channel.ModelMapping = common.GetPointer(test.secondMapping)
			channel.Priority = common.GetPointer(test.secondPriority)
			require.NoError(t, channel.Insert())
			catalog := f.request("GET", "/pg/video/models?group=default", f.access, "", nil)
			require.Equal(t, http.StatusOK, catalog.Code, catalog.Body.String())
			var result struct {
				Data struct {
					Models []dto.VideoPlaygroundModel `json:"models"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(catalog.Body.Bytes(), &result))
			var option *dto.VideoPlaygroundModel
			for i := range result.Data.Models {
				if result.Data.Models[i].PluginKey == "doubao" && result.Data.Models[i].Model == "doubao-seedance-2-0-260128" {
					option = &result.Data.Models[i]
					break
				}
			}
			assert.Nil(t, option, "unavailable mappings must be omitted from the menu")
			var before model.User
			require.NoError(t, model.DB.First(&before, 701).Error)
			response := f.request("POST", "/pg/video/tasks", f.access, "ambiguous_mapping_intent_0000", videoPlaygroundBody(t, "doubao", "doubao-seedance-2-0-260128", false))
			assert.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
			assert.Contains(t, response.Body.String(), "ambiguous_model_mapping")
			var after model.User
			require.NoError(t, model.DB.First(&after, 701).Error)
			assert.Equal(t, before.Quota, after.Quota)
			var tasks int64
			require.NoError(t, model.DB.Model(&model.Task{}).Where("user_id = ? AND action IN ?", 701, []string{constant.TaskActionTextToVideo, constant.TaskActionImageToVideo}).Count(&tasks).Error)
			assert.Zero(t, tasks)
			f.mu.Lock()
			assert.Empty(t, f.requests)
			f.mu.Unlock()
		})
	}
	for _, test := range []struct{ name, plugin, model, mapping string }{
		{"undeclared public alias cannot infer an endpoint model", "doubao", "video-alias", `{"video-alias":"ep-video-test"}`},
		{"an unknown upstream model remains unavailable", "doubao", "doubao-seedance-2-0-260128", `{"doubao-seedance-2-0-260128":"unknown-video-model"}`},
		{"a cyclic endpoint mapping remains unavailable", "doubao", "doubao-seedance-2-0-260128", `{"doubao-seedance-2-0-260128":"ep-video-test","ep-video-test":"doubao-seedance-2-0-260128"}`},
		{"other providers do not accept Ark endpoints", "millu-seedance", "millu-sd-x-2-5-260801", `{"millu-sd-x-2-5-260801":"ep-video-test"}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newVideoPlaygroundFixture(t, "")
			var channel model.Channel
			require.NoError(t, model.DB.Where("name = ?", test.plugin).First(&channel).Error)
			channel.Models = test.model
			channel.ModelMapping = common.GetPointer(test.mapping)
			require.NoError(t, channel.Update())
			response := f.request("POST", "/pg/video/tasks", f.access, "unsupported_mapping_0000", videoPlaygroundBody(t, test.plugin, test.model, false))
			assert.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
			f.mu.Lock()
			assert.Empty(t, f.requests)
			f.mu.Unlock()
		})
	}
	t.Run("auto group keeps the selected provider", func(t *testing.T) {
		f := newVideoPlaygroundFixture(t, "")
		previousGroups, previousAuto := setting.UserUsableGroups2JSONString(), setting.AutoGroups2JsonString()
		t.Cleanup(func() {
			require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousGroups))
			require.NoError(t, setting.UpdateAutoGroupsByJsonString(previousAuto))
		})
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","auto":"Auto"}`))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default"]`))
		body := bytes.Replace(videoPlaygroundBody(t, "doubao", "doubao-seedance-2-0-260128", false), []byte(`"group":"default"`), []byte(`"group":"auto"`), 1)
		response := f.request("POST", "/pg/video/tasks", f.access, "auto_group_intent_0000000", body)
		require.Equal(t, 200, response.Code, response.Body.String())
		f.mu.Lock()
		assert.Len(t, f.requests["doubao"], 1)
		assert.Empty(t, f.requests["moma-seedance"])
		f.mu.Unlock()
	})
}

func TestVideoPlaygroundLiveSessionAndQuota(t *testing.T) {
	t.Run("a refreshed request cannot move to another session", func(t *testing.T) {
		f := newVideoPlaygroundFixture(t, "")
		var original model.UserSession
		require.NoError(t, model.DB.Where("user_id = ?", 701).First(&original).Error)
		req := httptest.NewRequest("POST", "/pg/video/tasks", bytes.NewReader(videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false)))
		req.Header.Set("Authorization", "Bearer "+f.otherAccess)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "cross_session_replay_0000")
		req.Header.Set("X-Auth-Session", original.SID)
		w := httptest.NewRecorder()
		f.engine.ServeHTTP(w, req)
		assert.Equal(t, 409, w.Code, w.Body.String())
		assert.Contains(t, w.Body.String(), "AUTH_SESSION_MISMATCH")
		f.mu.Lock()
		assert.Empty(t, f.requests)
		f.mu.Unlock()
	})
	for _, scenario := range []string{"revoked", "expired", "disabled", "empty balance"} {
		t.Run(scenario, func(t *testing.T) {
			f := newVideoPlaygroundFixture(t, "")
			expected := 401
			switch scenario {
			case "revoked":
				_, err := model.RevokeAllUserSessions(701, "test-revocation")
				require.NoError(t, err)
			case "expired":
				require.NoError(t, model.DB.Model(&model.UserSession{}).Where("user_id = ?", 701).Update("expires_at", time.Now().Unix()-1).Error)
			case "disabled":
				require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", 701).Update("status", common.UserStatusDisabled).Error)
			case "empty balance":
				require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", 701).Update("quota", 0).Error)
				expected = 403
			}
			response := f.request("POST", "/pg/video/tasks", f.access, "session_quota_intent_0000", videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false))
			assert.Equal(t, expected, response.Code, response.Body.String())
			f.mu.Lock()
			assert.Empty(t, f.requests)
			f.mu.Unlock()
		})
	}
}

func TestVideoPlaygroundBookkeepingFailureRecoversSavedTask(t *testing.T) {
	f := newVideoPlaygroundFixture(t, "")
	require.NoError(t, model.DB.Callback().Update().Before("gorm:update").Register("video_key_finish_failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "video_playground_submissions" {
			tx.AddError(errors.New("injected key update failure"))
		}
	}))
	t.Cleanup(func() { _ = model.DB.Callback().Update().Remove("video_key_finish_failure") })
	key := "bookkeeping_failure_intent_0000"
	body := videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false)
	response := f.request("POST", "/pg/video/tasks", f.access, key, body)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), "accepted")
	assert.Contains(t, f.request("POST", "/pg/video/tasks", f.access, key, body).Body.String(), "accepted")
	assert.Contains(t, f.request("GET", "/pg/video/submissions/"+key, f.access, "", nil).Body.String(), "accepted")
	assert.NotContains(t, f.request("GET", "/pg/video/submissions", f.access, "", nil).Body.String(), "task_")
	f.mu.Lock()
	assert.Len(t, f.requests["moma-seedance"], 1)
	f.mu.Unlock()
}

func TestVideoPlaygroundBrowserDisconnectPreservesAcceptedTask(t *testing.T) {
	f := newVideoPlaygroundFixture(t, "")
	f.entered, f.release = make(chan struct{}), make(chan struct{})
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	key := "browser_disconnect_intent_0000"
	req := httptest.NewRequest("POST", "/pg/video/tasks", bytes.NewReader(videoPlaygroundBody(t, "moma-seedance", "doubao-seedance-2-0-260128", false))).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+f.access)
	req.Header.Set("Idempotency-Key", key)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { f.engine.ServeHTTP(w, req); close(done) }()
	select {
	case <-f.entered:
	case <-time.After(10 * time.Second):
		t.Fatal("submission did not reach upstream")
	}
	cancel()
	close(f.release)
	<-done
	require.Equal(t, 200, w.Code, w.Body.String())
	record, err := model.GetVideoPlaygroundSubmission(t.Context(), 701, key)
	require.NoError(t, err)
	assert.Equal(t, "accepted", record.State)
	task, exists, err := model.GetByTaskId(701, record.TaskID)
	require.NoError(t, err)
	require.True(t, exists)
	var user model.User
	require.NoError(t, model.DB.First(&user, 701).Error)
	assert.Equal(t, task.Quota, 10000000-user.Quota)
}
