/**
 * Application State Store
 *
 * Manages global app state, initialization, and current view
 */

import { create } from 'zustand';
import {
  initializeDatabase,
  db,
  saveIdentity,
  type Conversation,
  type Message,
  getConversations,
  getMessages,
  saveMessage,
  saveConversation,
  markConversationAsRead,
} from '../storage/db';
import { initializeIdentity, type IdentityState } from '../crypto/identity';
import { createWebSocketClient, type WebSocketClient } from '../network/websocket';
import { DEFAULT_RELAY_URL } from '../network/api';

export enum AppView {
  LOADING = 'loading',
  FIRST_TIME_SETUP = 'first_time_setup',
  CONVERSATION_LIST = 'conversation_list',
  MESSAGE_VIEW = 'message_view',
  INVITE_GENERATOR = 'invite_generator',
  QR_SCANNER = 'qr_scanner',
  SETTINGS = 'settings',
}

interface AppState {
  // Initialization
  initialized: boolean;
  identity: IdentityState | null;

  // UI State
  currentView: AppView;
  activeConversationId: string | null;

  // Pending invite from URL
  pendingInviteCode: string | null;

  // Data
  conversations: Conversation[];
  messages: Message[];

  // WebSocket
  wsClient: WebSocketClient | null;
  wsConnected: boolean;

  // Loading & Errors
  loading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  setView: (view: AppView, conversationId?: string) => void;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  connectWebSocket: () => Promise<void>;
  disconnectWebSocket: () => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  initialized: false,
  identity: null,
  currentView: AppView.LOADING,
  activeConversationId: null,
  pendingInviteCode: null,
  conversations: [],
  messages: [],
  wsClient: null,
  wsConnected: false,
  loading: false,
  error: null,

  // Initialize the app
  initialize: async () => {
    set({ loading: true, error: null });

    try {
      // Initialize IndexedDB
      await initializeDatabase();

      // Check if identity exists
      const existingIdentity = await db.identity.toArray();

      if (existingIdentity.length === 0) {
        // First time setup - no identity exists
        set({
          initialized: true,
          currentView: AppView.FIRST_TIME_SETUP,
          loading: false,
        });
      } else {
        // Identity exists - load it
        const identity = existingIdentity[0];
        set({ identity, initialized: true });

        // Load conversations
        await get().loadConversations();

        // Connect to WebSocket
        await get().connectWebSocket();

        // Show conversation list
        set({ currentView: AppView.CONVERSATION_LIST, loading: false });
      }
    } catch (error) {
      console.error('Initialization failed:', error);
      set({
        error: error instanceof Error ? error.message : 'Initialization failed',
        loading: false,
      });
    }
  },

  // Set current view
  setView: (view, conversationId) => {
    const updates: Partial<AppState> = { currentView: view };

    if (conversationId) {
      updates.activeConversationId = conversationId;

      // Load messages for the conversation
      if (view === AppView.MESSAGE_VIEW) {
        get().loadMessages(conversationId);
        // Mark as read
        markConversationAsRead(conversationId).then(() => {
          get().loadConversations();
        });
      }
    }

    set(updates);
  },

  // Load conversations from IndexedDB
  loadConversations: async () => {
    try {
      const conversations = await getConversations();
      set({ conversations });
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  },

  // Load messages for a conversation
  loadMessages: async (conversationId) => {
    set({ loading: true });

    try {
      const messages = await getMessages(conversationId);
      set({ messages, loading: false });
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ loading: false });
    }
  },

  // Add a message to the current view
  addMessage: (message) => {
    const { activeConversationId, messages } = get();

    if (message.conversationId === activeConversationId) {
      set({ messages: [...messages, message] });
    }

    // Reload conversations to update last message preview
    get().loadConversations();
  },

  // Connect to WebSocket
  connectWebSocket: async () => {
    try {
      const wsClient = createWebSocketClient(DEFAULT_RELAY_URL);

      wsClient.onError((error) => {
        console.error('WebSocket error:', error);
        set({ wsConnected: false });
      });

      await wsClient.connect();

      set({ wsClient, wsConnected: true });

      // Subscribe to all conversation queues
      const { conversations } = get();
      for (const conv of conversations) {
        wsClient.subscribeToQueue(
          conv.myReceiveQueueId,
          conv.myReceiveQueueToken,
          async (message) => {
            console.log('Received message via WebSocket:', message);

            // Find the conversation that owns this queue
            const conversation = get().conversations.find(
              c => c.myReceiveQueueId === message.queueId
            );

            if (!conversation) {
              console.warn('Received WebSocket message for unknown conversation:', message.queueId);
              return;
            }

            // Process the message using the same logic as polling
            // Import the message handler and process the raw message
            const { processWebSocketMessage } = await import('../messaging/messageHandler');
            await processWebSocketMessage(conversation.id, message);

            // Reload messages if we're viewing this conversation
            const { activeConversationId } = get();
            if (activeConversationId === conversation.id) {
              await get().loadMessages(conversation.id);
            }

            // Reload conversations to update preview
            await get().loadConversations();
          }
        );
      }
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      set({ wsConnected: false });
    }
  },

  // Disconnect from WebSocket
  disconnectWebSocket: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
      set({ wsClient: null, wsConnected: false });
    }
  },

  // Set error message
  setError: (error) => {
    set({ error });
  },
}));
