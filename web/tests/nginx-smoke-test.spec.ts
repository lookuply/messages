import { test, expect } from '@playwright/test';

const BASE_URL = 'https://localhost';

test.describe('Nginx HTTPS Smoke Test', () => {
  test('should load app over HTTPS and connect WebSocket', async ({ browser }) => {
    console.log('\n🔄 Nginx HTTPS Smoke Test\n');

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      permissions: ['notifications'],
    });
    const page = await context.newPage();

    let wsConnected = false;

    // Capture console logs
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('WebSocket connected')) {
        wsConnected = true;
        console.log('✅ WebSocket connected via WSS');
      }
      if (text.includes('DEFAULT_RELAY_URL determined')) {
        console.log(`✅ ${text}`);
      }
    });

    // Load the app
    console.log('📱 Loading app via HTTPS nginx...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Verify page loaded
    const title = await page.title();
    expect(title).toBe('Privacy Messaging');
    console.log('✅ Page loaded successfully');

    // Click through welcome screen
    const welcomeButton = page.locator('button:has-text("Začať")');
    if (await welcomeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await welcomeButton.click();
      console.log('✅ Welcome screen passed');
    }

    // Wait for conversation list
    await page.waitForSelector('button:has-text("Nová konverzácia")', { timeout: 10000 });
    console.log('✅ Conversation list loaded');

    // Wait a bit for WebSocket connection
    await page.waitForTimeout(3000);

    // Verify WebSocket connected
    expect(wsConnected).toBeTruthy();

    // Test API endpoint through nginx
    const response = await page.evaluate(async () => {
      const res = await fetch('/health');
      return {
        ok: res.ok,
        status: res.status,
        body: await res.json()
      };
    });

    expect(response.ok).toBeTruthy();
    expect(response.body.status).toBe('healthy');
    console.log('✅ API proxy working (health check passed)');

    console.log('\n🎉 All smoke tests passed!');
    console.log('\nSummary:');
    console.log('  ✅ HTTPS nginx serving app');
    console.log('  ✅ Static files loaded');
    console.log('  ✅ WebSocket (WSS) connected');
    console.log('  ✅ API proxy working');
    console.log('  ✅ Application functional\n');

    await context.close();
  });
});
