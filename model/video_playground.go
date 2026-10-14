package model

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm/clause"
)

// VideoPlaygroundSubmission is a durable deduplication barrier, not a second
// task system. A pending/unknown record is never reclaimed or POSTed again.
// Keeping the key forever also protects replay after a process restart.
type VideoPlaygroundSubmission struct {
	ID          string `gorm:"type:varchar(64);primaryKey"`
	UserID      int    `gorm:"index"`
	Fingerprint string `gorm:"type:varchar(64);not null"`
	TaskID      string `gorm:"type:varchar(191);not null"`
	State       string `gorm:"type:varchar(20);not null"`
	ErrorCode   string `gorm:"type:varchar(64)"`
	CreatedAt   int64
}

func VideoPlaygroundSubmissionID(userID int, key string) string {
	return fmt.Sprintf("%x", sha256.Sum256(fmt.Appendf(nil, "%d\x00%s", userID, key)))
}

func BeginVideoPlaygroundSubmission(ctx context.Context, userID int, key, fingerprint string) (*VideoPlaygroundSubmission, bool, error) {
	record := &VideoPlaygroundSubmission{ID: VideoPlaygroundSubmissionID(userID, key), UserID: userID, Fingerprint: fingerprint, TaskID: GenerateTaskID(), State: "pending", CreatedAt: time.Now().Unix()}
	claimTaskID := record.TaskID
	result := DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(record)
	if result.Error != nil {
		return nil, false, result.Error
	}
	// MySQL clientFoundRows makes a duplicate no-op report one affected row.
	// Only the contender whose generated identity was saved owns the intent.
	stored, err := GetVideoPlaygroundSubmission(ctx, userID, key)
	if err != nil {
		return nil, false, err
	}
	return stored, stored.TaskID == claimTaskID, nil
}

func GetVideoPlaygroundSubmission(ctx context.Context, userID int, key string) (*VideoPlaygroundSubmission, error) {
	var record VideoPlaygroundSubmission
	if err := DB.WithContext(ctx).Where("id = ? AND user_id = ?", VideoPlaygroundSubmissionID(userID, key), userID).First(&record).Error; err != nil {
		return nil, err
	}
	// A process can stop after the task is saved but before the key is marked
	// accepted. Both POST replay and GET recovery use the durable task as truth.
	if record.State == "pending" || record.State == "unknown" {
		var tasks int64
		if err := DB.WithContext(ctx).Model(&Task{}).Where("user_id = ? AND task_id = ?", userID, record.TaskID).Count(&tasks).Error; err != nil {
			return nil, err
		}
		if tasks > 0 {
			record.State, record.ErrorCode = "accepted", ""
		}
	}
	return &record, nil
}

func FinishVideoPlaygroundSubmission(ctx context.Context, id, state, code string) error {
	return DB.WithContext(ctx).Model(&VideoPlaygroundSubmission{}).Where("id = ?", id).Updates(map[string]any{"state": state, "error_code": code}).Error
}

func GetUnresolvedVideoPlaygroundSubmissions(ctx context.Context, userID int) ([]VideoPlaygroundSubmission, error) {
	var records []VideoPlaygroundSubmission
	tasks := DB.Model(&Task{}).Select("task_id").Where("user_id = ? AND task_id <> ?", userID, "")
	err := DB.WithContext(ctx).Where("user_id = ? AND state IN ?", userID, []string{"pending", "unknown"}).
		Where("task_id NOT IN (?)", tasks).Order("created_at desc").Limit(20).Find(&records).Error
	return records, err
}

func GetVideoPlaygroundTasks(ctx context.Context, userID, offset, limit int) ([]*Task, error) {
	var tasks []*Task
	err := DB.WithContext(ctx).Where("user_id = ? AND platform IN ? AND action IN ?", userID,
		[]constant.TaskPlatform{"doubao", "millu-seedance", "ctyun-cdance", "moma-seedance", "54"},
		[]string{"text_to_video", "image_to_video"}).Order("id desc").Offset(offset).Limit(limit).Find(&tasks).Error
	return tasks, err
}
