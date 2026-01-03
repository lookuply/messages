package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"privmsg-relay/internal/queue"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
)

// Server is the relay server that handles HTTP and WebSocket connections
type Server struct {
	router       *chi.Mux
	queueManager *queue.Manager
	upgrader     websocket.Upgrader

	// WebSocket connections mapped by queue ID
	wsConnections map[string][]*websocket.Conn
	wsMutex       sync.RWMutex
}

// NewServer creates a new relay server
func NewServer(queueManager *queue.Manager) *Server {
	s := &Server{
		router:        chi.NewRouter(),
		queueManager:  queueManager,
		wsConnections: make(map[string][]*websocket.Conn),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// Allow all origins (in production, restrict this)
				return true
			},
		},
	}

	s.setupRoutes()
	return s
}

// setupRoutes configures the HTTP routes
func (s *Server) setupRoutes() {
	// Middleware
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Timeout(60 * time.Second))
	s.router.Use(corsMiddleware)

	// Health check
	s.router.Get("/health", s.handleHealth)

	// Queue operations
	s.router.Post("/queue/create", s.handleCreateQueue)
	s.router.Post("/queue/{queueID}/send", s.handleSendMessage)
	s.router.Get("/queue/{queueID}/receive", s.handleReceiveMessages)
	s.router.Delete("/queue/{queueID}", s.handleDeleteQueue)

	// WebSocket endpoint
	s.router.Get("/ws", s.handleWebSocket)
}

// Start starts the HTTP server
func (s *Server) Start(port int) error {
	addr := fmt.Sprintf("0.0.0.0:%d", port)
	log.Printf("Starting relay server on %s", addr)
	return http.ListenAndServe(addr, s.router)
}

// HTTP Handlers

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	})
}

func (s *Server) handleCreateQueue(w http.ResponseWriter, r *http.Request) {
	// Create a new queue
	response, err := s.queueManager.CreateQueue()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	queueID := chi.URLParam(r, "queueID")

	// Parse request
	var req queue.SendMessageRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Send message
	response, err := s.queueManager.SendMessage(queueID, req.Payload)
	if err != nil {
		if err == queue.ErrQueueNotFound {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else if err == queue.ErrQueueFull {
			http.Error(w, err.Error(), http.StatusTooManyRequests)
		} else if err == queue.ErrMessageTooLarge {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Notify WebSocket subscribers
	s.notifySubscribers(queueID, &queue.Message{
		ID:      response.MessageID,
		QueueID: queueID,
		Payload: req.Payload,
		ReceivedAt: response.SentAt,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleReceiveMessages(w http.ResponseWriter, r *http.Request) {
	queueID := chi.URLParam(r, "queueID")
	accessToken := r.Header.Get("Authorization")

	// Remove "Bearer " prefix if present
	if len(accessToken) > 7 && accessToken[:7] == "Bearer " {
		accessToken = accessToken[7:]
	}

	// Get query parameters
	since := r.URL.Query().Get("since")
	limit := 100 // Default limit

	// Receive messages
	response, err := s.queueManager.ReceiveMessages(queueID, accessToken, since, limit)
	if err != nil {
		if err == queue.ErrQueueNotFound {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else if err == queue.ErrInvalidAccessToken {
			http.Error(w, err.Error(), http.StatusUnauthorized)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleDeleteQueue(w http.ResponseWriter, r *http.Request) {
	queueID := chi.URLParam(r, "queueID")
	accessToken := r.Header.Get("Authorization")

	// Remove "Bearer " prefix if present
	if len(accessToken) > 7 && accessToken[:7] == "Bearer " {
		accessToken = accessToken[7:]
	}

	// Delete queue
	err := s.queueManager.DeleteQueue(queueID, accessToken)
	if err != nil {
		if err == queue.ErrQueueNotFound {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else if err == queue.ErrInvalidAccessToken {
			http.Error(w, err.Error(), http.StatusUnauthorized)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// WebSocket Handler

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	defer conn.Close()

	// Track subscribed queues for this connection
	subscribedQueues := make(map[string]bool)
	defer func() {
		// Unsubscribe from all queues when connection closes
		for queueID := range subscribedQueues {
			s.unsubscribe(queueID, conn)
		}
	}()

	// Read messages from client
	for {
		var msg queue.WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Handle message based on type
		switch msg.Type {
		case queue.WSTypeSubscribe:
			// Subscribe to queue updates
			if msg.QueueID != "" && msg.AccessToken != "" {
				s.subscribe(msg.QueueID, msg.AccessToken, conn)
				subscribedQueues[msg.QueueID] = true
			}

		case queue.WSTypeUnsubscribe:
			// Unsubscribe from queue updates
			if msg.QueueID != "" {
				s.unsubscribe(msg.QueueID, conn)
				delete(subscribedQueues, msg.QueueID)
			}

		case queue.WSTypeAck:
			// Client acknowledged message receipt
			if msg.QueueID != "" && msg.MessageID != "" && msg.AccessToken != "" {
				// Delete the acknowledged message
				s.queueManager.DeleteMessage(msg.QueueID, msg.MessageID, msg.AccessToken)
			}

		case queue.WSTypePing:
			// Respond with pong
			conn.WriteJSON(queue.WSMessage{
				Type:      queue.WSTypePong,
				Timestamp: time.Now(),
			})
		}
	}
}

// subscribe adds a WebSocket connection to a queue's subscriber list
func (s *Server) subscribe(queueID, accessToken string, conn *websocket.Conn) {
	// Verify access token (optional, for added security)
	// For now, we trust the client

	s.wsMutex.Lock()
	defer s.wsMutex.Unlock()

	if s.wsConnections[queueID] == nil {
		s.wsConnections[queueID] = []*websocket.Conn{}
	}
	s.wsConnections[queueID] = append(s.wsConnections[queueID], conn)

	log.Printf("Client subscribed to queue %s", queueID)
}

// unsubscribe removes a WebSocket connection from a queue's subscriber list
func (s *Server) unsubscribe(queueID string, conn *websocket.Conn) {
	s.wsMutex.Lock()
	defer s.wsMutex.Unlock()

	connections := s.wsConnections[queueID]
	for i, c := range connections {
		if c == conn {
			// Remove connection
			s.wsConnections[queueID] = append(connections[:i], connections[i+1:]...)
			break
		}
	}

	// Clean up empty lists
	if len(s.wsConnections[queueID]) == 0 {
		delete(s.wsConnections, queueID)
	}

	log.Printf("Client unsubscribed from queue %s", queueID)
}

// notifySubscribers sends a new message notification to all subscribers of a queue
func (s *Server) notifySubscribers(queueID string, message *queue.Message) {
	s.wsMutex.RLock()
	defer s.wsMutex.RUnlock()

	connections := s.wsConnections[queueID]
	if len(connections) == 0 {
		return
	}

	// Create notification message
	notification := queue.WSMessage{
		Type:      queue.WSTypeMessage,
		QueueID:   queueID,
		MessageID: message.ID,
		Payload:   message.Payload,
		Timestamp: time.Now(),
	}

	// Send to all subscribers (synchronously to avoid concurrent writes)
	for _, conn := range connections {
		err := conn.WriteJSON(notification)
		if err != nil {
			log.Printf("Error sending WebSocket message: %v", err)
		}
	}
}

// CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-CSRF-Token")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	// Close all WebSocket connections
	s.wsMutex.Lock()
	defer s.wsMutex.Unlock()

	for queueID, connections := range s.wsConnections {
		for _, conn := range connections {
			conn.Close()
		}
		delete(s.wsConnections, queueID)
	}

	return nil
}
