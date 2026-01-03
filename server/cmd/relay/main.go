package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"privmsg-relay/internal/config"
	"privmsg-relay/internal/queue"
	"privmsg-relay/internal/relay"

	"github.com/redis/go-redis/v9"
)

func main() {
	log.Println("Starting Privacy-Focused Messaging Relay Server...")

	// Load configuration
	cfg := config.Load()
	log.Printf("Configuration loaded: Port=%d, Redis=%s", cfg.Port, cfg.RedisAddr)

	// Connect to Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPass,
		DB:       cfg.RedisDB,
	})

	// Test Redis connection
	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Connected to Redis successfully")

	// Create queue manager
	queueManager := queue.NewManager(redisClient)

	// Create relay server
	server := relay.NewServer(queueManager)

	// Start cleanup routine for expired queues
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			queueManager.CleanupExpiredQueues()
		}
	}()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Shutting down server...")

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("Error during shutdown: %v", err)
		}

		if err := redisClient.Close(); err != nil {
			log.Printf("Error closing Redis connection: %v", err)
		}

		os.Exit(0)
	}()

	// Start server
	log.Printf("Server starting on port %d", cfg.Port)
	log.Println("Ready to accept connections!")
	log.Println("")
	log.Println("API Endpoints:")
	log.Println("  POST   /queue/create          - Create a new message queue")
	log.Println("  POST   /queue/{id}/send       - Send a message to a queue")
	log.Println("  GET    /queue/{id}/receive    - Receive messages from a queue")
	log.Println("  DELETE /queue/{id}             - Delete a queue")
	log.Println("  GET    /ws                     - WebSocket endpoint for real-time messages")
	log.Println("  GET    /health                 - Health check")
	log.Println("")

	if err := server.Start(cfg.Port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
