package queue

import (
	"time"
)

// Queue represents a message queue for receiving messages
// Each queue is identified by a random 256-bit ID and access token
// The server has NO knowledge of who created the queue or who will receive from it
type Queue struct {
	ID          string    `json:"id"`           // Random 256-bit ID (hex-encoded)
	AccessToken string    `json:"-"`            // Token required to read messages (never sent over network)
	Messages    []Message `json:"-"`            // Encrypted messages in the queue
	CreatedAt   time.Time `json:"created_at"`   // When the queue was created
	ExpiresAt   time.Time `json:"expires_at"`   // When the queue will be auto-deleted
	LastActive  time.Time `json:"last_active"`  // Last time a message was sent or received
}

// Message represents an encrypted message in a queue
// The server only stores encrypted blobs - it cannot read the content
type Message struct {
	ID         string    `json:"id"`          // Unique message ID
	QueueID    string    `json:"queue_id"`    // Which queue this message belongs to
	Payload    []byte    `json:"payload"`     // Encrypted message payload (E2E encrypted)
	ReceivedAt time.Time `json:"received_at"` // When the server received this message
	ExpiresAt  time.Time `json:"expires_at"`  // When this message will be auto-deleted
}

// CreateQueueRequest is sent by clients to create a new receive queue
type CreateQueueRequest struct {
	// No fields needed - server generates everything randomly
}

// CreateQueueResponse is returned after creating a queue
type CreateQueueResponse struct {
	QueueID     string    `json:"queue_id"`      // The queue ID (share this with sender)
	AccessToken string    `json:"access_token"`  // Token to receive messages (keep private!)
	QueueURL    string    `json:"queue_url"`     // Full URL to the queue
	ExpiresAt   time.Time `json:"expires_at"`    // When the queue expires
}

// SendMessageRequest is sent to post a message to a queue
type SendMessageRequest struct {
	Payload []byte `json:"payload"` // Encrypted message payload
}

// SendMessageResponse is returned after sending a message
type SendMessageResponse struct {
	MessageID string    `json:"message_id"`  // ID of the sent message
	SentAt    time.Time `json:"sent_at"`     // When the message was received by server
}

// ReceiveMessagesRequest is used to retrieve messages from a queue
type ReceiveMessagesRequest struct {
	AccessToken string `json:"access_token"` // Required to authenticate
	Since       string `json:"since"`        // Optional: only get messages after this ID
	Limit       int    `json:"limit"`        // Optional: max number of messages to return
}

// ReceiveMessagesResponse contains messages from the queue
type ReceiveMessagesResponse struct {
	Messages []Message `json:"messages"` // List of encrypted messages
	HasMore  bool      `json:"has_more"` // Whether there are more messages available
}

// DeleteQueueRequest is used to delete a queue
type DeleteQueueRequest struct {
	AccessToken string `json:"access_token"` // Required to authenticate
}

// WebSocket message types for real-time delivery
type WSMessageType string

const (
	WSTypeSubscribe   WSMessageType = "subscribe"    // Client subscribes to queue updates
	WSTypeUnsubscribe WSMessageType = "unsubscribe"  // Client unsubscribes from queue
	WSTypeMessage     WSMessageType = "message"      // Server sends new message to client
	WSTypeAck         WSMessageType = "ack"          // Client acknowledges message receipt
	WSTypeError       WSMessageType = "error"        // Error message
	WSTypePing        WSMessageType = "ping"         // Keep-alive ping
	WSTypePong        WSMessageType = "pong"         // Keep-alive pong
)

// WSMessage is the structure for WebSocket messages
type WSMessage struct {
	Type        WSMessageType `json:"type"`
	QueueID     string        `json:"queue_id,omitempty"`
	AccessToken string        `json:"access_token,omitempty"`
	MessageID   string        `json:"message_id,omitempty"`
	Payload     []byte        `json:"payload,omitempty"`
	Error       string        `json:"error,omitempty"`
	Timestamp   time.Time     `json:"timestamp"`
}

// Queue lifecycle constants
const (
	QueueTTL          = 7 * 24 * time.Hour  // Queues expire after 7 days of inactivity
	MessageTTL        = 24 * time.Hour       // Undelivered messages expire after 24 hours
	MaxMessagesInQueue = 1000                 // Maximum messages per queue
	MaxMessageSize    = 4 * 1024 * 1024      // 4MB max message size
)

// Rate limiting constants
const (
	MaxQueuesPerIP         = 10   // Max queue creations per IP per hour
	MaxMessagesSendPerHour = 100  // Max messages sent to a single queue per hour
	MaxMessagesRecvPerHour = 1000 // Max messages received from a queue per hour
)
