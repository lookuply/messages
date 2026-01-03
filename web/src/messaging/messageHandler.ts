/**
 * Message Handler
 *
 * Orchestrates message sending and receiving with E2E encryption
 * Now using simple NaCl box encryption instead of Signal Protocol
 */

import {
  encryptMessage,
  decryptMessage,
  serializeEncryptedMessage,
  deserializeEncryptedMessage,
  encodeKey,
  decodeKey,
  type EncryptedMessage,
  type KeyBundle,
} from '../crypto/nacl';
import { sendMessageToQueue, pollMessages } from './queue';
import {
  saveMessage,
  saveConversation,
  getConversation,
  type Message,
  type Conversation,
} from '../storage/db';
import { generateRandomId } from '../crypto/identity';

/**
 * Send an encrypted message to a conversation
 * Using simple NaCl box encryption - no session state needed!
 */
export async function sendEncryptedMessage(
  conversationId: string,
  plaintext: string
): Promise<void> {
  console.log(`📤 Sending new message...`, { conversationId, text: plaintext });

  // Get conversation
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (!conversation.peerPublicKey) {
    throw new Error('Peer public key not found - conversation not properly established');
  }

  console.log(`🔍 Conversation details:`, {
    conversationId,
    peerSendQueueId: conversation.peerSendQueueId,
    relayUrl: conversation.relayUrl,
    hasPeerPublicKey: !!conversation.peerPublicKey
  });

  // Get our identity keys
  const { db } = await import('../storage/db');
  const identities = await db.identity.toArray();
  if (identities.length === 0) {
    throw new Error('Identity not found');
  }

  const myPrivateKey = decodeKey(identities[0].identityKeyPair.privateKey);
  const peerPublicKey = decodeKey(conversation.peerPublicKey);

  // Encrypt message (each message is independent!)
  const encryptedMessage = encryptMessage(plaintext, peerPublicKey, myPrivateKey);
  console.log(`🔐 Message encrypted, payload size: ${encryptedMessage.ciphertext.length + encryptedMessage.nonce.length} bytes`);

  // Serialize encrypted message for transmission
  const payload = serializeEncryptedMessage(encryptedMessage);
  console.log(`📦 Serialized payload size: ${payload.length} bytes`);

  try {
    // Send to peer's queue and get server message ID
    const serverMessageId = await sendMessageToQueue(
      conversation.peerSendQueueId,
      payload,
      conversation.relayUrl
    );

    console.log(`📤 Sent message to queue ${conversation.peerSendQueueId}, server assigned ID: ${serverMessageId}`);

    // Save message locally with server message ID
    const message: Message = {
      id: generateRandomId(16),
      conversationId,
      direction: 'sent',
      content: plaintext,
      timestamp: new Date(),
      status: 'sent',
      serverMessageId, // Store server ID for receipt tracking
    };

    await saveMessage(message);
    console.log(`💾 Message saved locally`);
  } catch (error) {
    console.error(`❌ Failed to send message:`, {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      conversationId,
      peerSendQueueId: conversation.peerSendQueueId,
      relayUrl: conversation.relayUrl
    });
    throw error;
  }
}

// Track ongoing polling operations to prevent concurrent polls for same conversation
const ongoingPolls = new Map<string, Promise<Message[]>>();

// Track ongoing WebSocket message processing to prevent duplicates
const processingWebSocketMessages = new Set<string>();

/**
 * Poll and decrypt messages from our queue
 */
export async function pollAndDecryptMessages(
  conversationId: string
): Promise<Message[]> {
  // Check if there's already a polling operation in progress for this conversation
  const existingPoll = ongoingPolls.get(conversationId);
  if (existingPoll) {
    console.log(`⏳ Polling already in progress for ${conversationId}, waiting...`);
    return existingPoll; // Return the existing promise to avoid duplicate polling
  }

  // Create and store the polling promise
  const pollPromise = _pollAndDecryptMessages(conversationId);
  ongoingPolls.set(conversationId, pollPromise);

  try {
    const result = await pollPromise;
    return result;
  } finally {
    // Clean up the ongoing poll tracking
    ongoingPolls.delete(conversationId);
  }
}

/**
 * Internal implementation of poll and decrypt (with lock protection)
 */
async function _pollAndDecryptMessages(
  conversationId: string
): Promise<Message[]> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  console.log('🔍 POLLING DEBUG:', {
    conversationId,
    queueId: conversation.myReceiveQueueId,
    lastReceivedMessageId: conversation.lastReceivedMessageId,
    note: 'Using since parameter (server is now fixed!)'
  });

  // Poll messages from our queue
  // NOTE: Server is now fixed! If the 'since' message ID is not found in the queue,
  // it will return all messages. We also have client-side deduplication as a safety net.
  const messages = await pollMessages(
    conversation.myReceiveQueueId,
    conversation.myReceiveQueueToken,
    conversation.relayUrl,
    conversation.lastReceivedMessageId // Use 'since' to help server know which messages to return
  );

  console.log(`📬 Polled ${messages.length} messages (since: ${conversation.lastReceivedMessageId || 'none'})`, {
    messageIds: messages.map(m => m.id)
  });

  if (messages.length === 0) {
    return [];
  }

  // Get our identity keys for decryption
  const { db } = await import('../storage/db');
  const identities = await db.identity.toArray();
  if (identities.length === 0) {
    throw new Error('Identity not found');
  }

  const myPrivateKey = decodeKey(identities[0].identityKeyPair.privateKey);
  let peerPublicKey: Uint8Array | null = null;

  // Get peer's public key if we have it
  if (conversation.peerPublicKey) {
    peerPublicKey = decodeKey(conversation.peerPublicKey);
  }

  // Get IDs of messages we've already saved to database (to prevent re-processing)
  const existingMessages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .toArray();
  const alreadySavedIds = new Set(
    existingMessages
      .map(m => m.serverMessageId)
      .filter((id): id is string => id !== undefined)
  );

  console.log(`🔍 Already saved ${alreadySavedIds.size} messages for this conversation`);

  const decryptedMessages: Message[] = [];
  const processedMessageIds = new Set<string>(); // Track processed messages to prevent duplicates within this poll
  let connectionAcceptedProcessed = false; // Flag to prevent duplicate connection_accepted processing

  // Decrypt each message
  for (const msg of messages) {
    // Skip messages we've already saved to database
    if (alreadySavedIds.has(msg.id)) {
      console.log(`⏭️ Skipping already processed message: ${msg.id}`);
      continue;
    }

    // Skip duplicate messages within this poll (backend might send duplicates)
    if (processedMessageIds.has(msg.id)) {
      console.log(`⏭️ Skipping duplicate message ${msg.id}`);
      continue;
    }
    processedMessageIds.add(msg.id);

    try {
      // First, check if this is a plaintext control message (connection_accepted)
      let plaintext: string = '';
      let isControlMessage = false;

      try {
        // Try to parse as plain JSON first
        const decodedPayload = new TextDecoder().decode(msg.payload);
        console.log('🔍 DEBUG: Trying to parse payload as JSON:', decodedPayload.substring(0, 100));
        const parsed = JSON.parse(decodedPayload);
        console.log('🔍 DEBUG: Parsed successfully, type:', parsed.type);
        if (parsed.type === 'connection_accepted' ||
            parsed.type === 'conversation_deleted' ||
            parsed.type === 'delivery_receipt' ||
            parsed.type === 'read_receipt' ||
            parsed.type === 'typing') {
          console.log('✅ DEBUG: Recognized as control message');
          plaintext = decodedPayload;
          isControlMessage = true;
        } else {
          console.log('❌ DEBUG: Not a control message type');
        }
      } catch (e) {
        console.log('❌ DEBUG: Failed to parse as JSON:', e);
        // Not a plain JSON control message, continue with decryption
      }

      if (!isControlMessage) {
        console.log('🔐 Decrypting regular message...');
        // For encrypted messages, we need peer's public key
        if (!peerPublicKey) {
          throw new Error('Peer public key not found - waiting for connection to be established');
        }

        // Deserialize encrypted message
        const encryptedMessage = deserializeEncryptedMessage(msg.payload);

        // Decrypt (each message is independent!)
        plaintext = decryptMessage(encryptedMessage, peerPublicKey, myPrivateKey);
        console.log('✅ Decrypted successfully:', plaintext.substring(0, 50));
      }

      // Check if this is a special connection_accepted message
      try {
        const parsed = JSON.parse(plaintext);
        if (parsed.type === 'connection_accepted') {
          console.log('📨 Received connection_accepted message', {
            hasKeyBundle: !!parsed.keyBundle,
            queueId: parsed.queueId
          });

          // Skip if we already processed a connection_accepted in this poll
          if (connectionAcceptedProcessed) {
            console.log('⏭️ Already processed connection_accepted in this poll, skipping duplicate');
            continue;
          }

          connectionAcceptedProcessed = true;

          // Handle connection accepted - update conversation with peer's queue and public key
          await handleConnectionAccepted(conversationId, {
            queueId: parsed.queueId,
            queueUrl: parsed.queueUrl,
            publicKey: parsed.keyBundle?.publicKey, // Store peer's public key
          });

          // Reload conversation to get peer's public key
          const updatedConv = await getConversation(conversationId);
          if (updatedConv?.peerPublicKey) {
            peerPublicKey = decodeKey(updatedConv.peerPublicKey);
            console.log('✅ Connection accepted, peer public key saved');
          }

          // Don't save this as a regular message
          continue;
        }

        // Handle conversation_deleted message
        if (parsed.type === 'conversation_deleted') {
          console.log('🗑️ Received conversation_deleted notification from peer');

          // Delete conversation locally
          const { db } = await import('../storage/db');

          await db.messages
            .where('conversationId')
            .equals(conversationId)
            .delete();

          await db.sessions
            .where('conversationId')
            .equals(conversationId)
            .delete();

          await db.conversations.delete(conversationId);

          console.log('✅ Conversation deleted locally after peer notification');

          // Don't save this as a regular message
          continue;
        }

        // Handle delivery receipt
        if (parsed.type === 'delivery_receipt') {
          console.log('📬 Received delivery receipt');
          await updateMessageStatus(conversationId, parsed.messageId, 'delivered');
          continue;
        }

        // Handle read receipt
        if (parsed.type === 'read_receipt') {
          console.log('👁️ Received read receipt');
          // Update all messages in the list to read status
          for (const msgId of parsed.messageIds || []) {
            await updateMessageStatus(conversationId, msgId, 'read');
          }
          continue;
        }

        // Handle typing indicator
        if (parsed.type === 'typing') {
          console.log('⌨️ Received typing indicator');
          // Emit a custom event that the UI can listen to
          window.dispatchEvent(new CustomEvent('typing-indicator', {
            detail: { conversationId, timestamp: parsed.timestamp }
          }));
          continue;
        }

        // Handle message edit
        if (parsed.type === 'message_edit') {
          console.log('✏️ Received message edit notification');
          const { db } = await import('../storage/db');

          // Find the message by serverMessageId
          const messages = await db.messages
            .where('conversationId')
            .equals(conversationId)
            .and(msg => msg.serverMessageId === parsed.messageId)
            .toArray();

          if (messages.length > 0) {
            const message = messages[0];
            message.content = parsed.newContent;
            message.edited = true;
            message.editedAt = new Date(parsed.timestamp);
            await db.messages.put(message);
            console.log(`✅ Updated message ${parsed.messageId} with edited content`);
          } else {
            console.log(`⚠️ Message ${parsed.messageId} not found for edit update`);
          }
          continue;
        }

        // Handle message delete
        if (parsed.type === 'message_delete') {
          console.log('🗑️ Received message delete notification');
          const { db } = await import('../storage/db');

          // Find the message by serverMessageId
          const messages = await db.messages
            .where('conversationId')
            .equals(conversationId)
            .and(msg => msg.serverMessageId === parsed.messageId)
            .toArray();

          if (messages.length > 0) {
            const message = messages[0];
            message.content = '';
            message.deleted = true;
            message.deletedAt = new Date(parsed.timestamp);
            await db.messages.put(message);
            console.log(`✅ Deleted message ${parsed.messageId}`);
          } else {
            console.log(`⚠️ Message ${parsed.messageId} not found for delete update`);
          }
          continue;
        }
      } catch (error) {
        // Not JSON, it's a regular message
        console.log('ℹ️ Message is not JSON control message, treating as regular message');
      }

      // Save message locally with server message ID for receipt tracking
      const message: Message = {
        id: generateRandomId(16),
        conversationId,
        direction: 'received',
        content: plaintext,
        timestamp: msg.receivedAt,
        status: 'delivered',
        serverMessageId: msg.id, // Store server ID for read receipt tracking
      };

      await saveMessage(message);
      decryptedMessages.push(message);

      // Show notification if tab is inactive
      console.log('🔔 Checking if should show notification...', {
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
      });
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        console.log('✅ Tab is hidden, checking notification settings...');
        const { getNotificationSettings, showMessageNotification } = await import('../utils/notificationManager');
        const settings = await getNotificationSettings();
        console.log('📋 Notification settings:', settings);

        if (settings.enabled && settings.permission === 'granted') {
          const conversation = await getConversation(conversationId);
          if (conversation) {
            console.log('📨 Showing notification for:', conversation.peerName);
            await showMessageNotification({
              conversationId,
              senderName: conversation.peerName || 'Anonymous',
              messagePreview: settings.showPreview ? plaintext : 'New message',
            });
          }
        } else {
          console.log('❌ Notification not shown:', {
            enabled: settings.enabled,
            permission: settings.permission
          });
        }
      } else {
        console.log('⏭️ Tab is visible, skipping notification');
      }

      // Send delivery receipt to sender
      await sendDeliveryReceipt(conversationId, msg.id);
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  }

  // No session state to update with NaCl! Each message is independent.

  // Update conversation with the last message ID so server knows which messages to return next time
  if (messages.length > 0) {
    const lastServerMessageId = messages[messages.length - 1].id;
    const updatedConversation = await getConversation(conversationId);
    if (updatedConversation) {
      updatedConversation.lastReceivedMessageId = lastServerMessageId;
      updatedConversation.updatedAt = new Date();
      await saveConversation(updatedConversation);
      console.log(`💾 Updated lastReceivedMessageId to: ${lastServerMessageId}`);
    }
  }

  return decryptedMessages;
}

/**
 * Accept an invite and create a conversation
 * Using simple NaCl - just exchange public keys!
 */
export async function acceptInvite(
  inviteData: {
    relayUrl: string;
    queueId: string;
    queueUrl: string;
    keyBundle: KeyBundle;
  }
): Promise<string> {
  // Create our receive queue
  const { createReceiveQueue } = await import('./queue');
  const ourQueue = await createReceiveQueue(inviteData.relayUrl);

  // Get our encryption public key
  const { db } = await import('../storage/db');
  const identities = await db.identity.toArray();
  if (identities.length === 0) {
    throw new Error('Identity not found');
  }

  const myPublicKey = identities[0].identityKeyPair.publicKey;

  // Create conversation with peer's public key
  const conversationId = generateRandomId(16);
  const { generateConversationName } = await import('../utils/nameGenerator');
  const conversation: Conversation = {
    id: conversationId,
    peerName: generateConversationName(),
    myReceiveQueueId: ourQueue.queueId,
    myReceiveQueueToken: ourQueue.accessToken,
    myReceiveQueueUrl: ourQueue.queueUrl,
    peerSendQueueId: inviteData.queueId,
    peerSendQueueUrl: inviteData.queueUrl,
    peerPublicKey: inviteData.keyBundle.publicKey, // Save peer's public key
    relayUrl: inviteData.relayUrl,
    unreadCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveConversation(conversation);

  // Create our key bundle to send to peer (just public key, no complexity!)
  const ourKeyBundle: KeyBundle = {
    publicKey: myPublicKey,
  };

  // Send connection accepted message as PLAINTEXT
  const connectionMessage = {
    type: 'connection_accepted',
    queueId: ourQueue.queueId,
    queueUrl: ourQueue.queueUrl,
    keyBundle: ourKeyBundle, // Just our public key
  };

  // Send as plaintext (so peer can read it without encryption)
  const payload = new TextEncoder().encode(JSON.stringify(connectionMessage));
  await sendMessageToQueue(inviteData.queueId, payload, inviteData.relayUrl);

  console.log('✅ Conversation created with simple NaCl encryption');
  return conversationId;
}

/**
 * Handle incoming connection accepted message
 */
export async function handleConnectionAccepted(
  conversationId: string,
  peerInfo: { queueId: string; queueUrl: string; publicKey?: string }
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Update conversation with peer's queue info and public key
  conversation.peerSendQueueId = peerInfo.queueId;
  conversation.peerSendQueueUrl = peerInfo.queueUrl;
  if (peerInfo.publicKey) {
    conversation.peerPublicKey = peerInfo.publicKey; // Save peer's public encryption key
  }
  conversation.updatedAt = new Date();

  await saveConversation(conversation);
}

/**
 * Delete a conversation and notify the peer
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Send deletion notification to peer (if we have their queue)
  if (conversation.peerSendQueueId) {
    try {
      const deleteMessage = {
        type: 'conversation_deleted',
        timestamp: new Date().toISOString(),
      };

      const payload = new TextEncoder().encode(JSON.stringify(deleteMessage));
      await sendMessageToQueue(
        conversation.peerSendQueueId,
        payload,
        conversation.relayUrl
      );

      console.log('🗑️ Sent deletion notification to peer');
    } catch (error) {
      console.error('Failed to notify peer about deletion:', error);
      // Continue with local deletion even if notification fails
    }
  }

  // Delete locally
  const { db } = await import('../storage/db');

  // Delete all messages in conversation
  await db.messages
    .where('conversationId')
    .equals(conversationId)
    .delete();

  // Delete session
  await db.sessions
    .where('conversationId')
    .equals(conversationId)
    .delete();

  // Delete conversation
  await db.conversations.delete(conversationId);

  console.log('✅ Conversation deleted locally');
}

/**
 * Send delivery receipt for a received message
 */
export async function sendDeliveryReceipt(
  conversationId: string,
  messageId: string
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation || !conversation.peerSendQueueId) {
    return; // Can't send receipt if we don't have peer's queue
  }

  try {
    const receiptMessage = {
      type: 'delivery_receipt',
      messageId,
      timestamp: new Date().toISOString(),
    };

    const payload = new TextEncoder().encode(JSON.stringify(receiptMessage));
    await sendMessageToQueue(
      conversation.peerSendQueueId,
      payload,
      conversation.relayUrl
    );

    console.log(`📬 Sent delivery receipt for message ${messageId}`);
  } catch (error) {
    console.error('Failed to send delivery receipt:', error);
  }
}

/**
 * Send read receipts for messages
 */
export async function sendReadReceipts(
  conversationId: string,
  messageIds: string[]
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation || !conversation.peerSendQueueId) {
    return;
  }

  try {
    const receiptMessage = {
      type: 'read_receipt',
      messageIds,
      timestamp: new Date().toISOString(),
    };

    const payload = new TextEncoder().encode(JSON.stringify(receiptMessage));
    await sendMessageToQueue(
      conversation.peerSendQueueId,
      payload,
      conversation.relayUrl
    );

    console.log(`👁️ Sent read receipts for ${messageIds.length} messages`);
  } catch (error) {
    console.error('Failed to send read receipts:', error);
  }
}

/**
 * Send typing indicator
 */
export async function sendTypingIndicator(
  conversationId: string
): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation || !conversation.peerSendQueueId) {
    return;
  }

  try {
    const typingMessage = {
      type: 'typing',
      timestamp: new Date().toISOString(),
    };

    const payload = new TextEncoder().encode(JSON.stringify(typingMessage));
    await sendMessageToQueue(
      conversation.peerSendQueueId,
      payload,
      conversation.relayUrl
    );

    console.log('⌨️ Sent typing indicator');
  } catch (error) {
    console.error('Failed to send typing indicator:', error);
  }
}

/**
 * Update message status based on received receipt
 */
export async function updateMessageStatus(
  conversationId: string,
  messageId: string,
  status: 'delivered' | 'read'
): Promise<void> {
  const { db } = await import('../storage/db');

  // Find message by serverMessageId
  const messages = await db.messages
    .where('conversationId')
    .equals(conversationId)
    .and(msg => msg.direction === 'sent' && msg.serverMessageId === messageId)
    .toArray();

  if (messages.length > 0) {
    const message = messages[0];
    // Don't downgrade from read to delivered
    if (message.status === 'read' && status === 'delivered') {
      return;
    }
    message.status = status;
    await db.messages.put(message);
    console.log(`✅ Updated message ${messageId} status to ${status}`);
  } else {
    console.log(`⚠️ Message ${messageId} not found for status update`);
  }
}

/**
 * Edit an existing message
 */
export async function editMessage(
  conversationId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  const { db } = await import('../storage/db');

  // Find the message by local ID
  const message = await db.messages.get(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  if (message.conversationId !== conversationId) {
    throw new Error('Message does not belong to this conversation');
  }

  // Update message content and set edited flag
  message.content = newContent;
  message.edited = true;
  message.editedAt = new Date();

  // Save updated message
  await db.messages.put(message);

  console.log(`✏️ Message ${messageId} edited locally`);

  // Send edit notification to peer
  const conversation = await getConversation(conversationId);
  if (conversation && conversation.peerSendQueueId) {
    try {
      const editMessage = {
        type: 'message_edit',
        messageId: message.serverMessageId, // Use server message ID so peer can find it
        newContent,
        timestamp: new Date().toISOString(),
      };

      // Encrypt the edit notification using NaCl
      if (!conversation.peerPublicKey) {
        throw new Error('Peer public key not found');
      }

      const { db: identityDb } = await import('../storage/db');
      const identities = await identityDb.identity.toArray();
      if (identities.length === 0) {
        throw new Error('Identity not found');
      }

      const myPrivateKey = decodeKey(identities[0].identityKeyPair.privateKey);
      const peerPublicKey = decodeKey(conversation.peerPublicKey);

      // Encrypt the edit notification
      const encryptedMessage = encryptMessage(
        JSON.stringify(editMessage),
        peerPublicKey,
        myPrivateKey
      );

      // Serialize and send
      const payload = serializeEncryptedMessage(encryptedMessage);
      await sendMessageToQueue(
        conversation.peerSendQueueId,
        payload,
        conversation.relayUrl
      );

      console.log(`📤 Sent edit notification to peer for message ${messageId}`);

    } catch (error) {
      console.error('Failed to send edit notification to peer:', error);
      // Continue even if notification fails - local edit is saved
    }
  }
}

/**
 * Reset conversation sync (clear lastReceivedMessageId to fetch all queued messages)
 */
export async function resetConversationSync(conversationId: string): Promise<void> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  console.log('🔄 Resetting conversation sync - clearing lastReceivedMessageId');
  conversation.lastReceivedMessageId = undefined;
  await saveConversation(conversation);
  console.log('✅ Conversation sync reset - next poll will fetch all messages');
}

/**
 * Process a single message received via WebSocket
 */
export async function processWebSocketMessage(
  conversationId: string,
  wsMessage: { queueId: string; messageId: string; payload: Uint8Array }
): Promise<void> {
  console.log(`📨 Processing WebSocket message for conversation ${conversationId}`, {
    messageId: wsMessage.messageId,
    payloadLength: wsMessage.payload.length,
    payloadType: wsMessage.payload.constructor.name
  });

  // Check if this message is already being processed
  if (processingWebSocketMessages.has(wsMessage.messageId)) {
    console.log(`⏳ WebSocket message ${wsMessage.messageId} already being processed, skipping duplicate`);
    return;
  }

  // Mark message as being processed
  processingWebSocketMessages.add(wsMessage.messageId);

  try {
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      console.error('Conversation not found for WebSocket message');
      return;
    }

    // Check if we've already processed this message
    const { db } = await import('../storage/db');
    const existingMessages = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .and(m => m.serverMessageId === wsMessage.messageId)
      .toArray();

    if (existingMessages.length > 0) {
      console.log(`⏭️ WebSocket message ${wsMessage.messageId} already processed, skipping`);
      return;
    }

    // Get our identity keys for decryption
    const identities = await db.identity.toArray();
    if (identities.length === 0) {
      console.error('Identity not found');
      return;
    }

    const myPrivateKey = decodeKey(identities[0].identityKeyPair.privateKey);
    let peerPublicKey: Uint8Array | null = null;

    // Get peer's public key if we have it
    if (conversation.peerPublicKey) {
      peerPublicKey = decodeKey(conversation.peerPublicKey);
    }

    // First, check if this is a plaintext control message
    let plaintext: string = '';
    let isControlMessage = false;

    try {
      const decodedPayload = new TextDecoder().decode(wsMessage.payload);
      const parsed = JSON.parse(decodedPayload);
      if (parsed.type === 'connection_accepted' ||
          parsed.type === 'conversation_deleted' ||
          parsed.type === 'delivery_receipt' ||
          parsed.type === 'read_receipt' ||
          parsed.type === 'typing') {
        plaintext = decodedPayload;
        isControlMessage = true;
      }
    } catch {
      // Not a plain JSON control message, continue with decryption
    }

    if (!isControlMessage) {
      // For encrypted messages, we need peer's public key
      if (!peerPublicKey) {
        console.error('Peer public key not found - cannot decrypt WebSocket message');
        return;
      }

      // Deserialize encrypted message
      const encryptedMessage = deserializeEncryptedMessage(wsMessage.payload);

      // Decrypt the message
      plaintext = decryptMessage(encryptedMessage, peerPublicKey, myPrivateKey);
    }

    // Check if this is a special control message
    try {
      const parsed = JSON.parse(plaintext);

      // Handle different control message types
      if (parsed.type === 'connection_accepted') {
        console.log('📨 Received connection_accepted via WebSocket');
        await handleConnectionAccepted(conversationId, {
          queueId: parsed.queueId,
          queueUrl: parsed.queueUrl,
          publicKey: parsed.keyBundle?.publicKey,
        });
        return;
      }

      if (parsed.type === 'conversation_deleted') {
        console.log('🗑️ Received conversation_deleted via WebSocket');
        await db.messages.where('conversationId').equals(conversationId).delete();
        await db.sessions.where('conversationId').equals(conversationId).delete();
        await db.conversations.delete(conversationId);
        return;
      }

      if (parsed.type === 'delivery_receipt') {
        console.log('📬 Received delivery receipt via WebSocket');
        await updateMessageStatus(conversationId, parsed.messageId, 'delivered');
        return;
      }

      if (parsed.type === 'read_receipt') {
        console.log('👁️ Received read receipt via WebSocket');
        for (const msgId of parsed.messageIds || []) {
          await updateMessageStatus(conversationId, msgId, 'read');
        }
        return;
      }

      if (parsed.type === 'typing') {
        console.log('⌨️ Received typing indicator via WebSocket');
        window.dispatchEvent(new CustomEvent('typing-indicator', {
          detail: { conversationId, timestamp: parsed.timestamp }
        }));
        return;
      }

      if (parsed.type === 'message_edit') {
        console.log('✏️ Received message edit via WebSocket');
        const messages = await db.messages
          .where('conversationId')
          .equals(conversationId)
          .and(msg => msg.serverMessageId === parsed.messageId)
          .toArray();

        if (messages.length > 0) {
          const message = messages[0];
          message.content = parsed.newContent;
          message.edited = true;
          message.editedAt = new Date(parsed.timestamp);
          await db.messages.put(message);
        }
        return;
      }

      if (parsed.type === 'message_delete') {
        console.log('🗑️ Received message delete via WebSocket');
        const messages = await db.messages
          .where('conversationId')
          .equals(conversationId)
          .and(msg => msg.serverMessageId === parsed.messageId)
          .toArray();

        if (messages.length > 0) {
          const message = messages[0];
          message.content = '';
          message.deleted = true;
          message.deletedAt = new Date(parsed.timestamp);
          await db.messages.put(message);
        }
        return;
      }
    } catch (error) {
      // Not JSON, it's a regular message
      console.log('ℹ️ WebSocket message is a regular text message');
    }

    // Save regular message
    const message: Message = {
      id: generateRandomId(16),
      conversationId,
      direction: 'received',
      content: plaintext,
      timestamp: new Date(),
      status: 'delivered',
      serverMessageId: wsMessage.messageId,
    };

    await saveMessage(message);
    console.log(`💾 WebSocket message saved to database`);

    // Show notification if tab is inactive
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      const { getNotificationSettings, showMessageNotification } = await import('../utils/notificationManager');
      const settings = await getNotificationSettings();

      if (settings.enabled && settings.permission === 'granted') {
        await showMessageNotification({
          conversationId,
          senderName: conversation.peerName || 'Anonymous',
          messagePreview: settings.showPreview ? plaintext : 'New message',
        });
      }
    }

    // Send delivery receipt
    await sendDeliveryReceipt(conversationId, wsMessage.messageId);

    // Update conversation's last received message ID
    conversation.lastReceivedMessageId = wsMessage.messageId;
    conversation.updatedAt = new Date();
    await saveConversation(conversation);
  } catch (error) {
    console.error('Failed to process WebSocket message:', error);
  } finally {
    // Remove from processing set
    processingWebSocketMessages.delete(wsMessage.messageId);
  }
}

/**
 * Delete an existing message
 */
export async function deleteMessage(
  conversationId: string,
  messageId: string
): Promise<void> {
  const { db } = await import('../storage/db');

  // Find the message by local ID
  const message = await db.messages.get(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  if (message.conversationId !== conversationId) {
    throw new Error('Message does not belong to this conversation');
  }

  // Clear content and set deleted flag
  message.content = '';
  message.deleted = true;
  message.deletedAt = new Date();

  // Save updated message
  await db.messages.put(message);

  console.log(`🗑️ Message ${messageId} deleted locally`);

  // Send delete notification to peer
  const conversation = await getConversation(conversationId);
  if (conversation && conversation.peerSendQueueId) {
    try {
      const deleteMessageNotification = {
        type: 'message_delete',
        messageId: message.serverMessageId, // Use server message ID so peer can find it
        timestamp: new Date().toISOString(),
      };

      // Encrypt the delete notification using NaCl
      if (!conversation.peerPublicKey) {
        throw new Error('Peer public key not found');
      }

      const { db: identityDb } = await import('../storage/db');
      const identities = await identityDb.identity.toArray();
      if (identities.length === 0) {
        throw new Error('Identity not found');
      }

      const myPrivateKey = decodeKey(identities[0].identityKeyPair.privateKey);
      const peerPublicKey = decodeKey(conversation.peerPublicKey);

      // Encrypt the delete notification
      const encryptedMessage = encryptMessage(
        JSON.stringify(deleteMessageNotification),
        peerPublicKey,
        myPrivateKey
      );

      // Serialize and send
      const payload = serializeEncryptedMessage(encryptedMessage);
      await sendMessageToQueue(
        conversation.peerSendQueueId,
        payload,
        conversation.relayUrl
      );

      console.log(`📤 Sent delete notification to peer for message ${messageId}`);

    } catch (error) {
      console.error('Failed to send delete notification to peer:', error);
      // Continue even if notification fails - local deletion is saved
    }
  }
}
