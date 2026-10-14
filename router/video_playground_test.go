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
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.UserAccessToken{}, &model.Token{}, &model.Channel{}, &model.Ability{}, &model.Task{}, &model.Log{}, &model.AuditLog{}, &model.Option{}, &model.UserSubscription{}, &model.SubscriptionPlan{}, &model.SubscriptionPreConsumeRecord{}))
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
			assert.NotContains(t, f.request("GET", "/pg/video/tasks", f.access, "", nil).Body.String(), "task_existing_image")
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
	t.Run("different channel mapping targets are disabled", func(t *testing.T) {
		f := newVideoPlaygroundFixture(t, "")
		var channel model.Channel
		require.NoError(t, model.DB.Where("name = ?", "doubao").First(&channel).Error)
		channel.Id, channel.Name = 0, "doubao-second"
		channel.ModelMapping = common.GetPointer(`{"doubao-seedance-2-0-260128":"doubao-seedance-2-0-fast-260128"}`)
		require.NoError(t, channel.Insert())
		response := f.request("POST", "/pg/video/tasks", f.access, "ambiguous_mapping_intent_0000", videoPlaygroundBody(t, "doubao", "doubao-seedance-2-0-260128", false))
		assert.Equal(t, 400, response.Code, response.Body.String())
		assert.Contains(t, response.Body.String(), "ambiguous_model_mapping")
		f.mu.Lock()
		assert.Empty(t, f.requests)
		f.mu.Unlock()
	})
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
