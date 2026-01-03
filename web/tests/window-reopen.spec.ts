/**
 * Window Close/Reopen Test
 * Simulates the bug: after closing and reopening first window,
 * Alice → Bob works but Bob → Alice fails
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'https://localhost:5173';

test.setTimeout(90000); // 90 second timeout for complex test

test('Window close and reopen messaging', async ({ browser }) => {
  console.log('\n🔄 Window Close/Reopen Test\n');

  // Alice's context (will be closed and reopened)
  let aliceContext = await browser.newContext({
    ignoreHTTPSErrors: true, // Ignore self-signed certificate errors
  });
  let alicePage = await aliceContext.newPage();

  // Log console messages from Alice
  alicePage.on('console', msg => {
    if (msg.text().includes('POLLING') || msg.text().includes('Polled') || msg.text().includes('📬')) {
      console.log(`[Alice Console] ${msg.text()}`);
    }
  });

  // Bob's context (private window - stays open)
  const bobContext = await browser.newContext({
    ignoreHTTPSErrors: true, // Ignore self-signed certificate errors
  });
  const bobPage = await bobContext.newPage();

  // Log console messages from Bob
  bobPage.on('console', msg => {
    if (msg.text().includes('📤') || msg.text().includes('Sent message to queue')) {
      console.log(`[Bob Console] ${msg.text()}`);
    }
  });

  // Step 1: Alice init and create conversation
  console.log('👩 Alice: Init and create conversation...');
  await alicePage.goto(BASE_URL);
  await alicePage.waitForLoadState('networkidle');
  await alicePage.locator('button:has-text("Začať")').click();
  await expect(alicePage.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 15000 });

  await alicePage.locator('button:has-text("Nová konverzácia")').click();
  await alicePage.locator('button:has-text("Zobraziť celý")').click();
  const inviteCode = await alicePage.locator('textarea.invite-code-full').inputValue();
  console.log('✅ Invite generated');

  // Step 2: Bob accepts in private window
  console.log('👨 Bob: Accept invite in private window...');
  await bobPage.goto(BASE_URL);
  await bobPage.waitForLoadState('networkidle');
  await bobPage.locator('button:has-text("Začať")').click();
  await expect(bobPage.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 15000 });

  await bobPage.locator('button:has-text("Skenovať QR")').click();
  await bobPage.locator('button:has-text("Vložiť text")').click();
  await bobPage.locator('textarea.invite-input').fill(inviteCode);
  await bobPage.locator('button:has-text("Akceptovať")').click();
  await expect(bobPage.locator('.message-header')).toBeVisible({ timeout: 10000 });
  console.log('✅ Bob: Conversation opened');

  // Step 3: Alice opens conversation
  await alicePage.locator('button:has-text("Späť")').click();
  await alicePage.locator('.conversation-item').first().click();
  await expect(alicePage.locator('.message-header')).toBeVisible({ timeout: 10000 });
  await alicePage.waitForTimeout(3000); // Wait for connection_accepted
  console.log('✅ Alice: Conversation opened');

  // Step 4: Test bidirectional messaging (should work)
  console.log('\n📨 Testing initial bidirectional messaging...');

  const aliceInput = alicePage.locator('textarea[placeholder*="Napíšte"]');
  await aliceInput.fill('Message 1 from Alice');
  await alicePage.locator('button[aria-label="Poslať"]').click();
  await expect(alicePage.locator('.message.sent:has-text("Message 1 from Alice")')).toBeVisible({ timeout: 5000 });
  await expect(bobPage.locator('.message.received:has-text("Message 1 from Alice")')).toBeVisible({ timeout: 15000 });
  console.log('✅ Alice → Bob: works');

  const bobInput = bobPage.locator('textarea[placeholder*="Napíšte"]');
  await bobInput.fill('Message 1 from Bob');
  await bobPage.locator('button[aria-label="Poslať"]').click();
  await expect(bobPage.locator('.message.sent:has-text("Message 1 from Bob")')).toBeVisible({ timeout: 5000 });
  await expect(alicePage.locator('.message.received:has-text("Message 1 from Bob")')).toBeVisible({ timeout: 15000 });
  console.log('✅ Bob → Alice: works');

  // Step 5: Simulate closing and reopening by navigating away and back
  console.log('\n🚪 Simulating window close (navigate to blank page)...');
  await alicePage.goto('about:blank');
  await alicePage.waitForTimeout(1000);
  console.log('✅ Navigated away');

  // Step 6: Reopen (navigate back to app - IndexedDB should persist in same context)
  console.log('\n🔓 Reopening Alice\'s window (navigate back)...');
  await alicePage.goto(BASE_URL);
  await alicePage.waitForLoadState('networkidle');

  // Should go directly to conversations (identity already exists in IndexedDB)
  await expect(alicePage.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 15000 });

  // Open the conversation
  await alicePage.locator('.conversation-item').first().click();
  await expect(alicePage.locator('.message-header')).toBeVisible({ timeout: 10000 });

  // Wait for polling to start
  await alicePage.waitForTimeout(3000);
  console.log('✅ Alice: Conversation reopened');

  // Step 7: Test Alice → Bob (should work according to user)
  console.log('\n📨 Testing Alice → Bob after reopen...');
  const aliceInput2 = alicePage.locator('textarea[placeholder*="Napíšte"]');
  await aliceInput2.fill('Message 2 from Alice (after reopen)');
  await alicePage.locator('button[aria-label="Poslať"]').click();
  await expect(alicePage.locator('.message.sent:has-text("Message 2 from Alice (after reopen)")')).toBeVisible({ timeout: 5000 });
  console.log('✅ Alice sees sent message');

  await expect(bobPage.locator('.message.received:has-text("Message 2 from Alice (after reopen)")')).toBeVisible({ timeout: 15000 });
  console.log('✅ Alice → Bob: works after reopen');

  // Step 8: Test Bob → Alice (THIS SHOULD FAIL according to user's bug report)
  console.log('\n📨 Testing Bob → Alice after reopen...');
  const bobInput2 = bobPage.locator('textarea[placeholder*="Napíšte"]');
  await bobInput2.fill('Message 2 from Bob (after reopen)');
  await bobPage.locator('button[aria-label="Poslať"]').click();
  await expect(bobPage.locator('.message.sent:has-text("Message 2 from Bob (after reopen)")')).toBeVisible({ timeout: 5000 });
  console.log('✅ Bob sees sent message');

  // This is where the bug should occur
  await expect(alicePage.locator('.message.received:has-text("Message 2 from Bob (after reopen)")')).toBeVisible({ timeout: 15000 });
  console.log('✅ Bob → Alice: works after reopen');

  console.log('\n🎉 Window Reopen Test PASSED!\n');
});
