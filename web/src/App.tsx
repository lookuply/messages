import { useEffect, useState, useRef } from 'react';
import { useAppStore, AppView } from './stores/appStore';
import { initializeIdentity, decodeKey } from './crypto/identity';
import { createReceiveQueue } from './messaging/queue';
import { saveIdentity } from './storage/db';
import { DEFAULT_RELAY_URL } from './network/api';
import { validateInviteCode } from './utils/inviteValidation';
import { QRCodeSVG } from 'qrcode.react';
import { QrReader } from 'react-qr-reader';
import { registerServiceWorker } from './utils/serviceWorker';
import { SettingsView } from './components/SettingsView';
import './App.css';

function App() {
  const { initialize, initialized, currentView, setView, error, conversations, activeConversationId, loadMessages } = useAppStore();

  useEffect(() => {
    initialize();
  }, []);

  // Register service worker for PWA
  useEffect(() => {
    if (initialized) {
      registerServiceWorker().catch(error => {
        console.error('Failed to register service worker:', error);
      });
    }
  }, [initialized]);

  // Check for pending invite in localStorage after initialization
  useEffect(() => {
    if (!initialized) return;

    const pendingInvite = localStorage.getItem('pendingInvite');
    if (pendingInvite) {
      console.log('📦 Found pending invite in localStorage from first-time setup');
      console.log('🚀 Processing invite...');

      // Clear from localStorage
      localStorage.removeItem('pendingInvite');

      // Store in app state and navigate to QR scanner
      useAppStore.setState({ pendingInviteCode: pendingInvite });
      setView(AppView.QR_SCANNER);
    }
  }, [initialized]);

  // Handle invite URL from hash
  useEffect(() => {
    if (!initialized) {
      console.log('⏳ Waiting for app initialization before processing invite URL...');
      return;
    }

    const handleInviteFromUrl = async () => {
      const hash = window.location.hash;
      console.log('🔍 Checking hash:', hash);

      if (hash.startsWith('#invite=')) {
        const inviteParam = hash.substring(8); // Remove '#invite='
        console.log('📨 Invite URL detected!');

        try {
          const inviteBase64 = decodeURIComponent(inviteParam);
          console.log('📦 Decoding base64...');
          const inviteJson = atob(inviteBase64);
          console.log('✅ Invite decoded successfully');

          // Check if user needs to do first time setup
          const { currentView } = useAppStore.getState();
          if (currentView === AppView.FIRST_TIME_SETUP) {
            console.log('⚠️ User needs to complete first time setup first');
            console.log('💾 Storing invite in localStorage for after setup...');
            // Store in localStorage so it persists through page reload
            localStorage.setItem('pendingInvite', inviteJson);
            // Clear the hash since we saved it
            window.location.hash = '';
            return;
          }

          // Clear the hash only if we're processing it now
          window.location.hash = '';

          console.log('🚀 Setting pending invite and navigating to QR scanner...');

          // Store the invite code in the app store
          useAppStore.setState({ pendingInviteCode: inviteJson });

          // Navigate to QR scanner
          setView(AppView.QR_SCANNER);
        } catch (error) {
          console.error('❌ Failed to parse invite from URL:', error);
          alert('Neplatný invite link');
        }
      }
    };

    handleInviteFromUrl();
  }, [initialized]);

  // Global polling for all conversations (checks for deletion notifications, etc.)
  useEffect(() => {
    if (!initialized) return;

    const pollAllConversations = async () => {
      // Get fresh conversations list from store
      const { conversations: currentConversations, loadConversations, activeConversationId: activeId, loadMessages } = useAppStore.getState();

      if (currentConversations.length === 0) return;

      for (const conv of currentConversations) {
        try {
          const { pollAndDecryptMessages } = await import('./messaging/messageHandler');
          await pollAndDecryptMessages(conv.id);
        } catch (error) {
          // Silently ignore errors (conversation might have been deleted)
        }
      }

      // Reload conversations after polling in case any were deleted
      await loadConversations();

      // Reload messages for active conversation to show updated statuses
      if (activeId) {
        loadMessages(activeId);
      }
    };

    // Poll every 10 seconds
    const interval = setInterval(pollAllConversations, 10000);
    pollAllConversations(); // Initial poll

    return () => clearInterval(interval);
  }, [initialized]); // Only depend on initialized, not conversations

  if (!initialized) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen error={error} />;
  }

  switch (currentView) {
    case AppView.LOADING:
      return <LoadingScreen />;
    case AppView.FIRST_TIME_SETUP:
      return <FirstTimeSetup />;
    case AppView.CONVERSATION_LIST:
      return <ConversationList />;
    case AppView.MESSAGE_VIEW:
      return <MessageView />;
    case AppView.INVITE_GENERATOR:
      return <InviteGenerator />;
    case AppView.QR_SCANNER:
      return <QRScanner />;
    case AppView.SETTINGS:
      return <SettingsView />;
    default:
      return <LoadingScreen />;
  }
}

// Loading Screen
function LoadingScreen() {
  return (
    <div className="screen">
      <h1>Privacy Messaging</h1>
      <p>Loading...</p>
    </div>
  );
}

// Error Screen
function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="screen error">
      <h1>Error</h1>
      <p>{error}</p>
    </div>
  );
}

// First Time Setup
function FirstTimeSetup() {
  const { setView } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleSetup = async () => {
    setLoading(true);
    setStatus('Generating cryptographic keys...');

    try {
      // Generate identity
      const identity = await initializeIdentity();

      setStatus('Saving identity...');
      await saveIdentity(identity);

      setStatus('Setup complete!');

      // Refresh the app
      window.location.reload();
    } catch (error) {
      console.error('Setup failed:', error);
      setStatus(`Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <h1>🔐 Privacy Messaging</h1>
      <p>Vitajte! Tento systém používa end-to-end encryption pre maximálne súkromie.</p>
      <ul style={{ textAlign: 'left', maxWidth: '400px', margin: '20px auto' }}>
        <li>✅ Žiadne telefónne čísla ani emaily</li>
        <li>✅ E2E šifrované správy</li>
        <li>✅ Server nevie kto s kým komunikuje</li>
        <li>✅ Všetky dáta lokálne v prehliadači</li>
      </ul>
      <button onClick={handleSetup} disabled={loading} className="primary-button">
        {loading ? 'Nastavujem...' : 'Začať'}
      </button>
      {status && <p className="status">{status}</p>}
    </div>
  );
}

// Conversation List
function ConversationList() {
  const { conversations, setView, loadConversations } = useAppStore();

  return (
    <div className="screen">
      <div className="conversation-list-header">
        <h1>Konverzácie</h1>
        <button
          onClick={() => setView(AppView.SETTINGS)}
          className="settings-icon-button"
          aria-label="Nastavenia"
          title="Nastavenia"
        >
          ⚙️
        </button>
      </div>

      <div className="button-group">
        <button onClick={() => setView(AppView.INVITE_GENERATOR)} className="primary-button">
          + Nová konverzácia
        </button>
        <button onClick={() => setView(AppView.QR_SCANNER)} className="secondary-button">
          📷 Skenovať QR
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="empty-state">Žiadne konverzácie. Vytvorte novú!</p>
      ) : (
        <div className="conversation-list">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="conversation-item"
            >
              <div onClick={() => setView(AppView.MESSAGE_VIEW, conv.id)} style={{ flex: 1 }}>
                <div className="conversation-header">
                  <strong>{conv.peerName || 'Anonymous'}</strong>
                  {conv.unreadCount > 0 && (
                    <span className="unread-badge">{conv.unreadCount}</span>
                  )}
                </div>
                <div className="conversation-preview">
                  {conv.lastMessagePreview || 'No messages yet'}
                </div>
                <div className="conversation-time">
                  {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : ''}
                </div>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(`Zmazať konverzáciu "${conv.peerName}"?\n\nZmaže sa aj na druhej strane.`)) {
                    const { deleteConversation } = await import('./messaging/messageHandler');
                    await deleteConversation(conv.id);
                    loadConversations();
                  }
                }}
                className="conversation-delete-button"
                title="Zmazať konverzáciu"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Message View
function MessageView() {
  const { messages, activeConversationId, setView, addMessage, loadMessages, loadConversations } = useAppStore();
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationName, setConversationName] = useState<string>('Konverzácia');
  const [revealedMessageId, setRevealedMessageId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [lastTypingSent, setLastTypingSent] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
  const [editingOriginalMessageId, setEditingOriginalMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea based on content
  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Only resize if content has newlines or exceeds single line
      const hasNewlines = messageText.includes('\n');
      if (!hasNewlines && textarea.scrollHeight <= 46) {
        // Single line - keep at minimum height
        textarea.style.height = '24px';
        return;
      }

      // Multiple lines - resize based on content
      textarea.style.height = 'auto';
      const newHeight = Math.max(24, Math.min(textarea.scrollHeight, 120));
      textarea.style.height = newHeight + 'px';
    }
  };

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Clear typing indicator when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && isTyping) {
      setIsTyping(false);
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        setTypingTimeout(null);
      }
    }
  }, [messages.length]); // Only watch message count changes

  // Handle mobile keyboard (adjust input position when keyboard opens)
  useEffect(() => {
    const handleResize = () => {
      // Scroll to bottom when keyboard opens/closes
      setTimeout(() => scrollToBottom(), 100);
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  // Load conversation name
  useEffect(() => {
    if (!activeConversationId) return;

    const loadConversationName = async () => {
      const { getConversation } = await import('./storage/db');
      const conv = await getConversation(activeConversationId);
      if (conv?.peerName) {
        setConversationName(conv.peerName);
      }
    };

    loadConversationName();
  }, [activeConversationId]);

  // Poll for new messages periodically
  useEffect(() => {
    if (!activeConversationId) return;

    // Poll immediately on mount
    const pollOnce = async () => {
      try {
        const { pollAndDecryptMessages } = await import('./messaging/messageHandler');
        const newMessages = await pollAndDecryptMessages(activeConversationId);

        if (newMessages.length > 0) {
          // Add new messages to store directly instead of reloading all
          newMessages.forEach(msg => addMessage(msg));
        }
      } catch (error) {
        console.error('Failed to poll messages:', error);
      }
    };

    pollOnce(); // Poll immediately

    const pollInterval = setInterval(pollOnce, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [activeConversationId]);

  // Listen for typing indicators
  useEffect(() => {
    if (!activeConversationId) return;

    const handleTypingIndicator = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { conversationId } = customEvent.detail;

      if (conversationId === activeConversationId) {
        console.log('⌨️ Peer is typing...');
        setIsTyping(true);

        // Clear existing timeout
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }

        // Hide typing indicator after 3 seconds of no activity
        const timeout = setTimeout(() => {
          setIsTyping(false);
        }, 3000);

        setTypingTimeout(timeout);
      }
    };

    window.addEventListener('typing-indicator', handleTypingIndicator);

    return () => {
      window.removeEventListener('typing-indicator', handleTypingIndicator);
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [activeConversationId, typingTimeout]);

  // Send read receipts for received messages ONLY when page gets focus/visibility
  useEffect(() => {
    if (!activeConversationId) return;

    const sendReadReceiptsForUnread = async () => {
      // CRITICAL: Only send if page is visible AND focused
      // Use visibility API for reliable tab visibility check
      if (document.visibilityState !== 'visible') {
        console.log('⏸️ Not sending read receipts - page visibility:', document.visibilityState);
        return;
      }

      if (document.hidden) {
        console.log('⏸️ Not sending read receipts - document.hidden is true');
        return;
      }

      if (!document.hasFocus()) {
        console.log('⏸️ Not sending read receipts - page does not have focus');
        return;
      }

      // Get fresh messages from store
      const { messages: currentMessages, loadMessages } = useAppStore.getState();

      // Find all received messages that haven't been marked as read
      const unreadMessages = currentMessages.filter(
        (msg) => msg.conversationId === activeConversationId &&
                 msg.direction === 'received' &&
                 msg.status !== 'read'
      );

      if (unreadMessages.length === 0) return;

      console.log(`👁️ Page is visible and focused! Sending read receipts for ${unreadMessages.length} messages`);

      try {
        const { sendReadReceipts } = await import('./messaging/messageHandler');
        // Use serverMessageId (the ID from when message was sent to our queue)
        const messageIds = unreadMessages
          .filter((msg) => msg.serverMessageId) // Only send receipts for messages with server ID
          .map((msg) => msg.serverMessageId!);

        if (messageIds.length === 0) return;

        await sendReadReceipts(activeConversationId, messageIds);

        // Mark messages as read locally
        const { db } = await import('./storage/db');
        for (const msg of unreadMessages) {
          msg.status = 'read';
          await db.messages.put(msg);
        }

        // Reload to show updated status
        loadMessages(activeConversationId);
      } catch (error) {
        console.error('Failed to send read receipts:', error);
      }
    };

    // Listen for visibility change (tab comes to foreground)
    const handleVisibilityChange = () => {
      console.log('👀 Visibility changed to:', document.visibilityState);
      if (document.visibilityState === 'visible') {
        console.log('📱 Tab became visible, checking focus...');
        // Delay to ensure focus state is updated
        setTimeout(() => {
          sendReadReceiptsForUnread();
        }, 200);
      }
    };

    // Listen for focus event (window gets focus)
    const handleFocus = () => {
      console.log('🎯 Window gained focus');
      // Only send if also visible
      if (document.visibilityState === 'visible') {
        sendReadReceiptsForUnread();
      }
    };

    // Send on mount ONLY if page is visible and focused
    if (document.visibilityState === 'visible' && !document.hidden && document.hasFocus()) {
      console.log('✅ Initial load with focus, sending read receipts');
      setTimeout(() => sendReadReceiptsForUnread(), 100);
    } else {
      console.log('⏭️ Initial load without focus, waiting for visibility/focus event');
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeConversationId]); // ONLY depend on activeConversationId, NOT messages

  const handleTyping = async (text: string) => {
    setMessageText(text);

    // Auto-resize textarea
    setTimeout(() => autoResizeTextarea(), 0);

    if (!activeConversationId) return;

    // Send typing indicator (throttled to once every 2 seconds)
    if (text.length > 0) {
      const now = Date.now();
      if (now - lastTypingSent > 2000) {
        try {
          const { sendTypingIndicator } = await import('./messaging/messageHandler');
          await sendTypingIndicator(activeConversationId);
          setLastTypingSent(now);
        } catch (error) {
          console.error('Failed to send typing indicator:', error);
        }
      }
    }
  };

  const handleSend = async () => {
    console.log('🚀 handleSend called!', { messageText, activeConversationId, sending });

    if (!messageText.trim() || !activeConversationId || sending) {
      console.log('❌ Early return:', {
        noText: !messageText.trim(),
        noConversation: !activeConversationId,
        alreadySending: sending
      });
      return;
    }

    console.log('✅ Proceeding with send...');
    setSending(true);
    const textToSend = messageText;
    const isEditing = editingOriginalMessageId !== null;
    const originalMessageId = editingOriginalMessageId;

    setMessageText('');
    setEditingOriginalMessageId(null); // Clear editing state

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (isEditing && originalMessageId) {
        console.log('📝 Editing message...');
        // Edit existing message
        const { editMessage } = await import('./messaging/messageHandler');
        await editMessage(activeConversationId, originalMessageId, textToSend.trim());
        console.log('✅ Message edited successfully');
      } else {
        console.log('📤 Sending new message...', { conversationId: activeConversationId, text: textToSend });
        // Send new message
        const { sendEncryptedMessage } = await import('./messaging/messageHandler');
        console.log('🔧 sendEncryptedMessage imported, calling...');
        await sendEncryptedMessage(activeConversationId, textToSend);
        console.log('✅ Message sent successfully');
      }

      console.log('🔄 Reloading messages...');
      // Reload to show updated/sent message immediately
      loadMessages(activeConversationId);
      console.log('✅ Messages reloaded');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        error
      });
      alert(`Chyba pri odosielaní: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setMessageText(textToSend); // Restore message on error
      if (isEditing) {
        setEditingOriginalMessageId(originalMessageId); // Restore editing state
      }
    } finally {
      console.log('🏁 Send finished, setting sending=false');
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!activeConversationId) return;

    if (!confirm(`Naozaj chcete zmazať konverzáciu "${conversationName}"?\n\nKonverzácia sa zmaže aj na druhej strane.`)) {
      return;
    }

    try {
      const { deleteConversation } = await import('./messaging/messageHandler');
      await deleteConversation(activeConversationId);

      // Reload conversations and go back to list
      await loadConversations();
      setView(AppView.CONVERSATION_LIST);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Nepodarilo sa zmazať konverzáciu');
    }
  };

  const handleLongPressStart = (messageId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      // Show context menu after 500ms
      setContextMenuMessageId(messageId);
      setContextMenuOpen(true);
      setRevealedMessageId(null); // Close timestamp reveal
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleStartEdit = (messageId: string, currentText: string) => {
    // Close context menu
    setContextMenuOpen(false);
    setContextMenuMessageId(null);

    // Store original message ID for editing
    setEditingOriginalMessageId(messageId);

    // Populate main input box with message text
    setMessageText(currentText);

    // Focus the textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditingOriginalMessageId(null);
    setMessageText('');
  };

  const handleDeleteMessage = async (messageId: string) => {
    // Close context menu
    setContextMenuOpen(false);
    setContextMenuMessageId(null);

    if (!activeConversationId) return;

    if (!confirm('Naozaj chcete zmazať túto správu?')) {
      return;
    }

    try {
      const { deleteMessage } = await import('./messaging/messageHandler');
      await deleteMessage(activeConversationId, messageId);

      // Reload messages to show the deleted message
      loadMessages(activeConversationId);
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Nepodarilo sa zmazať správu');
    }
  };

  const handleCopyMessage = async (content: string) => {
    // Close context menu
    setContextMenuOpen(false);
    setContextMenuMessageId(null);

    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  return (
    <div className="screen message-view">
      <div className="message-header">
        <button onClick={() => setView(AppView.CONVERSATION_LIST)} className="back-button" aria-label="Späť">
          ←
        </button>
        <h2>{conversationName}</h2>
        <div style={{ position: 'relative' }}>
          <button
            className="menu-button"
            aria-label="Menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div
                className="menu-backdrop"
                onClick={() => setMenuOpen(false)}
              />
              <div className="dropdown-menu">
                <button
                  className="menu-item"
                  onClick={async () => {
                    setMenuOpen(false);
                    if (!activeConversationId) return;

                    try {
                      console.log('🔄 User clicked Reset Sync button');
                      const { resetConversationSync } = await import('./messaging/messageHandler');
                      await resetConversationSync(activeConversationId);

                      // Immediately reload messages
                      console.log('🔄 Triggering immediate message reload...');
                      loadMessages(activeConversationId);

                      alert('Synchronizácia resetovaná! Správy sa načítavajú...');
                    } catch (error) {
                      console.error('❌ Failed to reset sync:', error);
                      alert('Chyba pri resetovaní synchronizácie');
                    }
                  }}
                >
                  🔄 Resetovať synchronizáciu
                </button>
                <button
                  className="menu-item menu-item-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    handleDelete();
                  }}
                >
                  Zmazať konverzáciu
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <p className="empty-state">Zatiaľ žiadne správy</p>
        ) : (
          (() => {
            // Find the index of the last sent message
            const lastSentIndex = messages.map((m, i) => ({ msg: m, index: i }))
              .filter(({ msg }) => msg.direction === 'sent')
              .pop()?.index;

            return messages.map((msg, index) => {
              return (
                <div
                  key={msg.id}
                  className={`message-wrapper ${msg.direction === 'sent' ? 'sent' : 'received'} ${revealedMessageId === msg.id ? 'revealed' : ''}`}
                  onClick={() => setRevealedMessageId(revealedMessageId === msg.id ? null : msg.id)}
                  onTouchStart={() => handleLongPressStart(msg.id)}
                  onTouchEnd={handleLongPressEnd}
                  onTouchMove={handleLongPressEnd}
                  onMouseDown={() => handleLongPressStart(msg.id)}
                  onMouseUp={handleLongPressEnd}
                  onMouseLeave={handleLongPressEnd}
                >
                  <div className="message-timestamp-reveal">
                    {new Date(msg.timestamp).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                  <div className="message-bubble-container">
                    <div className={`message ${msg.direction === 'sent' ? 'sent' : 'received'} ${(msg as any).deleted ? 'deleted' : ''}`}>
                      <div className="message-content">{(msg as any).deleted ? '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' : msg.content}</div>
                    </div>
                    {msg.direction === 'sent' && index === lastSentIndex && (
                      <div className="message-status-text">
                        {(msg as any).deleted ? (
                          'Správa zmazaná'
                        ) : (
                          <>
                            {msg.status === 'sent' && 'Odoslané'}
                            {msg.status === 'delivered' && 'Doručené'}
                            {msg.status === 'read' && 'Prečítané'}
                            {(msg as any).edited && ' - upravené'}
                          </>
                        )}
                      </div>
                    )}
                    {msg.direction === 'received' && (
                      <div className="message-status-text">
                        {(msg as any).deleted ? (
                          'Správa zmazaná'
                        ) : (
                          (msg as any).edited && 'upravené'
                        )}
                      </div>
                    )}
                  </div>

                  {/* Context menu for editing/deleting/copying */}
                  {contextMenuOpen && contextMenuMessageId === msg.id && (
                    <>
                      <div
                        className="menu-backdrop"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenuOpen(false);
                          setContextMenuMessageId(null);
                        }}
                      />
                      <div className="message-context-menu">
                        {!(msg as any).deleted && msg.direction === 'sent' && (
                          <button
                            className="menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(msg.id, msg.content);
                            }}
                          >
                            Upraviť
                          </button>
                        )}
                        {!(msg as any).deleted && (
                          <button
                            className="menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMessage(msg.content);
                            }}
                          >
                            Kopírovať
                          </button>
                        )}
                        {msg.direction === 'sent' && (
                          <button
                            className="menu-item menu-item-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(msg.id);
                            }}
                          >
                            Zmazať
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            });
          })()
        )}

        {/* Fixed-height placeholder for typing indicator */}
        <div style={{
          height: '54px',
          flexShrink: 0,
          position: 'relative',
          opacity: isTyping ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out'
        }}>
          {isTyping && (
            <div className="message-wrapper received">
              <div className="message-bubble-container">
                <div className="message received typing-indicator">
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      <div className="message-input">
        {editingOriginalMessageId && (
          <div className="editing-indicator">
            <span>Upravuje sa správa...</span>
            <button onClick={handleCancelEdit} className="cancel-edit-btn">
              Zrušiť
            </button>
          </div>
        )}
        <div className="message-input-wrapper">
          <textarea
            ref={textareaRef}
            value={messageText}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === 'Escape' && editingOriginalMessageId) {
                handleCancelEdit();
              }
            }}
            placeholder="Napíšte správu..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-form-type="other"
            inputMode="text"
            enterKeyHint="send"
            name="message-text-input"
            rows={1}
          />
          {messageText.trim().length > 0 && (
            <button
              onClick={handleSend}
              className="send-button-circle"
              disabled={sending}
              aria-label="Poslať"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Invite Generator
function InviteGenerator() {
  const { identity, setView, loadConversations } = useAppStore();
  const [inviteCode, setInviteCode] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFullCode, setShowFullCode] = useState(false);
  const generatedRef = useRef(false);

  const generateInvite = async () => {
    if (!identity) return;

    setLoading(true);
    setStatus('Vytváram queue...');

    try {
      // Create receive queue
      const queueInfo = await createReceiveQueue(DEFAULT_RELAY_URL);

      setStatus('Generujem kľúče...');

      // Create simple NaCl key bundle (just our public key!)
      const { createKeyBundle: createNaClKeyBundle } = await import('./crypto/nacl');
      const keyBundle = createNaClKeyBundle({
        publicKey: decodeKey(identity.identityKeyPair.publicKey),
        privateKey: decodeKey(identity.identityKeyPair.privateKey),
      });

      // Create invite object
      const invite = {
        relayUrl: DEFAULT_RELAY_URL,
        queueId: queueInfo.queueId,
        queueUrl: queueInfo.queueUrl,
        keyBundle,
      };

      setStatus('Vytváram konverzáciu...');

      // Create pending conversation
      const { saveConversation } = await import('./storage/db');
      const { generateRandomId } = await import('./crypto/identity');
      const { generateConversationName } = await import('./utils/nameGenerator');

      const conversationId = generateRandomId(16);

      const conversation = {
        id: conversationId,
        peerName: generateConversationName(),
        myReceiveQueueId: queueInfo.queueId,
        myReceiveQueueToken: queueInfo.accessToken,
        myReceiveQueueUrl: queueInfo.queueUrl,
        peerSendQueueId: '',
        peerSendQueueUrl: '',
        peerPublicKey: '', // Will be set when peer accepts
        relayUrl: DEFAULT_RELAY_URL,
        unreadCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await saveConversation(conversation);
      await loadConversations();

      const inviteJson = JSON.stringify(invite);
      setInviteCode(inviteJson);

      // Create URL with base64-encoded invite
      const inviteBase64 = btoa(inviteJson);
      const currentUrl = window.location.origin;
      const inviteLink = `${currentUrl}/#invite=${encodeURIComponent(inviteBase64)}`;
      setInviteUrl(inviteLink);

      setStatus('Invite vygenerovaný!');
      setLoading(false);
    } catch (error) {
      console.error('Failed to generate invite:', error);
      setStatus(`Chyba: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!generatedRef.current) {
      generatedRef.current = true;
      generateInvite();
    }
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = inviteCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="screen">
      <button onClick={() => setView(AppView.CONVERSATION_LIST)} className="back-button">
        ← Späť
      </button>

      <h1>Pozvánka do konverzácie</h1>

      {loading ? (
        <p>Generujem pozvánku...</p>
      ) : (
        <>
          {/* QR Code */}
          <div className="qr-section">
            <h2>📱 Skenovať QR kód</h2>
            <p>Naskenujte fotoaparátom - otvorí sa priamo v prehliadači:</p>
            <div className="qr-container">
              <QRCodeSVG
                value={inviteUrl}
                size={256}
                level="M"
                includeMargin={true}
              />
            </div>
          </div>

          <div className="divider">ALEBO</div>

          {/* Share Link */}
          <div className="text-section">
            <h2>🔗 Zdieľať link</h2>
            <p>Pošlite tento link cez WhatsApp/Signal:</p>

            <div className="code-preview">
              <div className="invite-code-short">
                <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  {inviteUrl}
                </code>
              </div>
            </div>

            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  alert('✅ Link skopírovaný!');
                } catch (e) {
                  console.error('Copy failed:', e);
                }
              }}
              className="primary-button"
              style={{ marginTop: '10px' }}
            >
              📋 Kopírovať link
            </button>
          </div>

          <div className="divider">ALEBO</div>

          {/* Text Copy/Paste */}
          <div className="text-section">
            <h2>💻 JSON kód (advanced)</h2>
            <p>Pre manuálne vloženie:</p>

            <div className="code-preview">
              {showFullCode ? (
                <textarea
                  className="invite-code-full"
                  value={inviteCode}
                  readOnly
                  rows={8}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              ) : (
                <div className="invite-code-short">
                  <code>{inviteCode.substring(0, 60)}...{inviteCode.substring(inviteCode.length - 20)}</code>
                </div>
              )}
            </div>

            <div className="button-group">
              <button onClick={handleCopy} className="primary-button">
                {copied ? '✅ Skopírované!' : '📋 Kopírovať'}
              </button>

              <button
                onClick={() => setShowFullCode(!showFullCode)}
                className="secondary-button"
              >
                {showFullCode ? '👁️ Skryť' : '👁️ Zobraziť celý'}
              </button>
            </div>
          </div>

          {/* Security Warning */}
          <div className="security-warning">
            <h3>🔒 Bezpečné zdieľanie:</h3>
            <div className="warning-grid">
              <div className="safe">
                <strong>✅ Odporúčané:</strong>
                <ul>
                  <li>QR kód osobne</li>
                  <li>Signal, WhatsApp</li>
                  <li>iMessage</li>
                  <li>USB prenos</li>
                </ul>
              </div>
              <div className="unsafe">
                <strong>❌ Nikdy cez:</strong>
                <ul>
                  <li>Email</li>
                  <li>SMS</li>
                  <li>Facebook</li>
                  <li>Instagram</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}

// QR Scanner
function QRScanner() {
  const { setView, identity, loadConversations, pendingInviteCode } = useAppStore();
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('manual');
  const [inviteCode, setInviteCode] = useState('');
  const [status, setStatus] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const processingRef = useRef(false);

  // Check for pending invite from URL on mount
  useEffect(() => {
    if (pendingInviteCode && identity && !processingRef.current) {
      console.log('🔗 Auto-accepting invite from URL...');
      console.log('📝 Invite code length:', pendingInviteCode.length);

      // Mark as processing to prevent duplicate execution
      processingRef.current = true;

      // Clear pending invite immediately
      useAppStore.setState({ pendingInviteCode: null });

      setInviteCode(pendingInviteCode);
      setScanMode('manual');

      // Validate and accept
      console.log('🔍 Validating invite...');
      const result = validateInviteCode(pendingInviteCode);
      setValidation(result);

      console.log('✅ Validation result:', result.valid ? 'VALID' : 'INVALID');
      if (!result.valid) {
        console.error('❌ Validation error:', result.error);
        setStatus(`Neplatný kód: ${result.error}`);
        processingRef.current = false; // Reset on error
        return;
      }

      if (result.valid && result.invite) {
        console.log('✅ Invite is valid, accepting...');
        handleAccept(result.invite);
        // Note: processingRef stays true to prevent re-processing
      }
    } else if (pendingInviteCode && !identity) {
      console.error('❌ No identity available yet for pending invite!');
    } else if (processingRef.current) {
      console.log('⏭️ Already processing invite, skipping...');
    }
  }, [pendingInviteCode, identity]);

  const handleScan = (result: any) => {
    if (result) {
      const text = result.text || result;
      setInviteCode(text);
      setScanMode('manual'); // Switch to manual to show what was scanned
      validateAndAccept(text);
    }
  };

  const handleManualInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInviteCode(value);

    // Real-time validation
    if (value.trim()) {
      const result = validateInviteCode(value);
      setValidation(result);
    } else {
      setValidation(null);
    }
  };

  const validateAndAccept = async (code: string) => {
    if (accepting || !identity) return;

    const result = validateInviteCode(code);
    setValidation(result);

    if (!result.valid) {
      setStatus(`Neplatný kód: ${result.error}`);
      return;
    }

    // Auto-accept if QR scanned
    if (scanMode === 'camera') {
      await handleAccept(result.invite);
    }
  };

  const handleAccept = async (invite?: any) => {
    if (!identity) return;

    setAccepting(true);
    setStatus('Spracúvam pozvánku...');

    try {
      const inviteData = invite || validateInviteCode(inviteCode).invite;

      if (!inviteData) {
        throw new Error('Neplatný invite');
      }

      setStatus('Vytváram session...');

      const { decodeKey } = await import('./crypto/identity');
      // With NaCl, we don't need to pass identity and signed prekeys!
      // Just the invite data is enough
      const { acceptInvite } = await import('./messaging/messageHandler');
      const conversationId = await acceptInvite(inviteData);

      setStatus('Pozvánka akceptovaná! Presmerovávam...');

      await loadConversations();

      setTimeout(() => {
        setView(AppView.MESSAGE_VIEW, conversationId);
      }, 1000);
    } catch (error) {
      console.error('Failed to accept invite:', error);
      setStatus(`Chyba: ${error instanceof Error ? error.message : 'Neplatná pozvánka'}`);
      setAccepting(false);
    }
  };

  return (
    <div className="screen">
      <button onClick={() => setView(AppView.CONVERSATION_LIST)} className="back-button">
        ← Späť
      </button>

      <h1>Prijať pozvánku</h1>

      {/* Mode switcher */}
      <div className="mode-tabs">
        <button
          className={scanMode === 'camera' ? 'active' : ''}
          onClick={() => setScanMode('camera')}
        >
          📷 Skenovať QR
        </button>
        <button
          className={scanMode === 'manual' ? 'active' : ''}
          onClick={() => setScanMode('manual')}
        >
          ⌨️ Vložiť text
        </button>
      </div>

      {scanMode === 'camera' ? (
        <div className="camera-scanner">
          <p>Namierte kameru na QR kód:</p>
          <QrReader
            onResult={handleScan}
            constraints={{ facingMode: 'environment' }}
            containerStyle={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}
          />
          <p className="hint">QR kód sa automaticky naskenuje</p>
        </div>
      ) : (
        <div className="manual-input">
          <p>Vložte invite kód:</p>
          <textarea
            className={`invite-input ${
              validation?.valid ? 'valid' :
              validation?.valid === false ? 'invalid' : ''
            }`}
            value={inviteCode}
            onChange={handleManualInput}
            placeholder='{"relayUrl":"http://...","queueId":"...","keyBundle":{...}}'
            rows={10}
          />

          {validation?.valid && (
            <div className="validation-success">
              ✅ Platný invite kód
            </div>
          )}

          {validation?.error && (
            <div className="validation-error">
              ❌ {validation.error}
            </div>
          )}

          <div className="button-group">
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setInviteCode(text);
                  const result = validateInviteCode(text);
                  setValidation(result);
                } catch (e) {
                  alert('Nemôžem čítať zo schránky');
                }
              }}
              className="secondary-button"
            >
              📋 Vložiť zo schránky
            </button>

            <button
              onClick={() => handleAccept()}
              disabled={!validation?.valid || accepting}
              className="primary-button"
            >
              {accepting ? '⏳ Spracúvam...' : '✅ Akceptovať'}
            </button>
          </div>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}

export default App;
