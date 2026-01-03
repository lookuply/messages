import { test, expect } from '@playwright/test';

const BASE_URL = 'https://localhost';

test('Real message notification test', async ({ browser }) => {
  console.log('\n🔔 Real Message Notification Test\n');

  // Create two browser contexts
  const aliceContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ['notifications'],
  });
  const bobContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ['notifications'],
  });

  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  let aliceReceivedNotification = false;

  // Monitor Alice's page for notification
  alicePage.on('console', (msg) => {
    const text = msg.text();
    console.log(`[Alice] ${text}`);
  });

  bobPage.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('🌐 API:') || text.includes('Message')) {
      console.log(`[Bob] ${text}`);
    }
  });

  // Grant notification permission explicitly
  await aliceContext.grantPermissions(['notifications']);

  // Intercept notification creation on Alice's page
  await alicePage.exposeFunction('notificationCreated', (title: string, body: string) => {
    console.log(`\n🔔 NOTIFICATION RECEIVED!`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    aliceReceivedNotification = true;
  });

  await alicePage.addInitScript(() => {
    // Override Notification constructor to track when notifications are created
    const OriginalNotification = window.Notification;
    (window as any).Notification = function(title: string, options?: NotificationOptions) {
      (window as any).notificationCreated(title, options?.body || '');
      return new OriginalNotification(title, options);
    };
    Object.setPrototypeOf((window as any).Notification, OriginalNotification);
    // Force permission to be "granted"
    Object.defineProperty((window as any).Notification, 'permission', {
      get: () => 'granted' as NotificationPermission,
      configurable: true
    });
    (window as any).Notification.requestPermission = async () => 'granted' as NotificationPermission;
  });

  try {
    // === STEP 1: Alice creates conversation ===
    console.log('👩 Alice: Creating conversation...');
    await alicePage.goto(BASE_URL);
    await alicePage.waitForLoadState('networkidle');

    // Skip welcome
    const aliceWelcome = alicePage.locator('button:has-text("Začať")');
    if (await aliceWelcome.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aliceWelcome.click();
      await alicePage.waitForTimeout(1000);
    }

    // Create conversation
    await alicePage.waitForSelector('button:has-text("Nová konverzácia")', { timeout: 10000 });
    await alicePage.click('button:has-text("Nová konverzácia")');
    await alicePage.waitForTimeout(2000);

    // Get invite link
    await alicePage.waitForSelector('text=Pozvánka do konverzácie', { timeout: 10000 });
    await alicePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await alicePage.waitForTimeout(1000);

    let inviteLink = await alicePage.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const match = html.match(/https:\/\/localhost\/#invite=[^"<>\s]+/);
      return match ? match[0] : '';
    });

    if (inviteLink.includes('%')) {
      inviteLink = decodeURIComponent(inviteLink);
    }

    expect(inviteLink).toContain('#invite=');
    console.log(`✅ Alice: Invite created (${inviteLink.length} chars)`);

    // === STEP 2: Bob accepts invite ===
    console.log('\n👨 Bob: Accepting invite...');

    const inviteHash = inviteLink.split('#')[1];
    await bobPage.goto(BASE_URL);
    await bobPage.waitForLoadState('networkidle');

    await bobPage.evaluate((hash) => {
      window.location.hash = hash;
    }, inviteHash);
    await bobPage.waitForTimeout(2000);

    // Skip welcome if needed
    const bobWelcome = bobPage.locator('button:has-text("Začať")');
    if (await bobWelcome.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bobWelcome.click();
      await bobPage.waitForTimeout(500);
    }

    // Invite is auto-accepted when loaded from URL hash
    // Wait directly for conversation to open
    console.log('⏳ Waiting for invite to be auto-accepted...');
    await bobPage.waitForSelector('textarea[placeholder*="Napíšte"]', { timeout: 15000 });
    console.log('✅ Bob: Conversation opened (invite auto-accepted)');

    // === STEP 3: Alice navigates to conversation ===
    console.log('\n👩 Alice: Opening conversation...');
    await alicePage.click('button:has-text("Späť")');
    await alicePage.waitForTimeout(1000);

    const conversations = await alicePage.locator('.conversation-item').count();
    if (conversations > 0) {
      await alicePage.locator('.conversation-item').first().click();
      await alicePage.waitForSelector('textarea[placeholder*="Napíšte"]', { timeout: 10000 });
      console.log('✅ Alice: Conversation opened');
    }

    // === STEP 4: Minimize Alice's window (simulate background) ===
    console.log('\n🔽 Simulating Alice\'s tab going to background...');

    // Blur Alice's page to simulate it being in background
    await alicePage.evaluate(() => {
      // Set properties FIRST, then dispatch events
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden' as VisibilityState
      });
      // Override hasFocus to return false
      document.hasFocus = () => false;

      // Now dispatch events
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    console.log('✅ Alice\'s tab is now "hidden"');

    // === STEP 5: Bob sends a message ===
    console.log('\n👨 Bob: Sending message...');

    const bobInput = bobPage.locator('textarea[placeholder*="Napíšte"]');
    await bobInput.fill('Hello Alice! This should trigger a notification! 🔔');
    await bobPage.click('button[aria-label="Poslať"]');

    // Wait for message to be sent and for Alice to potentially poll for it
    await bobPage.waitForTimeout(2000);

    console.log('✅ Bob: Message sent');

    // === STEP 6: Wait for Alice to receive notification ===
    console.log('\n⏳ Waiting for Alice to receive notification...\n');

    // Trigger Alice polling immediately
    await alicePage.evaluate(() => {
      // Force an immediate poll
      (window as any).triggerPoll?.();
    });

    // Wait up to 40 seconds for notification
    for (let i = 0; i < 40; i++) {
      if (aliceReceivedNotification) {
        break;
      }
      await alicePage.waitForTimeout(1000);

      // Show progress
      if (i % 5 === 0 && i > 0) {
        console.log(`   Still waiting... (${i}s)`);
      }
    }

    // Verify notification was received
    expect(aliceReceivedNotification).toBeTruthy();

    console.log('\n🎉 SUCCESS! Notification test passed!\n');
    console.log('Summary:');
    console.log('  ✅ Alice created conversation');
    console.log('  ✅ Bob accepted invite');
    console.log('  ✅ Bob sent message');
    console.log('  ✅ Alice received notification (tab in background)');
    console.log('  ✅ Real-time notification system working!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);

    // Take screenshots for debugging
    await alicePage.screenshot({ path: 'test-results/alice-notification-error.png' });
    await bobPage.screenshot({ path: 'test-results/bob-notification-error.png' });

    throw error;
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
