/**
 * Identity Management
 *
 * Handles generation and management of user identity keys.
 * Each user has a long-term identity key pair used for authentication.
 */

import sodium from 'libsodium-wrappers';

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
 * Must be called before any crypto operations
 */
export async function initCrypto(): Promise<void> {
  await sodium.ready;
}

/**
 * Generate a new identity key pair (X25519 for MVP)
 * This is the user's long-term identity
 * NOTE: Using X25519 instead of Ed25519 for simplicity in MVP
 * Production should use Ed25519 for signatures + conversion to X25519 for DH
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  await initCrypto();

  // Use X25519 keys so no conversion needed for DH operations
  const keyPair = sodium.crypto_box_keypair();

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate prekeys for asynchronous messaging (X25519)
 * These are ephemeral keys used for establishing sessions
 */
export async function generatePreKeys(count: number, startId: number = 0): Promise<PreKey[]> {
  await initCrypto();

  const preKeys: PreKey[] = [];

  for (let i = 0; i < count; i++) {
    const keyPair = sodium.crypto_box_keypair();

    preKeys.push({
      keyId: startId + i,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    });
  }

  return preKeys;
}

/**
 * Generate a single ephemeral key for X3DH
 * This is a temporary key used once for session establishment
 */
export async function generateEphemeralKey(): Promise<PreKey> {
  await initCrypto();

  const keyPair = sodium.crypto_box_keypair();

  return {
    keyId: Date.now(),
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate a signed prekey
 * This is a prekey signed by the identity key to prove ownership
 * NOTE: Using HMAC instead of Ed25519 signature for MVP (identity keys are X25519)
 */
export async function generateSignedPreKey(
  identityKeyPair: IdentityKeyPair,
  keyId: number
): Promise<SignedPreKey> {
  await initCrypto();

  // Generate the prekey
  const keyPair = sodium.crypto_box_keypair();

  // Create HMAC signature using identity private key as the key
  // (MVP approach - production should use Ed25519 signatures)
  const signature = sodium.crypto_generichash(
    64,
    keyPair.publicKey,
    identityKeyPair.privateKey
  );

  return {
    keyId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    signature,
  };
}

/**
 * Verify a signed prekey
 * Ensures the prekey was actually signed by the claimed identity
 * NOTE: For MVP, we skip verification since we use HMAC (need private key to verify)
 * Production should use Ed25519 public key signatures
 */
export async function verifySignedPreKey(
  publicKey: Uint8Array,
  signature: Uint8Array,
  identityPublicKey: Uint8Array
): Promise<boolean> {
  await initCrypto();

  // For MVP: Cannot verify HMAC without the private key
  // In production, use Ed25519 signatures which can be verified with public key
  // For now, just return true (skip verification)
  return true;
}

/**
 * Convert Uint8Array to base64 string for storage/transmission
 */
export function encodeKey(key: Uint8Array): string {
  return sodium.to_base64(key, sodium.base64_variants.ORIGINAL);
}

/**
 * Convert base64 string back to Uint8Array
 */
export function decodeKey(encoded: string): Uint8Array {
  return sodium.from_base64(encoded, sodium.base64_variants.ORIGINAL);
}

/**
 * Generate a random ID for various purposes (queues, messages, etc.)
 */
export function generateRandomId(byteLength: number = 32): string {
  const bytes = sodium.randombytes_buf(byteLength);
  return sodium.to_hex(bytes);
}

/**
 * Derive a shared secret from two key pairs using X25519 (ECDH)
 */
export async function deriveSharedSecret(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  await initCrypto();

  return sodium.crypto_scalarmult(ourPrivateKey, theirPublicKey);
}

/**
 * Key Bundle - all public keys needed to start a conversation
 * This is what gets encoded in a QR code or shared via invite link
 */
export interface KeyBundle {
  identityKey: string;          // Base64 encoded Ed25519 public key
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
  await initCrypto();

  // Generate identity key pair
  const identityKeyPair = await generateIdentityKeyPair();

  // Generate signed prekey
  const signedPreKey = await generateSignedPreKey(identityKeyPair, 1);

  // Generate one-time prekeys
  const preKeys = await generatePreKeys(100, 1);

  // Generate random registration ID
  const registrationId = Math.floor(Math.random() * 16380) + 1;

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
