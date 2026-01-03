/**
 * E2E Test: Ping-Pong Messaging Between Two Users
 *
 * This test simulates two users (Alice and Bob) exchanging messages
 * to verify the complete E2E encryption flow works correctly.
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const TIMEOUT = 30000;

test.describe('E2E Messaging Flow', () => {
  let alicePage: Page;
  let bobPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Create two browser contexts (like two different users)
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();

    alicePage = await aliceContext.newPage();
    bobPage = await bobContext.newPage();

    // Listen for console messages and errors
    alicePage.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        console.error(`👩 Alice CONSOLE ERROR: ${text}`);
      } else if (text.includes('connection_accepted') || text.includes('Session') || text.includes('📨') || text.includes('🔍') || text.includes('✅') || text.includes('❌') || text.includes('🔑')) {
        console.log(`👩 Alice LOG: ${text}`);
      }
    });

    bobPage.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        console.error(`👨 Bob CONSOLE ERROR: ${text}`);
      } else if (text.includes('connection_accepted') || text.includes('Session') || text.includes('📨') || text.includes('🔍') || text.includes('✅') || text.includes('❌') || text.includes('🔑')) {
        console.log(`👨 Bob LOG: ${text}`);
      }
    });

    // Listen for page errors
    alicePage.on('pageerror', error => {
      console.error(`👩 Alice PAGE ERROR: ${error.message}`);
    });

    bobPage.on('pageerror', error => {
      console.error(`👨 Bob PAGE ERROR: ${error.message}`);
    });
  });

  test('Full ping-pong messaging scenario', async () => {
    console.log('\n🧪 Starting E2E Messaging Test...\n');

    // ==========================================
    // Step 1: Alice - Initialize Identity
    // ==========================================
    console.log('👩 Alice: Initializing...');
    await alicePage.goto(BASE_URL);

    // Wait for first time setup screen
    await expect(alicePage.locator('h1')).toContainText('Privacy Messaging', { timeout: TIMEOUT });

    // Click "Začať" button to initialize identity
    const aliceStartButton = alicePage.locator('button:has-text("Začať")');
    await expect(aliceStartButton).toBeVisible({ timeout: TIMEOUT });
    await aliceStartButton.click();

    // Wait for initialization to complete and conversation list to appear
    await expect(alicePage.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Alice: Identity initialized');

    // ==========================================
    // Step 2: Alice - Generate Invite
    // ==========================================
    console.log('👩 Alice: Generating invite...');
    const aliceNewConversationButton = alicePage.locator('button:has-text("Nová konverzácia")');
    await aliceNewConversationButton.click();

    // Wait for invite to be generated
    await expect(alicePage.locator('h1:has-text("Pozvánka do konverzácie")')).toBeVisible({ timeout: TIMEOUT });

    // Click "Zobraziť celý" button to show full invite code
    const showFullButton = alicePage.locator('button:has-text("Zobraziť celý")');
    await expect(showFullButton).toBeVisible({ timeout: TIMEOUT });
    await showFullButton.click();

    // Wait for full invite code to appear
    const aliceInviteTextarea = alicePage.locator('textarea.invite-code-full');
    await expect(aliceInviteTextarea).toBeVisible({ timeout: TIMEOUT });

    // Get the invite code
    const inviteCode = await aliceInviteTextarea.inputValue();
    expect(inviteCode).toBeTruthy();
    expect(inviteCode.length).toBeGreaterThan(100); // Should be a JSON object

    console.log('✅ Alice: Invite generated');
    console.log(`📋 Invite length: ${inviteCode.length} characters`);

    // Verify invite structure
    const invite = JSON.parse(inviteCode);
    expect(invite).toHaveProperty('relayUrl');
    expect(invite).toHaveProperty('queueId');
    expect(invite).toHaveProperty('keyBundle');

    // ==========================================
    // Step 3: Bob - Initialize Identity
    // ==========================================
    console.log('\n👨 Bob: Initializing...');
    await bobPage.goto(BASE_URL);

    // Wait for first time setup screen
    await expect(bobPage.locator('h1')).toContainText('Privacy Messaging', { timeout: TIMEOUT });

    // Click "Začať" button to initialize identity
    const bobStartButton = bobPage.locator('button:has-text("Začať")');
    await expect(bobStartButton).toBeVisible({ timeout: TIMEOUT });
    await bobStartButton.click();

    // Wait for initialization to complete
    await expect(bobPage.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Bob: Identity initialized');

    // ==========================================
    // Step 4: Bob - Accept Invite
    // ==========================================
    console.log('👨 Bob: Accepting invite...');
    const bobScanQRButton = bobPage.locator('button:has-text("Skenovať QR")');
    await bobScanQRButton.click();

    // Wait for scanner screen
    await expect(bobPage.locator('h1:has-text("Prijať pozvánku")')).toBeVisible({ timeout: TIMEOUT });

    // Switch to manual input mode
    const manualInputButton = bobPage.locator('button:has-text("Vložiť text")');
    await expect(manualInputButton).toBeVisible({ timeout: TIMEOUT });
    await manualInputButton.click();

    // Paste the invite code
    const bobInviteTextarea = bobPage.locator('textarea.invite-input');
    await expect(bobInviteTextarea).toBeVisible({ timeout: TIMEOUT });
    await bobInviteTextarea.fill(inviteCode);

    // Wait for validation success
    await expect(bobPage.locator('.validation-success')).toBeVisible({ timeout: TIMEOUT });

    // Accept the invite
    const bobAcceptButton = bobPage.locator('button:has-text("Akceptovať")');
    await expect(bobAcceptButton).toBeEnabled({ timeout: TIMEOUT });
    await bobAcceptButton.click();

    // Wait for conversation to be created and navigated to message view
    try {
      await expect(bobPage.locator('h2:has-text("Konverzácia")')).toBeVisible({ timeout: TIMEOUT });
      console.log('✅ Bob: Invite accepted, conversation created');
    } catch (error) {
      // Check for error message
      const statusText = await bobPage.locator('p.status').textContent();
      console.error(`❌ Bob failed to accept invite. Status: ${statusText}`);
      throw error;
    }

    // ==========================================
    // Step 5: Alice - Navigate Back and Open Conversation
    // ==========================================
    console.log('\n👩 Alice: Navigating back to conversation list...');

    // Alice is still on invite generator screen, go back
    await alicePage.locator('button:has-text("Späť")').click();
    await expect(alicePage.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Alice: Back at conversation list');

    // Click on the pending conversation
    const aliceConversation = alicePage.locator('.conversation-item').first();
    await expect(aliceConversation).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Alice: Pending conversation visible');
    await aliceConversation.click();

    // Should navigate to message view
    await expect(alicePage.locator('h2:has-text("Konverzácia")')).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Alice: Connected to conversation');

    // ==========================================
    // Step 6: Alice → Bob - Send "Ahoj Bob!"
    // ==========================================
    console.log('\n👩 Alice: Sending message "Ahoj Bob!"...');

    const aliceMessageInput = alicePage.locator('input[type="text"][placeholder*="Napíšte správu"]');
    await aliceMessageInput.fill('Ahoj Bob!');

    const aliceSendButton = alicePage.locator('button:has-text("Poslať")');
    await aliceSendButton.click();

    // Wait for message to appear in Alice's view
    await expect(alicePage.locator('.message.sent:has-text("Ahoj Bob!")')).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Alice: Message sent and displayed');

    // ==========================================
    // Step 7: Bob - Receive "Ahoj Bob!"
    // ==========================================
    console.log('👨 Bob: Waiting to receive message...');

    // Wait for polling to fetch the message (max 10 seconds, polling is every 3s)
    await expect(bobPage.locator('.message.received:has-text("Ahoj Bob!")')).toBeVisible({ timeout: 15000 });
    console.log('✅ Bob: Message received and decrypted!');

    // ==========================================
    // Step 8: Bob → Alice - Send "Ahoj Alice!"
    // ==========================================
    console.log('\n👨 Bob: Sending reply "Ahoj Alice!"...');

    const bobMessageInput = bobPage.locator('input[type="text"][placeholder*="Napíšte správu"]');
    await bobMessageInput.fill('Ahoj Alice!');

    const bobSendButton = bobPage.locator('button:has-text("Poslať")');
    await bobSendButton.click();

    // Wait for message to appear in Bob's view
    await expect(bobPage.locator('.message.sent:has-text("Ahoj Alice!")')).toBeVisible({ timeout: TIMEOUT });
    console.log('✅ Bob: Reply sent and displayed');

    // ==========================================
    // Step 9: Alice - Receive "Ahoj Alice!"
    // ==========================================
    console.log('👩 Alice: Waiting to receive reply...');

    // Wait for polling to fetch the message
    await expect(alicePage.locator('.message.received:has-text("Ahoj Alice!")')).toBeVisible({ timeout: 15000 });
    console.log('✅ Alice: Reply received and decrypted!');

    // ==========================================
    // Step 10: Verify Message Count
    // ==========================================
    console.log('\n🔍 Verifying message counts...');

    // Alice should have 2 messages: 1 sent, 1 received
    const aliceMessages = await alicePage.locator('.message').count();
    expect(aliceMessages).toBe(2);
    console.log(`✅ Alice: ${aliceMessages} messages total`);

    // Bob should have 2 messages: 1 received, 1 sent
    const bobMessages = await bobPage.locator('.message').count();
    expect(bobMessages).toBe(2);
    console.log(`✅ Bob: ${bobMessages} messages total`);

    // ==========================================
    // Step 11: Ping-Pong Test - Multiple Messages
    // ==========================================
    console.log('\n🏓 Testing ping-pong with 3 more exchanges...');

    for (let i = 1; i <= 3; i++) {
      // Alice sends
      console.log(`\n  Round ${i}:`);
      console.log(`  👩 Alice: Sending "Ping ${i}"...`);
      await aliceMessageInput.fill(`Ping ${i}`);
      await aliceSendButton.click();
      await expect(alicePage.locator(`.message.sent:has-text("Ping ${i}")`)).toBeVisible({ timeout: TIMEOUT });

      // Bob receives
      console.log(`  👨 Bob: Receiving "Ping ${i}"...`);
      await expect(bobPage.locator(`.message.received:has-text("Ping ${i}")`)).toBeVisible({ timeout: 15000 });

      // Bob replies
      console.log(`  👨 Bob: Sending "Pong ${i}"...`);
      await bobMessageInput.fill(`Pong ${i}`);
      await bobSendButton.click();
      await expect(bobPage.locator(`.message.sent:has-text("Pong ${i}")`)).toBeVisible({ timeout: TIMEOUT });

      // Alice receives
      console.log(`  👩 Alice: Receiving "Pong ${i}"...`);
      await expect(alicePage.locator(`.message.received:has-text("Pong ${i}")`)).toBeVisible({ timeout: 15000 });
      console.log(`  ✅ Round ${i} complete`);
    }

    // ==========================================
    // Step 12: Final Verification
    // ==========================================
    console.log('\n✨ Final verification...');

    // Total messages: 2 (initial) + 6 (3 rounds of ping-pong) = 8
    const finalAliceCount = await alicePage.locator('.message').count();
    const finalBobCount = await bobPage.locator('.message').count();

    expect(finalAliceCount).toBe(8);
    expect(finalBobCount).toBe(8);

    console.log(`✅ Alice: ${finalAliceCount} total messages`);
    console.log(`✅ Bob: ${finalBobCount} total messages`);

    // ==========================================
    // Success!
    // ==========================================
    console.log('\n🎉 E2E Test PASSED!');
    console.log('✅ Identity generation works');
    console.log('✅ Invite generation/acceptance works');
    console.log('✅ E2E encryption/decryption works');
    console.log('✅ Message delivery works (both directions)');
    console.log('✅ Polling mechanism works');
    console.log('✅ Multiple message exchanges work\n');
  });
});
