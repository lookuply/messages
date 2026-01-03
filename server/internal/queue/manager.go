package queue

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	ErrQueueNotFound      = errors.New("queue not found")
	ErrInvalidAccessToken = errors.New("invalid access token")
	ErrQueueFull          = errors.New("queue is full")
	ErrMessageTooLarge    = errors.New("message too large")
	ErrRateLimitExceeded  = errors.New("rate limit exceeded")
)

// Manager handles queue and message operations
type Manager struct {
	redis *redis.Client
	ctx   context.Context
}

// NewManager creates a new queue manager with Redis storage
func NewManager(redisClient *redis.Client) *Manager {
	return &Manager{
		redis: redisClient,
		ctx:   context.Background(),
	}
}

// CreateQueue creates a new message queue with random ID and access token
func (m *Manager) CreateQueue() (*CreateQueueResponse, error) {
	// Generate random 256-bit queue ID
	queueID, err := generateRandomID(32) // 32 bytes = 256 bits
	if err != nil {
		return nil, fmt.Errorf("failed to generate queue ID: %w", err)
	}

	// Generate random access token
	accessToken, err := generateRandomID(32)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	now := time.Now()
	expiresAt := now.Add(QueueTTL)

	queue := &Queue{
		ID:          queueID,
		AccessToken: accessToken,
		Messages:    []Message{},
		CreatedAt:   now,
		ExpiresAt:   expiresAt,
		LastActive:  now,
	}

	// Store queue in Redis
	queueKey := fmt.Sprintf("queue:%s", queueID)
	queueData, err := json.Marshal(queue)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal queue: %w", err)
	}

	// Set with TTL
	err = m.redis.Set(m.ctx, queueKey, queueData, QueueTTL).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to store queue: %w", err)
	}

	// Store access token mapping (for authentication)
	tokenKey := fmt.Sprintf("token:%s", accessToken)
	err = m.redis.Set(m.ctx, tokenKey, queueID, QueueTTL).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to store access token: %w", err)
	}

	return &CreateQueueResponse{
		QueueID:     queueID,
		AccessToken: accessToken,
		QueueURL:    fmt.Sprintf("/queue/%s", queueID),
		ExpiresAt:   expiresAt,
	}, nil
}

// SendMessage sends an encrypted message to a queue
func (m *Manager) SendMessage(queueID string, payload []byte) (*SendMessageResponse, error) {
	// Validate payload size
	if len(payload) > MaxMessageSize {
		return nil, ErrMessageTooLarge
	}

	// Check if queue exists
	queue, err := m.getQueue(queueID)
	if err != nil {
		return nil, err
	}

	// Check if queue is full
	messageCount, err := m.getMessageCount(queueID)
	if err != nil {
		return nil, err
	}
	if messageCount >= MaxMessagesInQueue {
		return nil, ErrQueueFull
	}

	// Create message
	messageID, err := generateRandomID(16)
	if err != nil {
		return nil, fmt.Errorf("failed to generate message ID: %w", err)
	}

	now := time.Now()
	message := Message{
		ID:         messageID,
		QueueID:    queueID,
		Payload:    payload,
		ReceivedAt: now,
		ExpiresAt:  now.Add(MessageTTL),
	}

	// Store message in Redis
	messageKey := fmt.Sprintf("message:%s:%s", queueID, messageID)
	messageData, err := json.Marshal(message)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal message: %w", err)
	}

	err = m.redis.Set(m.ctx, messageKey, messageData, MessageTTL).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to store message: %w", err)
	}

	// Add message ID to queue's message list
	listKey := fmt.Sprintf("queue:%s:messages", queueID)
	err = m.redis.RPush(m.ctx, listKey, messageID).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to add message to queue: %w", err)
	}

	// Set expiry on message list
	m.redis.Expire(m.ctx, listKey, QueueTTL)

	// Update queue's last active time
	queue.LastActive = now
	m.updateQueue(queue)

	return &SendMessageResponse{
		MessageID: messageID,
		SentAt:    now,
	}, nil
}

// ReceiveMessages retrieves messages from a queue (requires valid access token)
func (m *Manager) ReceiveMessages(queueID, accessToken string, since string, limit int) (*ReceiveMessagesResponse, error) {
	// Verify access token
	valid, err := m.verifyAccessToken(queueID, accessToken)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, ErrInvalidAccessToken
	}

	// Get message IDs from queue
	listKey := fmt.Sprintf("queue:%s:messages", queueID)
	messageIDs, err := m.redis.LRange(m.ctx, listKey, 0, -1).Result()
	if err != nil {
		if err == redis.Nil {
			return &ReceiveMessagesResponse{
				Messages: []Message{},
				HasMore:  false,
			}, nil
		}
		return nil, fmt.Errorf("failed to get message list: %w", err)
	}

	// Set default limit
	if limit == 0 || limit > 100 {
		limit = 100
	}

	// Retrieve messages
	messages := []Message{}
	sinceFound := since == "" // If no 'since', start from beginning

	// First pass: try to find the 'since' message
	sinceMessageInQueue := false
	if since != "" {
		for _, msgID := range messageIDs {
			if msgID == since {
				sinceMessageInQueue = true
				break
			}
		}
		// If 'since' message not found in queue (expired/deleted), fetch all messages
		if !sinceMessageInQueue {
			sinceFound = true // Treat as if no 'since' was specified
		}
	}

	for i, msgID := range messageIDs {
		// Skip until we find 'since' message
		if !sinceFound {
			if msgID == since {
				sinceFound = true
			}
			continue
		}

		// Check limit
		if len(messages) >= limit {
			break
		}

		// Get message
		messageKey := fmt.Sprintf("message:%s:%s", queueID, msgID)
		messageData, err := m.redis.Get(m.ctx, messageKey).Result()
		if err != nil {
			if err == redis.Nil {
				// Message expired, remove from list
				m.redis.LRem(m.ctx, listKey, 1, msgID)
				continue
			}
			return nil, fmt.Errorf("failed to get message: %w", err)
		}

		var message Message
		err = json.Unmarshal([]byte(messageData), &message)
		if err != nil {
			continue // Skip malformed messages
		}

		messages = append(messages, message)

		// If this is the last message in our limit, check if there are more
		if i < len(messageIDs)-1 && len(messages) >= limit {
			return &ReceiveMessagesResponse{
				Messages: messages,
				HasMore:  true,
			}, nil
		}
	}

	// Update queue's last active time
	queue, _ := m.getQueue(queueID)
	if queue != nil {
		queue.LastActive = time.Now()
		m.updateQueue(queue)
	}

	return &ReceiveMessagesResponse{
		Messages: messages,
		HasMore:  false,
	}, nil
}

// DeleteMessage deletes a message from the queue after it's been received
func (m *Manager) DeleteMessage(queueID, messageID, accessToken string) error {
	// Verify access token
	valid, err := m.verifyAccessToken(queueID, accessToken)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidAccessToken
	}

	// Delete message
	messageKey := fmt.Sprintf("message:%s:%s", queueID, messageID)
	err = m.redis.Del(m.ctx, messageKey).Err()
	if err != nil {
		return fmt.Errorf("failed to delete message: %w", err)
	}

	// Remove from queue's message list
	listKey := fmt.Sprintf("queue:%s:messages", queueID)
	err = m.redis.LRem(m.ctx, listKey, 1, messageID).Err()
	if err != nil {
		return fmt.Errorf("failed to remove message from list: %w", err)
	}

	return nil
}

// DeleteQueue deletes a queue and all its messages
func (m *Manager) DeleteQueue(queueID, accessToken string) error {
	// Verify access token
	valid, err := m.verifyAccessToken(queueID, accessToken)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidAccessToken
	}

	// Get all message IDs
	listKey := fmt.Sprintf("queue:%s:messages", queueID)
	messageIDs, _ := m.redis.LRange(m.ctx, listKey, 0, -1).Result()

	// Delete all messages
	for _, msgID := range messageIDs {
		messageKey := fmt.Sprintf("message:%s:%s", queueID, msgID)
		m.redis.Del(m.ctx, messageKey)
	}

	// Delete message list
	m.redis.Del(m.ctx, listKey)

	// Delete queue
	queueKey := fmt.Sprintf("queue:%s", queueID)
	m.redis.Del(m.ctx, queueKey)

	// Delete access token
	tokenKey := fmt.Sprintf("token:%s", accessToken)
	m.redis.Del(m.ctx, tokenKey)

	return nil
}

// CleanupExpiredQueues removes expired queues and messages
func (m *Manager) CleanupExpiredQueues() error {
	// This is handled automatically by Redis TTL
	// But we can also implement manual cleanup here if needed
	return nil
}

// Helper functions

func (m *Manager) getQueue(queueID string) (*Queue, error) {
	queueKey := fmt.Sprintf("queue:%s", queueID)
	queueData, err := m.redis.Get(m.ctx, queueKey).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, ErrQueueNotFound
		}
		return nil, fmt.Errorf("failed to get queue: %w", err)
	}

	var queue Queue
	err = json.Unmarshal([]byte(queueData), &queue)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal queue: %w", err)
	}

	return &queue, nil
}

func (m *Manager) updateQueue(queue *Queue) error {
	queueKey := fmt.Sprintf("queue:%s", queue.ID)
	queueData, err := json.Marshal(queue)
	if err != nil {
		return err
	}

	// Update with remaining TTL
	ttl := time.Until(queue.ExpiresAt)
	if ttl < 0 {
		ttl = QueueTTL
	}

	return m.redis.Set(m.ctx, queueKey, queueData, ttl).Err()
}

func (m *Manager) verifyAccessToken(queueID, accessToken string) (bool, error) {
	tokenKey := fmt.Sprintf("token:%s", accessToken)
	storedQueueID, err := m.redis.Get(m.ctx, tokenKey).Result()
	if err != nil {
		if err == redis.Nil {
			return false, nil
		}
		return false, fmt.Errorf("failed to verify token: %w", err)
	}

	return storedQueueID == queueID, nil
}

func (m *Manager) getMessageCount(queueID string) (int, error) {
	listKey := fmt.Sprintf("queue:%s:messages", queueID)
	count, err := m.redis.LLen(m.ctx, listKey).Result()
	if err != nil {
		if err == redis.Nil {
			return 0, nil
		}
		return 0, err
	}
	return int(count), nil
}

// generateRandomID generates a cryptographically secure random ID
func generateRandomID(byteLength int) (string, error) {
	bytes := make([]byte, byteLength)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
