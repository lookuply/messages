/**
 * Ping-Pong Test for NaCl Encryption
 *
 * This test simulates message exchange between two devices (Alice and Bob)
 * to verify that the NaCl encryption implementation works correctly.
 */

import nacl from 'tweetnacl';

// Helper functions to convert between string and Uint8Array
function encodeUTF8(str) {
  return new TextEncoder().encode(str);
}

function decodeUTF8(arr) {
  return new TextDecoder().decode(arr);
}

console.log('🚀 Starting NaCl Ping-Pong Test...\n');

// Step 1: Generate key pairs for Alice and Bob
console.log('📝 Step 1: Generating key pairs...');
const aliceKeyPair = nacl.box.keyPair();
const bobKeyPair = nacl.box.keyPair();

console.log('✅ Alice public key:', Buffer.from(aliceKeyPair.publicKey).toString('hex').substring(0, 16) + '...');
console.log('✅ Bob public key:', Buffer.from(bobKeyPair.publicKey).toString('hex').substring(0, 16) + '...\n');

// Step 2: Alice sends "ping" to Bob
console.log('📝 Step 2: Alice sends "ping" to Bob...');
const pingMessage = 'ping';
const pingNonce = nacl.randomBytes(24);
const pingEncrypted = nacl.box(
  encodeUTF8(pingMessage),
  pingNonce,
  bobKeyPair.publicKey,    // Recipient's public key
  aliceKeyPair.secretKey   // Sender's private key
);

console.log('✅ Encrypted ping:', Buffer.from(pingEncrypted).toString('hex').substring(0, 32) + '...');

// Step 3: Bob receives and decrypts "ping"
console.log('\n📝 Step 3: Bob decrypts message from Alice...');
const pingDecrypted = nacl.box.open(
  pingEncrypted,
  pingNonce,
  aliceKeyPair.publicKey,  // Sender's public key
  bobKeyPair.secretKey     // Recipient's private key
);

if (!pingDecrypted) {
  console.error('❌ Bob failed to decrypt ping!');
  process.exit(1);
}

const pingPlaintext = decodeUTF8(pingDecrypted);
console.log('✅ Bob received:', pingPlaintext);

if (pingPlaintext !== 'ping') {
  console.error('❌ Message mismatch! Expected "ping", got:', pingPlaintext);
  process.exit(1);
}

// Step 4: Bob sends "pong" to Alice
console.log('\n📝 Step 4: Bob sends "pong" to Alice...');
const pongMessage = 'pong';
const pongNonce = nacl.randomBytes(24);
const pongEncrypted = nacl.box(
  encodeUTF8(pongMessage),
  pongNonce,
  aliceKeyPair.publicKey,  // Recipient's public key
  bobKeyPair.secretKey     // Sender's private key
);

console.log('✅ Encrypted pong:', Buffer.from(pongEncrypted).toString('hex').substring(0, 32) + '...');

// Step 5: Alice receives and decrypts "pong"
console.log('\n📝 Step 5: Alice decrypts message from Bob...');
const pongDecrypted = nacl.box.open(
  pongEncrypted,
  pongNonce,
  bobKeyPair.publicKey,    // Sender's public key
  aliceKeyPair.secretKey   // Recipient's private key
);

if (!pongDecrypted) {
  console.error('❌ Alice failed to decrypt pong!');
  process.exit(1);
}

const pongPlaintext = decodeUTF8(pongDecrypted);
console.log('✅ Alice received:', pongPlaintext);

if (pongPlaintext !== 'pong') {
  console.error('❌ Message mismatch! Expected "pong", got:', pongPlaintext);
  process.exit(1);
}

// Test out-of-order delivery
console.log('\n📝 Step 6: Testing out-of-order delivery...');
const msg1 = 'First message';
const msg2 = 'Second message';
const msg3 = 'Third message';

const nonce1 = nacl.randomBytes(24);
const nonce2 = nacl.randomBytes(24);
const nonce3 = nacl.randomBytes(24);

const enc1 = nacl.box(encodeUTF8(msg1), nonce1, bobKeyPair.publicKey, aliceKeyPair.secretKey);
const enc2 = nacl.box(encodeUTF8(msg2), nonce2, bobKeyPair.publicKey, aliceKeyPair.secretKey);
const enc3 = nacl.box(encodeUTF8(msg3), nonce3, bobKeyPair.publicKey, aliceKeyPair.secretKey);

// Deliver out of order: 3, 1, 2
console.log('📬 Delivering messages out of order: 3, 1, 2');

const dec3 = decodeUTF8(nacl.box.open(enc3, nonce3, aliceKeyPair.publicKey, bobKeyPair.secretKey));
const dec1 = decodeUTF8(nacl.box.open(enc1, nonce1, aliceKeyPair.publicKey, bobKeyPair.secretKey));
const dec2 = decodeUTF8(nacl.box.open(enc2, nonce2, aliceKeyPair.publicKey, bobKeyPair.secretKey));

console.log('✅ Received in order: 3, 1, 2');
console.log('   Message 3:', dec3);
console.log('   Message 1:', dec1);
console.log('   Message 2:', dec2);

if (dec1 !== msg1 || dec2 !== msg2 || dec3 !== msg3) {
  console.error('❌ Out-of-order delivery test failed!');
  process.exit(1);
}

console.log('\n🎉 All tests passed!');
console.log('✅ NaCl encryption is working correctly');
console.log('✅ Messages can be delivered out of order');
console.log('✅ Each message is independent\n');
