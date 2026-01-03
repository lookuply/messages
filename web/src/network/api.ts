/**
 * API Client for Relay Server
 *
 * Handles HTTP communication with the backend relay server for:
 * - Creating queues
 * - Sending messages
 * - Receiving messages
 * - Deleting queues
 */

/**
 * API Response types matching the backend
 */
export interface CreateQueueResponse {
  queue_id: string;
  access_token: string;
  queue_url: string;
  expires_at: string;
}

export interface SendMessageResponse {
  message_id: string;
  sent_at: string;
}

export interface ReceiveMessagesResponse {
  messages: Array<{
    id: string;
    queue_id: string;
    payload: number[]; // Byte array as JSON array
    received_at: string;
  }>;
  has_more: boolean;
}

/**
 * API Client configuration
 */
export interface APIConfig {
  relayUrl: string;  // Base URL of the relay server
}

/**
 * API Client class
 */
export class RelayAPI {
  private baseUrl: string;

  constructor(config: APIConfig) {
    // Remove trailing slash
    this.baseUrl = config.relayUrl.replace(/\/$/, '');
  }

  /**
   * Create a new message queue
   */
  async createQueue(): Promise<CreateQueueResponse> {
    const response = await fetch(`${this.baseUrl}/queue/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create queue: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send a message to a queue
   */
  async sendMessage(queueId: string, payload: Uint8Array): Promise<SendMessageResponse> {
    const url = `${this.baseUrl}/queue/${queueId}/send`;
    console.log(`🌐 API: Sending message to ${url}`, {
      queueId,
      payloadSize: payload.length,
      baseUrl: this.baseUrl
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: Array.from(payload), // Convert Uint8Array to regular array for JSON
        }),
      });

      console.log(`🌐 API: Response status ${response.status} ${response.statusText}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Queue not found');
        } else if (response.status === 429) {
          throw new Error('Queue is full or rate limit exceeded');
        } else if (response.status === 413) {
          throw new Error('Message too large');
        }
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ API: Message sent successfully`, { messageId: result.message_id });
      return result;
    } catch (error) {
      console.error(`❌ API: Failed to send message to ${url}`, {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        queueId,
        payloadSize: payload.length
      });
      throw error;
    }
  }

  /**
   * Receive messages from a queue
   */
  async receiveMessages(
    queueId: string,
    accessToken: string,
    since?: string,
    limit?: number
  ): Promise<ReceiveMessagesResponse> {
    // Build query parameters
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    if (limit) params.append('limit', limit.toString());

    const url = `${this.baseUrl}/queue/${queueId}/receive${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Queue not found');
      } else if (response.status === 401) {
        throw new Error('Invalid access token');
      }
      throw new Error(`Failed to receive messages: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a queue
   */
  async deleteQueue(queueId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/queue/${queueId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Queue not found');
      } else if (response.status === 401) {
        throw new Error('Invalid access token');
      }
      throw new Error(`Failed to delete queue: ${response.statusText}`);
    }
  }

  /**
   * Check server health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Default relay server URL (can be configured)
 * Uses window.location.origin when in browser (for nginx proxy)
 * Falls back to http://localhost:8080 for direct development
 */
const getDefaultRelayUrl = () => {
  const envUrl = import.meta.env.VITE_RELAY_URL;
  const browserUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const fallbackUrl = 'http://localhost:8080';

  // Prefer browser URL (nginx proxy) over env variable when in browser
  const relayUrl = browserUrl || envUrl || fallbackUrl;
  console.log(`DEFAULT_RELAY_URL determined:`, {
    envUrl,
    browserUrl,
    fallbackUrl,
    finalUrl: relayUrl
  });

  return relayUrl;
};

export const DEFAULT_RELAY_URL = getDefaultRelayUrl();

/**
 * Create a default API client instance
 */
export function createAPIClient(relayUrl: string = DEFAULT_RELAY_URL): RelayAPI {
  return new RelayAPI({ relayUrl });
}
