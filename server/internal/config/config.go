package config

import (
	"os"
	"strconv"
)

// Config holds the server configuration
type Config struct {
	Port      int
	RedisAddr string
	RedisPass string
	RedisDB   int
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		Port:      getEnvInt("PORT", 8080),
		RedisAddr: getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass: getEnv("REDIS_PASS", ""),
		RedisDB:   getEnvInt("REDIS_DB", 0),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
