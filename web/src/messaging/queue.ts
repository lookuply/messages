/**
 * Queue Management
 *
 * Handles creation and management of message queues on the relay server
 */

import { createAPIClient, RelayAPI } from '../network/api';
import { saveQueue, getQueue, type StoredQueue } from '../storage/db';
import { generateRandomId } from '../crypto/identity';

/**
 * Queue information returned after creation
 */
export interface QueueInfo {
  queueId: string;
  accessToken: string;
  queueUrl: string;
  relayUrl: string;
  expiresAt: Date;
}

/**
 * Create a new receive queue on a relay server
 */
export async function createReceiveQueue(relayUrl: string): Promise<QueueInfo> {
  const api = createAPIClient(relayUrl);

  try {
    const response = await api.createQueue();

    const queueInfo: QueueInfo = {
      queueId: response.queue_id,
      accessToken: response.access_token,
      queueUrl: `${relayUrl}${response.queue_url}`,
      relayUrl,
      expiresAt: new Date(response.expires_at),
    };

    // Store queue info in IndexedDB
    const storedQueue: StoredQueue = {
      queueId: queueInfo.queueId,
      accessToken: queueInfo.accessToken,
      queueUrl: queueInfo.queueUrl,
      relayUrl: queueInfo.relayUrl,
      createdAt: new Date(),
      expiresAt: queueInfo.expiresAt,
    };

    await saveQueue(storedQueue);

    return queueInfo;
  } catch (error) {
    console.error('Failed to create queue:', error);
    throw new Error(`Queue creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Send an encrypted message to a queue
 */
export async function sendMessageToQueue(
  queueId: string,
  encryptedPayload: Uint8Array,
  relayUrl: string
): Promise<string> {
  const api = createAPIClient(relayUrl);

  try {
    const response = await api.sendMessage(queueId, encryptedPayload);
    return response.message_id;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw new Error(`Message send failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Poll for messages from a queue
 */
export async function pollMessages(
  queueId: string,
  accessToken: string,
  relayUrl: string,
  since?: string
): Promise<Array<{ id: string; payload: Uint8Array; receivedAt: Date }>> {
  const api = createAPIClient(relayUrl);

  try {
    const response = await api.receiveMessages(queueId, accessToken, since);

    return response.messages.map((msg) => {
      // Debug: check payload type
      console.log('🔍 Queue payload type:', typeof msg.payload, 'is array:', Array.isArray(msg.payload));

      // Handle both base64 string and number array formats
      let payload: Uint8Array;
      if (typeof msg.payload === 'string') {
        // Base64 string - decode it
        const binary = atob(msg.payload);
        payload = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          payload[i] = binary.charCodeAt(i);
        }
      } else if (Array.isArray(msg.payload)) {
        // Number array - convert directly
        payload = new Uint8Array(msg.payload);
      } else {
        console.error('Unknown payload format:', msg.payload);
        payload = new Uint8Array(0);
      }

      return {
        id: msg.id,
        payload,
        receivedAt: new Date(msg.received_at),
      };
    });
  } catch (error) {
    console.error('Failed to poll messages:', error);
    throw new Error(`Message polling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a queue from the relay server
 */
export async function deleteQueue(
  queueId: string,
  accessToken: string,
  relayUrl: string
): Promise<void> {
  const api = createAPIClient(relayUrl);

  try {
    await api.deleteQueue(queueId, accessToken);
  } catch (error) {
    console.error('Failed to delete queue:', error);
    throw new Error(`Queue deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Rotate a queue (create new one and notify peer)
 * This is for metadata protection - periodically changing queue IDs
 */
export async function rotateQueue(
  conversationId: string,
  oldQueueInfo: QueueInfo
): Promise<QueueInfo> {
  // Create new queue
  const newQueueInfo = await createReceiveQueue(oldQueueInfo.relayUrl);

  // Note: The caller should send a control message to the peer
  // with the new queue information via sendControlMessage

  return newQueueInfo;
}

/**
 * Control message types
 */
export enum ControlMessageType {
  CONNECTION_ACCEPTED = 'connection_accepted',
  QUEUE_ROTATION = 'queue_rotation',
  CONVERSATION_DELETED = 'conversation_deleted',
  DELIVERY_RECEIPT = 'delivery_receipt',
  READ_RECEIPT = 'read_receipt',
  TYPING = 'typing',
}

/**
 * Control message structure
 */
export interface ControlMessage {
  type: ControlMessageType;
  data: any;
  timestamp: Date;
}

/**
 * Create a connection accepted control message
 */
export function createConnectionAcceptedMessage(
  myQueueInfo: QueueInfo,
  myKeyBundle: any
): ControlMessage {
  return {
    type: ControlMessageType.CONNECTION_ACCEPTED,
    data: {
      queueUrl: myQueueInfo.queueUrl,
      queueId: myQueueInfo.queueId,
      relayUrl: myQueueInfo.relayUrl,
      keyBundle: myKeyBundle,
    },
    timestamp: new Date(),
  };
}

/**
 * Create a queue rotation control message
 */
export function createQueueRotationMessage(newQueueInfo: QueueInfo): ControlMessage {
  return {
    type: ControlMessageType.QUEUE_ROTATION,
    data: {
      queueUrl: newQueueInfo.queueUrl,
      queueId: newQueueInfo.queueId,
      relayUrl: newQueueInfo.relayUrl,
      expiresAt: newQueueInfo.expiresAt,
    },
    timestamp: new Date(),
  };
}

/**
 * Parse a control message from JSON
 */
export function parseControlMessage(json: string): ControlMessage | null {
  try {
    const data = JSON.parse(json);

    if (!data.type || !Object.values(ControlMessageType).includes(data.type)) {
      return null;
    }

    return {
      type: data.type as ControlMessageType,
      data: data.data,
      timestamp: new Date(data.timestamp),
    };
  } catch (error) {
    console.error('Failed to parse control message:', error);
    return null;
  }
}

/**
 * Check if a message is a control message
 */
export function isControlMessage(plaintext: string): boolean {
  try {
    const data = JSON.parse(plaintext);
    return data.type && Object.values(ControlMessageType).includes(data.type);
  } catch {
    return false;
  }
}
