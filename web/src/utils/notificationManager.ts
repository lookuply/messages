/**
 * Notification Manager
 *
 * Handles browser desktop notifications and PWA notifications
 * Privacy-first: all notifications are client-side only
 */

import {
  getNotificationSettings as dbGetNotificationSettings,
  saveNotificationSettings as dbSaveNotificationSettings,
  type NotificationSettings as DBNotificationSettings,
} from '../storage/db';

/**
 * Notification Settings (runtime version with permission)
 */
export interface NotificationSettings extends DBNotificationSettings {
  permission: NotificationPermission;  // 'default' | 'granted' | 'denied' (not stored, always fresh)
}

/**
 * Default notification settings
 */
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  permission: 'default',
  showPreview: true,
  sound: false,
};

/**
 * Request notification permission from the browser
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();

    // Update settings with new permission
    const settings = await getNotificationSettings();
    settings.permission = permission;
    await saveNotificationSettings(settings);

    return permission;
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return 'denied';
  }
}

/**
 * Check current notification permission status
 */
export async function checkNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  return Notification.permission;
}

/**
 * Check if notifications can be shown
 * Verifies: browser support, permission granted, settings enabled, tab visibility
 */
export function canShowNotifications(): boolean {
  // Check browser support
  if (!('Notification' in window)) {
    return false;
  }

  // Check permission
  if (Notification.permission !== 'granted') {
    return false;
  }

  // Check tab visibility - ONLY show when tab is hidden/inactive
  if (document.visibilityState === 'visible' || document.hasFocus()) {
    return false;
  }

  return true;
}

/**
 * Show a message notification
 */
export async function showMessageNotification(params: {
  conversationId: string;
  senderName: string;
  messagePreview: string;
  icon?: string;
}): Promise<void> {
  const { conversationId, senderName, messagePreview, icon } = params;

  // Check if we can show notifications
  if (!canShowNotifications()) {
    console.log('Notifications cannot be shown (permission/visibility)');
    return;
  }

  // Get settings
  const settings = await getNotificationSettings();
  if (!settings.enabled) {
    console.log('Notifications disabled in settings');
    return;
  }

  try {
    // Determine notification body based on preview setting
    const body = settings.showPreview ? messagePreview : 'New message';

    // Create notification
    const notification = new Notification(senderName, {
      body,
      icon: icon || '/vite.svg',
      tag: conversationId, // Group notifications by conversation
      requireInteraction: false,
      silent: !settings.sound,
      data: {
        conversationId,
        timestamp: new Date().toISOString(),
      },
    });

    // Handle notification click
    notification.onclick = (event) => {
      event.preventDefault();

      // Focus the window
      window.focus();

      // Navigate to conversation (handled by hash routing)
      window.location.hash = `#conversation=${conversationId}`;

      // Close the notification
      notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);

    console.log(`📬 Notification shown: ${senderName}`);
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

/**
 * Get notification settings from IndexedDB
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    // Try to get settings from IndexedDB
    const stored = await dbGetNotificationSettings();

    if (stored) {
      return {
        enabled: stored.enabled,
        permission: await checkNotificationPermission(), // Always get fresh permission
        showPreview: stored.showPreview,
        sound: stored.sound,
      };
    }

    // No settings stored - return defaults with current permission
    const permission = await checkNotificationPermission();
    return {
      ...DEFAULT_SETTINGS,
      permission,
    };
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    const permission = await checkNotificationPermission();
    return {
      ...DEFAULT_SETTINGS,
      permission,
    };
  }
}

/**
 * Save notification settings to IndexedDB
 */
export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  try {
    await dbSaveNotificationSettings({
      enabled: settings.enabled,
      showPreview: settings.showPreview,
      sound: settings.sound,
      // Don't store permission - always check fresh
    });

    console.log('Notification settings saved:', settings);
  } catch (error) {
    console.error('Failed to save notification settings:', error);
    throw error;
  }
}

/**
 * Show a test notification (for settings screen)
 */
export async function showTestNotification(): Promise<void> {
  if (!canShowNotifications()) {
    throw new Error('Notifications not available - check permission and tab visibility');
  }

  const notification = new Notification('Test Notification', {
    body: 'This is a test notification from Privacy Messaging',
    icon: '/vite.svg',
    tag: 'test',
    requireInteraction: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  setTimeout(() => {
    notification.close();
  }, 5000);
}
