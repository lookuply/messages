/**
 * Simple NaCl-based End-to-End Encryption
 *
 * This is a simpler alternative to Signal Protocol that doesn't require
 * messages to be received in order. Each message is encrypted independently.
 *
 * Benefits:
 * - Messages can be received out of order
 * - No session state to manage
 * - No ratcheting complexity
 * - Still provides strong E2E encryption
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Key pair for encryption/decryption
 */
export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Encrypted message format
 */
export interface EncryptedMessage {
  nonce: Uint8Array;      // Random nonce (24 bytes)
  ciphertext: Uint8Array; // Encrypted message
}

/**
 * Generate a new key pair for encryption
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
  };
}

/**
 * Encrypt a message using NaCl box (public key encryption)
 *
 * @param plaintext - Message to encrypt
 * @param recipientPublicKey - Recipient's public key
 * @param senderPrivateKey - Our private key
 * @returns Encrypted message with nonce
 */
export function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array
): EncryptedMessage {
  // Convert plaintext to bytes
  const messageBytes = new TextEncoder().encode(plaintext);

  // Generate random nonce (24 bytes for NaCl)
  const nonce = nacl.randomBytes(24);

  // Encrypt using NaCl box
  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKey,
    senderPrivateKey
  );

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    nonce,
    ciphertext,
  };
}

/**
 * Decrypt a message using NaCl box
 *
 * @param encryptedMessage - Encrypted message with nonce
 * @param senderPublicKey - Sender's public key
 * @param recipientPrivateKey - Our private key
 * @returns Decrypted plaintext
 */
export function decryptMessage(
  encryptedMessage: EncryptedMessage,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): string {
  // Decrypt using NaCl box
  const decrypted = nacl.box.open(
    encryptedMessage.ciphertext,
    encryptedMessage.nonce,
    senderPublicKey,
    recipientPrivateKey
  );

  if (!decrypted) {
    throw new Error('Decryption failed - invalid keys or corrupted data');
  }

  // Convert bytes back to string
  return new TextDecoder().decode(decrypted);
}

/**
 * Serialize encrypted message for transmission (base64 encoding)
 */
export function serializeEncryptedMessage(msg: EncryptedMessage): Uint8Array {
  // Format: [nonce_length (1 byte)][nonce][ciphertext]
  const nonceLength = msg.nonce.length;
  const result = new Uint8Array(1 + nonceLength + msg.ciphertext.length);

  result[0] = nonceLength;
  result.set(msg.nonce, 1);
  result.set(msg.ciphertext, 1 + nonceLength);

  return result;
}

/**
 * Deserialize encrypted message from transmission format
 */
export function deserializeEncryptedMessage(data: Uint8Array): EncryptedMessage {
  const nonceLength = data[0];

  if (data.length < 1 + nonceLength) {
    throw new Error('Invalid encrypted message format');
  }

  const nonce = data.slice(1, 1 + nonceLength);
  const ciphertext = data.slice(1 + nonceLength);

  return {
    nonce,
    ciphertext,
  };
}

/**
 * Encode key to base64 for storage
 */
export function encodeKey(key: Uint8Array): string {
  return encodeBase64(key);
}

/**
 * Decode key from base64
 */
export function decodeKey(encoded: string): Uint8Array {
  return decodeBase64(encoded);
}

/**
 * Create a key bundle for sharing with peer
 * Contains just the public key (no signed prekeys, no one-time prekeys)
 */
export interface KeyBundle {
  publicKey: string; // Base64 encoded public key
}

/**
 * Create key bundle from key pair
 */
export function createKeyBundle(keyPair: KeyPair): KeyBundle {
  return {
    publicKey: encodeKey(keyPair.publicKey),
  };
}
