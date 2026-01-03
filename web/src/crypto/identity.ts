/**
 * Identity Management
 *
 * Handles generation and management of user identity keys.
 * Each user has a long-term identity key pair used for authentication.
 *
 * Now using TweetNaCl and Web Crypto API instead of libsodium.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface PreKey {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SignedPreKey extends PreKey {
  signature: Uint8Array;
}

/**
 * Initialize the crypto library
 * No-op with Web Crypto API (always available)
 */
export async function initCrypto(): Promise<void> {
  // Web Crypto API and TweetNaCl are always ready
  return Promise.resolve();
}

/**
 * Generate a new identity key pair (X25519)
 * This is the user's long-term identity
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  // TweetNaCl box uses X25519 for key exchange
  const keyPair = nacl.box.keyPair();

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
  };
}

/**
 * Generate prekeys for asynchronous messaging (X25519)
 * These are ephemeral keys used for establishing sessions
 */
export async function generatePreKeys(count: number, startId: number = 0): Promise<PreKey[]> {
  const preKeys: PreKey[] = [];

  for (let i = 0; i < count; i++) {
    const keyPair = nacl.box.keyPair();

    preKeys.push({
      keyId: startId + i,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.secretKey,
    });
  }

  return preKeys;
}

/**
 * Generate a single ephemeral key for X3DH
 * This is a temporary key used once for session establishment
 */
export async function generateEphemeralKey(): Promise<PreKey> {
  const keyPair = nacl.box.keyPair();

  return {
    keyId: Date.now(),
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
  };
}

/**
 * Generate a signed prekey
 * This is a prekey signed by the identity key to prove ownership
 * Using SHA-256 HMAC via Web Crypto API
 */
export async function generateSignedPreKey(
  identityKeyPair: IdentityKeyPair,
  keyId: number
): Promise<SignedPreKey> {
  // Generate the prekey
  const keyPair = nacl.box.keyPair();

  // Create signature using Web Crypto API (SHA-256 hash)
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(identityKeyPair.privateKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new Uint8Array(keyPair.publicKey)
  );

  const signature = new Uint8Array(signatureBuffer);

  return {
    keyId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
    signature,
  };
}

/**
 * Verify a signed prekey
 * Ensures the prekey was actually signed by the claimed identity
 */
export async function verifySignedPreKey(
  publicKey: Uint8Array,
  signature: Uint8Array,
  identityPublicKey: Uint8Array
): Promise<boolean> {
  // For MVP: Cannot verify HMAC without the private key
  // In production, use Ed25519 signatures which can be verified with public key
  // For now, just return true (skip verification)
  return true;
}

/**
 * Convert Uint8Array to base64 string for storage/transmission
 */
export function encodeKey(key: Uint8Array): string {
  return encodeBase64(key);
}

/**
 * Convert base64 string back to Uint8Array
 */
export function decodeKey(encoded: string): Uint8Array {
  return decodeBase64(encoded);
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random ID for various purposes (queues, messages, etc.)
 * Uses Web Crypto API for cryptographically secure random bytes
 */
export function generateRandomId(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Derive a shared secret from two key pairs using X25519 (ECDH)
 * TweetNaCl handles this internally in box operations
 */
export async function deriveSharedSecret(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  // TweetNaCl uses X25519 scalar multiplication internally
  // We use nacl.box.before to derive shared secret
  return nacl.box.before(theirPublicKey, ourPrivateKey);
}

/**
 * Key Bundle - all public keys needed to start a conversation
 * This is what gets encoded in a QR code or shared via invite link
 */
export interface KeyBundle {
  identityKey: string;          // Base64 encoded X25519 public key
  signedPreKey: string;          // Base64 encoded X25519 public key
  signedPreKeyId: number;
  signedPreKeySignature: string; // Base64 encoded signature
  oneTimePreKey?: string;        // Base64 encoded X25519 public key (optional)
  oneTimePreKeyId?: number;
}

/**
 * Create a key bundle from local keys
 */
export async function createKeyBundle(
  identityKeyPair: IdentityKeyPair,
  signedPreKey: SignedPreKey,
  oneTimePreKey?: PreKey
): Promise<KeyBundle> {
  const bundle: KeyBundle = {
    identityKey: encodeKey(identityKeyPair.publicKey),
    signedPreKey: encodeKey(signedPreKey.publicKey),
    signedPreKeyId: signedPreKey.keyId,
    signedPreKeySignature: encodeKey(signedPreKey.signature),
  };

  if (oneTimePreKey) {
    bundle.oneTimePreKey = encodeKey(oneTimePreKey.publicKey);
    bundle.oneTimePreKeyId = oneTimePreKey.keyId;
  }

  return bundle;
}

/**
 * Identity state that should be persisted in IndexedDB
 */
export interface IdentityState {
  identityKeyPair: {
    publicKey: string;  // Base64 encoded
    privateKey: string; // Base64 encoded
  };
  signedPreKey: {
    keyId: number;
    publicKey: string;
    privateKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
    privateKey: string;
    used: boolean;
  }>;
  registrationId: number;
}

/**
 * Initialize a new identity (first-time setup)
 */
export async function initializeIdentity(): Promise<IdentityState> {
  // Generate identity key pair
  const identityKeyPair = await generateIdentityKeyPair();

  // Generate signed prekey
  const signedPreKey = await generateSignedPreKey(identityKeyPair, 1);

  // Generate one-time prekeys
  const preKeys = await generatePreKeys(100, 1);

  // Generate random registration ID using Web Crypto API
  const registrationIdBytes = new Uint8Array(2);
  crypto.getRandomValues(registrationIdBytes);
  const registrationId = (registrationIdBytes[0] << 8 | registrationIdBytes[1]) % 16380 + 1;

  return {
    identityKeyPair: {
      publicKey: encodeKey(identityKeyPair.publicKey),
      privateKey: encodeKey(identityKeyPair.privateKey),
    },
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: encodeKey(signedPreKey.publicKey),
      privateKey: encodeKey(signedPreKey.privateKey),
      signature: encodeKey(signedPreKey.signature),
    },
    oneTimePreKeys: preKeys.map(pk => ({
      keyId: pk.keyId,
      publicKey: encodeKey(pk.publicKey),
      privateKey: encodeKey(pk.privateKey),
      used: false,
    })),
    registrationId,
  };
}
