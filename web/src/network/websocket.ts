/**
 * WebSocket Client for Real-Time Message Delivery
 *
 * Handles WebSocket connection to relay server for instant message notifications
 */

/**
 * WebSocket message types (must match backend)
 */
export enum WSMessageType {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  MESSAGE = 'message',
  ACK = 'ack',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  queue_id?: string;
  access_token?: string;
  message_id?: string;
  payload?: string; // Base64-encoded payload from Go server
  error?: string;
  timestamp: string;
}

/**
 * Message callback type
 */
export type MessageCallback = (message: {
  queueId: string;
  messageId: string;
  payload: Uint8Array;
}) => void;

/**
 * Error callback type
 */
export type ErrorCallback = (error: string) => void;

/**
 * WebSocket Client
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private relayUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions = new Map<string, { accessToken: string; callback: MessageCallback }>();
  private onErrorCallback: ErrorCallback | null = null;

  constructor(relayUrl: string) {
    // Convert HTTP/HTTPS URL to WebSocket URL (ws/wss)
    if (relayUrl.startsWith('https://')) {
      this.relayUrl = relayUrl.replace(/^https/, 'wss');
    } else if (relayUrl.startsWith('http://')) {
      this.relayUrl = relayUrl.replace(/^http/, 'ws');
    } else {
      // Already a ws:// or wss:// URL
      this.relayUrl = relayUrl;
    }
    console.log(`WebSocket will connect to: ${this.relayUrl}/ws`);
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.relayUrl}/ws`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;

          // Start ping interval to keep connection alive
          this.startPingInterval();

          // Resubscribe to all queues
          this.resubscribeAll();

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.stopPingInterval();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
  }

  /**
   * Subscribe to a queue for real-time messages
   */
  subscribeToQueue(
    queueId: string,
    accessToken: string,
    callback: MessageCallback
  ): void {
    this.subscriptions.set(queueId, { accessToken, callback });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: WSMessageType.SUBSCRIBE,
        queue_id: queueId,
        access_token: accessToken,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Unsubscribe from a queue
   */
  unsubscribeFromQueue(queueId: string): void {
    this.subscriptions.delete(queueId);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: WSMessageType.UNSUBSCRIBE,
        queue_id: queueId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Acknowledge message receipt
   */
  acknowledgeMessage(queueId: string, messageId: string, accessToken: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: WSMessageType.ACK,
        queue_id: queueId,
        message_id: messageId,
        access_token: accessToken,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Set error callback
   */
  onError(callback: ErrorCallback): void {
    this.onErrorCallback = callback;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Private methods

  private sendMessage(message: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);

      switch (message.type) {
        case WSMessageType.MESSAGE:
          this.handleIncomingMessage(message);
          break;

        case WSMessageType.PONG:
          // Pong received, connection is alive
          break;

        case WSMessageType.ERROR:
          console.error('WebSocket error from server:', message.error);
          if (this.onErrorCallback) {
            this.onErrorCallback(message.error || 'Unknown error');
          }
          break;

        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleIncomingMessage(message: WSMessage): void {
    if (!message.queue_id || !message.message_id || !message.payload) {
      console.error('Invalid incoming message:', message);
      return;
    }

    const subscription = this.subscriptions.get(message.queue_id);
    if (!subscription) {
      console.warn('Received message for unsubscribed queue:', message.queue_id);
      return;
    }

    // Decode Base64 payload (Go JSON encoder automatically Base64-encodes []byte)
    const payload = Uint8Array.from(
      atob(message.payload)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    // Call the subscription callback
    subscription.callback({
      queueId: message.queue_id,
      messageId: message.message_id,
      payload,
    });

    // Acknowledge the message
    this.acknowledgeMessage(
      message.queue_id,
      message.message_id,
      subscription.accessToken
    );
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: WSMessageType.PING,
          timestamp: new Date().toISOString(),
        });
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      if (this.onErrorCallback) {
        this.onErrorCallback('Connection lost - max reconnect attempts reached');
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnect failed:', error);
      });
    }, delay);
  }

  private resubscribeAll(): void {
    for (const [queueId, { accessToken }] of this.subscriptions) {
      this.sendMessage({
        type: WSMessageType.SUBSCRIBE,
        queue_id: queueId,
        access_token: accessToken,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Create a WebSocket client instance
 */
export function createWebSocketClient(relayUrl: string): WebSocketClient {
  return new WebSocketClient(relayUrl);
}
