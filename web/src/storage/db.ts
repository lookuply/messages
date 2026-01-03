/**
 * IndexedDB Storage Layer
 *
 * All sensitive data (keys, messages, conversations) is stored locally
 * in the browser's IndexedDB. This ensures privacy - nothing goes to the server unencrypted.
 */

import Dexie from 'dexie';
import type { IdentityState } from '../crypto/identity';

/**
 * Conversation represents a chat with another user
 */
export interface Conversation {
  id: string;                    // Local conversation ID
  peerName?: string;             // Optional display name for peer
  myReceiveQueueId: string;      // My queue ID for receiving messages
  myReceiveQueueToken: string;   // Access token for my queue
  myReceiveQueueUrl: string;     // Full URL to my queue
  peerSendQueueId: string;       // Peer's queue ID for sending messages
  peerSendQueueUrl: string;      // Full URL to peer's queue
  peerPublicKey: string;         // Peer's public encryption key (base64)
  relayUrl: string;              // Which relay server this conversation uses
  lastMessageAt?: Date;          // Timestamp of last message
  lastMessagePreview?: string;   // Preview of last message
  unreadCount: number;           // Number of unread messages
  lastReceivedMessageId?: string; // Last message ID received from queue (for 'since' parameter)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Message represents a single message in a conversation
 */
export interface Message {
  id: string;                // Local message ID
  conversationId: string;    // Which conversation this belongs to
  direction: 'sent' | 'received';
  content: string;           // Decrypted message content
  encryptedPayload?: Uint8Array; // Raw encrypted payload (for debugging)
  timestamp: Date;           // When the message was sent/received
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;            // Error message if failed
  serverMessageId?: string;  // Server-assigned message ID (for tracking receipts)
  edited?: boolean;          // Whether this message has been edited
  editedAt?: Date;           // When the message was last edited
  deleted?: boolean;         // Whether this message has been deleted
  deletedAt?: Date;          // When the message was deleted
}

/**
 * Session represents a Signal Protocol session with a peer
 */
export interface Session {
  id: string;                // Conversation ID
  conversationId: string;
  sessionState: string;      // Serialized Signal Protocol session state
  rootKey: string;           // Base64 encoded root key
  chainKey: string;          // Base64 encoded chain key
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PreKey - one-time prekeys for establishing new sessions
 */
export interface StoredPreKey {
  keyId: number;
  publicKey: string;         // Base64 encoded
  privateKey: string;        // Base64 encoded
  used: boolean;
  usedAt?: Date;
}

/**
 * Stored queue information
 */
export interface StoredQueue {
  queueId: string;
  accessToken: string;
  queueUrl: string;
  relayUrl: string;
  createdAt: Date;
  expiresAt: Date;
  conversationId?: string;   // Which conversation this queue belongs to
}

/**
 * Application settings
 */
export interface Settings {
  key: string;
  value: any;
}

/**
 * Notification Settings
 */
export interface NotificationSettings {
  id?: number;                         // Primary key (always 1)
  enabled: boolean;                    // On/Off
  showPreview: boolean;                // Show message content?
  sound: boolean;                      // Sound (future feature)
}

/**
 * Main database class
 */
export class PrivacyMessagingDB extends Dexie {
  // Tables
  identity!: Dexie.Table<IdentityState, number>;
  conversations!: Dexie.Table<Conversation, string>;
  messages!: Dexie.Table<Message, string>;
  sessions!: Dexie.Table<Session, string>;
  preKeys!: Dexie.Table<StoredPreKey, number>;
  queues!: Dexie.Table<StoredQueue, string>;
  settings!: Dexie.Table<Settings, string>;
  notificationSettings!: Dexie.Table<NotificationSettings, number>;

  constructor() {
    super('PrivacyMessagingDB');

    // Define database schema v1
    this.version(1).stores({
      // Identity: only one entry (id=1)
      identity: '++id',

      // Conversations: indexed by id, searchable by lastMessageAt
      conversations: 'id, lastMessageAt, createdAt',

      // Messages: indexed by id, searchable by conversationId and timestamp
      messages: 'id, conversationId, timestamp, [conversationId+timestamp]',

      // Sessions: indexed by conversationId
      sessions: 'conversationId, updatedAt',

      // PreKeys: indexed by keyId, searchable by used status
      preKeys: 'keyId, used',

      // Queues: indexed by queueId
      queues: 'queueId, conversationId, expiresAt',

      // Settings: key-value store
      settings: 'key',
    });

    // Version 2: Add peerPublicKey to conversations
    this.version(2).stores({
      // Same schema, but peerPublicKey field will be added to existing conversations
      conversations: 'id, lastMessageAt, createdAt',
    }).upgrade(async (trans) => {
      // Migration: Delete old conversations (from Signal Protocol era)
      // They won't work with new NaCl encryption anyway
      console.log('⚠️ Database upgraded to v2 - clearing old Signal Protocol conversations');

      const conversationsTable = trans.table('conversations');
      await conversationsTable.clear();

      const messagesTable = trans.table('messages');
      await messagesTable.clear();

      const sessionsTable = trans.table('sessions');
      await sessionsTable.clear();

      console.log('✅ Old conversations cleared - please create new ones with NaCl encryption');
    });

    // Version 3: Add notification settings table
    this.version(3).stores({
      identity: '++id',
      conversations: 'id, lastMessageAt, createdAt',
      messages: 'id, conversationId, timestamp, [conversationId+timestamp]',
      sessions: 'conversationId, updatedAt',
      preKeys: 'keyId, used',
      queues: 'queueId, conversationId, expiresAt',
      settings: 'key',
      notificationSettings: '++id', // Only one entry (id=1)
    });
  }
}

// Create database instance
export const db = new PrivacyMessagingDB();

/**
 * Initialize the database and create default identity if needed
 */
export async function initializeDatabase(): Promise<void> {
  try {
    await db.open();
    console.log('Database opened successfully');
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
}

/**
 * Get or create identity
 */
export async function getOrCreateIdentity(): Promise<IdentityState> {
  const existingIdentity = await db.identity.toArray();

  if (existingIdentity.length > 0) {
    return existingIdentity[0];
  }

  // Identity will be created by the app when needed
  throw new Error('Identity not initialized. Please initialize identity first.');
}

/**
 * Save identity
 */
export async function saveIdentity(identity: IdentityState): Promise<void> {
  // Clear existing identity (should only be one)
  await db.identity.clear();
  await db.identity.add(identity);
}

/**
 * Get all conversations, sorted by last activity (message or creation time)
 */
export async function getConversations(): Promise<Conversation[]> {
  const conversations = await db.conversations.toArray();

  // Sort by lastMessageAt if exists, otherwise by createdAt
  return conversations.sort((a, b) => {
    const aTime = a.lastMessageAt || a.createdAt;
    const bTime = b.lastMessageAt || b.createdAt;
    return bTime.getTime() - aTime.getTime(); // Newest first
  });
}

/**
 * Get a specific conversation
 */
export async function getConversation(id: string): Promise<Conversation | undefined> {
  return db.conversations.get(id);
}

/**
 * Save a conversation
 */
export async function saveConversation(conversation: Conversation): Promise<void> {
  conversation.updatedAt = new Date();
  await db.conversations.put(conversation);
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', [db.conversations, db.messages, db.sessions], async () => {
    await db.conversations.delete(id);
    await db.messages.where('conversationId').equals(id).delete();
    await db.sessions.where('conversationId').equals(id).delete();
  });
}

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId: string, limit?: number): Promise<Message[]> {
  const messages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .toArray();

  // Sort by timestamp (chronological order - oldest first)
  messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (limit) {
    return messages.slice(-limit); // Return last N messages
  }

  return messages;
}

/**
 * Save a message
 */
export async function saveMessage(message: Message): Promise<void> {
  await db.messages.add(message);

  // Update conversation's last message info
  const conversation = await db.conversations.get(message.conversationId);
  if (conversation) {
    conversation.lastMessageAt = message.timestamp;
    conversation.lastMessagePreview = message.content.substring(0, 100);
    if (message.direction === 'received' && message.status !== 'failed') {
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    }
    await saveConversation(conversation);
  }
}

/**
 * Mark conversation as read
 */
export async function markConversationAsRead(conversationId: string): Promise<void> {
  const conversation = await db.conversations.get(conversationId);
  if (conversation) {
    conversation.unreadCount = 0;
    await saveConversation(conversation);
  }
}

/**
 * Get session for a conversation
 */
export async function getSession(conversationId: string): Promise<Session | undefined> {
  return db.sessions.get(conversationId);
}

/**
 * Save session
 */
export async function saveSession(session: Session): Promise<void> {
  session.updatedAt = new Date();
  await db.sessions.put(session);
}

/**
 * Get an unused one-time prekey
 */
export async function getUnusedPreKey(): Promise<StoredPreKey | undefined> {
  return db.preKeys
    .where('used')
    .equals(0 as any) // 0 for false, 1 for true
    .first();
}

/**
 * Mark prekey as used
 */
export async function markPreKeyAsUsed(keyId: number): Promise<void> {
  await db.preKeys.update(keyId, {
    used: true,
    usedAt: new Date(),
  });
}

/**
 * Save queue info
 */
export async function saveQueue(queue: StoredQueue): Promise<void> {
  await db.queues.put(queue);
}

/**
 * Get queue by ID
 */
export async function getQueue(queueId: string): Promise<StoredQueue | undefined> {
  return db.queues.get(queueId);
}

/**
 * Delete expired queues
 */
export async function deleteExpiredQueues(): Promise<void> {
  const now = new Date();
  await db.queues
    .where('expiresAt')
    .below(now)
    .delete();
}

/**
 * Get setting
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value as T | undefined;
}

/**
 * Save setting
 */
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

/**
 * Get notification settings
 */
export async function getNotificationSettings(): Promise<NotificationSettings | undefined> {
  return db.notificationSettings.get(1);
}

/**
 * Save notification settings
 */
export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await db.notificationSettings.put({ ...settings, id: 1 });
}

/**
 * Clear all data (for logout or reset)
 */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [
    db.identity,
    db.conversations,
    db.messages,
    db.sessions,
    db.preKeys,
    db.queues,
    db.settings,
    db.notificationSettings,
  ], async () => {
    await db.identity.clear();
    await db.conversations.clear();
    await db.messages.clear();
    await db.sessions.clear();
    await db.preKeys.clear();
    await db.queues.clear();
    await db.settings.clear();
    await db.notificationSettings.clear();
  });
}
