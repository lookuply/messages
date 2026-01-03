/**
 * Settings View
 *
 * Configure notification preferences and PWA settings
 */

import { useEffect, useState } from 'react';
import { AppView, useAppStore } from '../stores/appStore';
import {
  requestNotificationPermission,
  checkNotificationPermission,
  getNotificationSettings,
  saveNotificationSettings,
  showTestNotification,
  type NotificationSettings,
} from '../utils/notificationManager';
import { isServiceWorkerActive } from '../utils/serviceWorker';

export function SettingsView() {
  const { setView } = useAppStore();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const currentSettings = await getNotificationSettings();
      const permission = await checkNotificationPermission();

      setSettings(currentSettings);
      setPermissionState(permission);

      // Check if PWA is installed
      const isInstalled = isServiceWorkerActive() ||
        window.matchMedia('(display-mode: standalone)').matches;
      setIsPWAInstalled(isInstalled);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleNotifications(enabled: boolean) {
    if (!settings) return;

    try {
      const updatedSettings = { ...settings, enabled };
      await saveNotificationSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    }
  }

  async function handleTogglePreview(showPreview: boolean) {
    if (!settings) return;

    try {
      const updatedSettings = { ...settings, showPreview };
      await saveNotificationSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    }
  }

  async function handleRequestPermission() {
    try {
      setError(null);
      const permission = await requestNotificationPermission();
      setPermissionState(permission);

      if (permission === 'granted') {
        // Enable notifications automatically
        if (settings) {
          const updatedSettings = { ...settings, enabled: true };
          await saveNotificationSettings(updatedSettings);
          setSettings(updatedSettings);
        }
      } else if (permission === 'denied') {
        setError('Notifikácie boli zamietnuté. Prosím povoľte ich v nastaveniach prehliadača.');
      }
    } catch (err) {
      console.error('Failed to request permission:', err);
      setError('Nepodarilo sa získať povolenie na notifikácie');
    }
  }

  async function handleTestNotification() {
    try {
      setError(null);
      await showTestNotification();
    } catch (err) {
      console.error('Failed to show test notification:', err);
      setError(err instanceof Error ? err.message : 'Nepodarilo sa zobraziť notifikáciu');
    }
  }

  if (loading) {
    return (
      <div className="settings-view">
        <div className="settings-loading">Načítavam nastavenia...</div>
      </div>
    );
  }

  const notificationsSupported = 'Notification' in window;

  return (
    <div className="settings-view">
      <header className="settings-header">
        <button
          onClick={() => setView(AppView.CONVERSATION_LIST)}
          className="back-button"
          aria-label="Späť"
        >
          ← Späť
        </button>
        <h1>Nastavenia</h1>
      </header>

      {error && (
        <div className="settings-error">
          ⚠️ {error}
        </div>
      )}

      <div className="settings-content">
        {/* Notifications Section */}
        <section className="settings-section">
          <h2>Notifikácie</h2>

          {!notificationsSupported ? (
            <div className="settings-warning">
              Notifikácie nie sú podporované v tomto prehliadači.
            </div>
          ) : (
            <>
              {/* Enable/Disable Toggle */}
              <div className="settings-item">
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.enabled ?? false}
                    onChange={(e) => handleToggleNotifications(e.target.checked)}
                    disabled={permissionState !== 'granted'}
                  />
                  <span className="toggle-label">Povoliť notifikácie</span>
                </label>
                {permissionState !== 'granted' && (
                  <p className="settings-help">
                    Najprv musíte povoliť notifikácie v prehliadači
                  </p>
                )}
              </div>

              {/* Permission Status */}
              <div className="settings-item">
                <div className="settings-status">
                  <strong>Stav povolenia:</strong>{' '}
                  {permissionState === 'granted' && <span className="status-granted">✅ Povolené</span>}
                  {permissionState === 'denied' && <span className="status-denied">❌ Zamietnuté</span>}
                  {permissionState === 'default' && <span className="status-default">⏸️ Nepýtané</span>}
                </div>
              </div>

              {/* Request Permission Button */}
              {permissionState !== 'granted' && (
                <div className="settings-item">
                  <button
                    onClick={handleRequestPermission}
                    className="button-primary"
                  >
                    Požiadať o povolenie
                  </button>
                  {permissionState === 'denied' && (
                    <p className="settings-help">
                      Notifikácie boli zamietnuté. Prosím povoľte ich v nastaveniach prehliadača:
                      <br />
                      Nastavenia → Súkromie a zabezpečenie → Notifikácie
                    </p>
                  )}
                </div>
              )}

              {/* Show Preview Toggle */}
              {permissionState === 'granted' && (
                <div className="settings-item">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings?.showPreview ?? true}
                      onChange={(e) => handleTogglePreview(e.target.checked)}
                    />
                    <span className="toggle-label">Ukázať náhľad správy</span>
                  </label>
                  <p className="settings-help">
                    {settings?.showPreview
                      ? 'Notifikácie budú obsahovať obsah správy'
                      : 'Notifikácie budú zobrazovať len "Nová správa"'}
                  </p>
                </div>
              )}

              {/* Test Notification */}
              {permissionState === 'granted' && (
                <div className="settings-item">
                  <button
                    onClick={handleTestNotification}
                    className="button-secondary"
                  >
                    Testovacia notifikácia
                  </button>
                  <p className="settings-help">
                    Zatvorte túto kartu a kliknite na tlačidlo pre otestovanie notifikácie
                  </p>
                </div>
              )}

              {/* Notification Info */}
              <div className="settings-info">
                ℹ️ Notifikácie sa zobrazia len keď je táto karta v pozadí alebo neaktívna.
                To zabezpečuje súkromie a predchádza duplicitným notifikáciám.
              </div>
            </>
          )}
        </section>

        {/* PWA Section */}
        <section className="settings-section">
          <h2>Progressive Web App (PWA)</h2>

          <div className="settings-item">
            <div className="settings-status">
              <strong>Stav:</strong>{' '}
              {isPWAInstalled
                ? <span className="status-granted">✅ Nainštalované</span>
                : <span className="status-default">⏸️ Nenainštalované</span>}
            </div>
          </div>

          {!isPWAInstalled && (
            <div className="settings-info">
              💡 Na inštaláciu aplikácie použite tlačidlo "Inštalovať" v menu prehliadača
              alebo na iOS pridajte stránku na domovskú obrazovku.
            </div>
          )}

          {isPWAInstalled && (
            <div className="settings-info">
              ✅ Aplikácia je nainštalovaná a funguje offline.
            </div>
          )}
        </section>

        {/* Privacy Section */}
        <section className="settings-section">
          <h2>Súkromie</h2>

          <div className="settings-info">
            🔒 <strong>Všetky dáta sú uložené lokálne</strong>
            <br />
            Vaše konverzácie, správy a kľúče sa nikdy neposielajú na server.
            Všetko je šifrované end-to-end a uložené len vo vašom zariadení.
          </div>

          <div className="settings-info">
            📬 <strong>Notifikácie sú generované lokálne</strong>
            <br />
            Notifikácie sa vytvárajú priamo vo vašom prehliadači po dešifrovaní správy.
            Server nikdy nevidí obsah vašich správ ani notifikácií.
          </div>
        </section>
      </div>

      <style>{`
        .settings-view {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg-primary, #1a1a1a);
          color: var(--text-primary, #ffffff);
        }

        .settings-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color, #333);
          background: var(--bg-secondary, #252525);
        }

        .settings-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .back-button {
          background: transparent;
          border: none;
          color: var(--text-secondary, #aaa);
          font-size: 1rem;
          cursor: pointer;
          padding: 0.5rem;
        }

        .back-button:hover {
          color: var(--text-primary, #ffffff);
        }

        .settings-loading {
          padding: 2rem;
          text-align: center;
          color: var(--text-secondary, #aaa);
        }

        .settings-error {
          padding: 1rem;
          margin: 1rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #ef4444;
        }

        .settings-content {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .settings-section {
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: var(--bg-secondary, #252525);
          border-radius: 12px;
        }

        .settings-section h2 {
          margin: 0 0 1.5rem 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
        }

        .settings-item {
          margin-bottom: 1.5rem;
        }

        .settings-item:last-child {
          margin-bottom: 0;
        }

        .settings-toggle {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          user-select: none;
        }

        .settings-toggle input[type="checkbox"] {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }

        .settings-toggle input[type="checkbox"]:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toggle-label {
          font-size: 1rem;
          font-weight: 500;
        }

        .settings-help {
          margin: 0.5rem 0 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #aaa);
          line-height: 1.5;
        }

        .settings-status {
          font-size: 1rem;
        }

        .status-granted {
          color: #10b981;
        }

        .status-denied {
          color: #ef4444;
        }

        .status-default {
          color: #f59e0b;
        }

        .button-primary,
        .button-secondary {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .button-primary {
          background: #2563eb;
          color: white;
        }

        .button-primary:hover {
          background: #1d4ed8;
        }

        .button-secondary {
          background: var(--bg-tertiary, #333);
          color: var(--text-primary, #ffffff);
        }

        .button-secondary:hover {
          background: var(--bg-quaternary, #444);
        }

        .settings-info {
          padding: 1rem;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 8px;
          font-size: 0.875rem;
          line-height: 1.6;
          color: var(--text-secondary, #aaa);
        }

        .settings-warning {
          padding: 1rem;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          color: #f59e0b;
        }
      `}</style>
    </div>
  );
}
