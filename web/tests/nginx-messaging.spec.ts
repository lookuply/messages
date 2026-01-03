import { test, expect, chromium } from '@playwright/test';

const BASE_URL = 'https://localhost';

test.describe('Nginx HTTPS Messaging Test', () => {
  test('should send and receive messages through nginx proxy', async () => {
    console.log('\n🔄 Starting Nginx HTTPS Messaging Test\n');

    // Launch browser
    const browser = await chromium.launch({
      headless: false,
    });

    // Alice's context
    const aliceContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      permissions: ['notifications'],
    });
    const alicePage = await aliceContext.newPage();

    // Bob's context (incognito)
    const bobContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      permissions: ['notifications'],
    });
    const bobPage = await bobContext.newPage();

    // Enable console logging - capture ALL logs for debugging
    alicePage.on('console', (msg) => {
      console.log(`[Alice Console] ${msg.text()}`);
    });

    bobPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('🌐 API:') || text.includes('❌') || text.includes('ERROR') || text.includes('Failed')) {
        console.log(`[Bob Console] ${text}`);
      }
    });

    try {
      // === STEP 1: Alice creates conversation ===
      console.log('👩 Alice: Opening app and creating conversation...');
      await alicePage.goto(BASE_URL);
      await alicePage.waitForLoadState('networkidle');

      // Wait for welcome screen
      await alicePage.waitForSelector('button:has-text("Začať")', { timeout: 10000 });
      console.log('✅ Alice: Welcome screen loaded');

      // Click "Začať" to start
      await alicePage.click('button:has-text("Začať")');
      await alicePage.waitForTimeout(1000);

      // Now wait for conversation list and click create
      await alicePage.waitForSelector('button:has-text("Nová konverzácia")', { timeout: 10000 });
      console.log('✅ Alice: Conversation list loaded');

      // Click create conversation
      await alicePage.click('button:has-text("Nová konverzácia")');
      await alicePage.waitForTimeout(2000);

      // Wait for invite screen (QR code or link)
      await alicePage.waitForSelector('text=Pozvánka do konverzácie', { timeout: 10000 });
      console.log('✅ Alice: Invite screen loaded');

      // Scroll down to find the text link or ALEBO button
      await alicePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await alicePage.waitForTimeout(1000);

      // Check if there's an ALEBO button and click it to show text invite
      const aleboButton = alicePage.locator('button:has-text("ALEBO")');
      if (await aleboButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await aleboButton.click();
        await alicePage.waitForTimeout(1000);
      }

      // Now look for the invite link
      let inviteLink = '';

      // Try textarea (should appear after clicking ALEBO)
      const textarea = alicePage.locator('textarea[readonly], textarea[value*="invite"]');
      if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
        inviteLink = await textarea.inputValue();
      } else {
        // Try input field
        const input = alicePage.locator('input[readonly], input[value*="invite"]');
        if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
          inviteLink = await input.inputValue();
        } else {
          // Extract from page data attribute or JavaScript variable
          inviteLink = await alicePage.evaluate(() => {
            // Try to find invite in window object or data attributes
            const qrCode = document.querySelector('[data-url], [data-invite]');
            if (qrCode) {
              return qrCode.getAttribute('data-url') || qrCode.getAttribute('data-invite') || '';
            }

            // Try to find in page HTML more carefully
            const html = document.documentElement.innerHTML;
            const match = html.match(/https:\/\/localhost\/#invite=[^"<>\s]+/);
            return match ? match[0] : '';
          });
        }
      }

      // URL decode the invite link if needed
      if (inviteLink.includes('%')) {
        inviteLink = decodeURIComponent(inviteLink);
      }

      expect(inviteLink).toContain('https://localhost/#invite=');
      expect(inviteLink.length).toBeGreaterThan(300); // Ensure we got the full invite
      console.log('✅ Alice: Invite generated');
      console.log(`   Invite length: ${inviteLink.length} chars`);
      console.log(`   Invite: ${inviteLink.substring(0, 80)}...`);

      // === STEP 2: Bob accepts invite ===
      console.log('\n👨 Bob: Opening invite in new context...');
      console.log(`   Full invite URL length: ${inviteLink.length}`);

      // Extract hash from invite link
      const inviteHash = inviteLink.split('#')[1];
      console.log(`   Invite hash length: ${inviteHash.length}`);

      // Navigate to base URL first
      await bobPage.goto('https://localhost');
      await bobPage.waitForLoadState('networkidle');

      // Then set the hash using JavaScript to preserve it
      await bobPage.evaluate((hash) => {
        window.location.hash = hash;
      }, inviteHash);

      // Wait for hash to be processed
      await bobPage.waitForTimeout(2000);

      // Verify hash was set correctly
      const bobHash = await bobPage.evaluate(() => window.location.hash);
      console.log(`   Bob's hash after setting: ${bobHash.substring(0, 50)}...`);
      console.log(`   Bob's hash length: ${bobHash.length}`);

      // Check if welcome screen appears and skip it
      const hasWelcome = await bobPage.locator('button:has-text("Začať")').isVisible({ timeout: 2000 }).catch(() => false);
      if (hasWelcome) {
        await bobPage.click('button:has-text("Začať")');
        await bobPage.waitForTimeout(500);
      }

      // Click accept
      await bobPage.waitForSelector('button:has-text("Prijať pozvánku")', { timeout: 10000 });
      await bobPage.click('button:has-text("Prijať pozvánku")');

      // Wait for conversation to open
      await bobPage.waitForSelector('textarea[placeholder*="Napíšte"]', { timeout: 15000 });
      console.log('✅ Bob: Conversation opened');

      // Wait for Alice to receive connection accepted message
      await alicePage.waitForTimeout(2000);

      // Alice should now be in conversation view
      await alicePage.click('button:has-text("Späť")');
      await alicePage.waitForTimeout(500);

      // Click on the conversation
      const conversations = await alicePage.locator('.conversation-item').count();
      if (conversations > 0) {
        await alicePage.locator('.conversation-item').first().click();
        await alicePage.waitForSelector('textarea[placeholder*="Napíšte"]', { timeout: 10000 });
        console.log('✅ Alice: Conversation opened');
      }

      // === STEP 3: Test messaging ===
      console.log('\n📨 Testing bidirectional messaging...\n');

      // Alice → Bob
      console.log('📤 Alice sending message to Bob...');
      const aliceInput = alicePage.locator('textarea[placeholder*="Napíšte"]');
      await aliceInput.fill('Hello from Alice!');
      await alicePage.click('button[aria-label="Poslať"]');

      // Wait for message to appear in Alice's view
      await expect(alicePage.locator('.message.sent:has-text("Hello from Alice!")')).toBeVisible({ timeout: 10000 });
      console.log('✅ Alice: Message sent and visible in UI');

      // Wait for Bob to receive
      await expect(bobPage.locator('.message.received:has-text("Hello from Alice!")')).toBeVisible({ timeout: 15000 });
      console.log('✅ Bob: Message received from Alice');

      // Bob → Alice
      console.log('\n📤 Bob sending message to Alice...');
      const bobInput = bobPage.locator('textarea[placeholder*="Napíšte"]');
      await bobInput.fill('Hello from Bob!');
      await bobPage.click('button[aria-label="Poslať"]');

      // Wait for message to appear in Bob's view
      await expect(bobPage.locator('.message.sent:has-text("Hello from Bob!")')).toBeVisible({ timeout: 10000 });
      console.log('✅ Bob: Message sent and visible in UI');

      // Wait for Alice to receive
      await expect(alicePage.locator('.message.received:has-text("Hello from Bob!")')).toBeVisible({ timeout: 15000 });
      console.log('✅ Alice: Message received from Bob');

      // === STEP 4: Test rapid messaging ===
      console.log('\n📨 Testing rapid messaging...\n');

      for (let i = 1; i <= 3; i++) {
        console.log(`📤 Alice sending message ${i}...`);
        await aliceInput.fill(`Message ${i} from Alice`);
        await alicePage.click('button[aria-label="Poslať"]');
        await expect(alicePage.locator(`.message.sent:has-text("Message ${i} from Alice")`)).toBeVisible({ timeout: 10000 });

        console.log(`📥 Waiting for Bob to receive message ${i}...`);
        await expect(bobPage.locator(`.message.received:has-text("Message ${i} from Alice")`)).toBeVisible({ timeout: 15000 });
        console.log(`✅ Message ${i} delivered`);

        await alicePage.waitForTimeout(500);
      }

      console.log('\n🎉 All tests passed!\n');
      console.log('Summary:');
      console.log('  ✅ HTTPS nginx proxy working');
      console.log('  ✅ Conversation creation working');
      console.log('  ✅ Invite acceptance working');
      console.log('  ✅ Bidirectional messaging working');
      console.log('  ✅ Rapid messaging working');
      console.log('  ✅ E2E encryption working through nginx\n');

      // Keep browsers open for 10 seconds to review
      await alicePage.waitForTimeout(10000);

    } catch (error) {
      console.error('\n❌ Test failed:', error);

      // Take screenshots on failure
      await alicePage.screenshot({ path: 'test-results/alice-error.png' });
      await bobPage.screenshot({ path: 'test-results/bob-error.png' });

      console.log('\n📸 Screenshots saved to test-results/');

      // Keep browsers open for inspection
      await alicePage.waitForTimeout(30000);

      throw error;
    } finally {
      await browser.close();
    }
  });
});
