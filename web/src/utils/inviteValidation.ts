/**
 * Invite Code Validation
 *
 * Validuje štruktúru a formát invite kódov
 */

export const INVITE_VALIDATION = {
  MIN_INVITE_LENGTH: 200, // Realistic invite is ~284 chars
  MAX_INVITE_LENGTH: 2000,
  QUEUE_ID_LENGTH: 64,
  MIN_KEY_LENGTH: 44, // Base64 encoded 32 bytes
} as const;

export interface InviteData {
  relayUrl: string;
  queueId: string;
  queueUrl: string;
  keyBundle: {
    publicKey: string;  // Simple NaCl - just the public key!
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  invite?: InviteData;
}

/**
 * Validuje invite kód
 */
export function validateInviteCode(code: string): ValidationResult {
  // Základné kontroly
  if (!code.trim()) {
    return { valid: false, error: 'Prázdny kód' };
  }

  if (code.length < INVITE_VALIDATION.MIN_INVITE_LENGTH) {
    return {
      valid: false,
      error: `Príliš krátky (${code.length} znakov, minimum ${INVITE_VALIDATION.MIN_INVITE_LENGTH})`,
    };
  }

  if (code.length > INVITE_VALIDATION.MAX_INVITE_LENGTH) {
    return {
      valid: false,
      error: `Príliš dlhý (${code.length} znakov, maximum ${INVITE_VALIDATION.MAX_INVITE_LENGTH})`
    };
  }

  // JSON parsing
  let invite: any;
  try {
    invite = JSON.parse(code);
  } catch (e) {
    return { valid: false, error: 'Neplatný JSON formát' };
  }

  // Kontrola relayUrl
  if (!invite.relayUrl || typeof invite.relayUrl !== 'string') {
    return { valid: false, error: 'Chybá relayUrl' };
  }

  try {
    new URL(invite.relayUrl);
  } catch (e) {
    return { valid: false, error: 'Neplatná relayUrl' };
  }

  // Kontrola queueId
  if (!invite.queueId || typeof invite.queueId !== 'string') {
    return { valid: false, error: 'Chybá queueId' };
  }

  if (invite.queueId.length !== INVITE_VALIDATION.QUEUE_ID_LENGTH) {
    return {
      valid: false,
      error: `queueId musí mať ${INVITE_VALIDATION.QUEUE_ID_LENGTH} znakov`
    };
  }

  if (!/^[a-f0-9]{64}$/i.test(invite.queueId)) {
    return { valid: false, error: 'queueId nie je platný hex string' };
  }

  // Kontrola queueUrl
  if (!invite.queueUrl || typeof invite.queueUrl !== 'string') {
    return { valid: false, error: 'Chybá queueUrl' };
  }

  // Kontrola keyBundle
  if (!invite.keyBundle || typeof invite.keyBundle !== 'object') {
    return { valid: false, error: 'Chybá keyBundle' };
  }

  const { keyBundle } = invite;

  // Simple NaCl - just check publicKey
  if (!keyBundle.publicKey || typeof keyBundle.publicKey !== 'string') {
    return { valid: false, error: 'Chybá publicKey' };
  }

  if (keyBundle.publicKey.length < INVITE_VALIDATION.MIN_KEY_LENGTH) {
    return { valid: false, error: 'publicKey je príliš krátky' };
  }

  if (!/^[A-Za-z0-9+/]+=*$/.test(keyBundle.publicKey)) {
    return { valid: false, error: 'publicKey nie je platný base64' };
  }

  return { valid: true, invite };
}

/**
 * Sanitize input - odstráni extra whitespace
 */
export function sanitizeInviteCode(text: string): string {
  return text.trim();
}
