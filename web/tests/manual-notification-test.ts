import { test, chromium } from '@playwright/test';

test('Manual notification test', async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', (msg) => console.log(`[Console] ${msg.text()}`));

  console.log('\n📱 Opening application at https://localhost\n');
  await page.goto('https://localhost');

  console.log('\n✅ Application loaded');
  console.log('\n📝 Instructions:');
  console.log('   1. Create a new conversation');
  console.log('   2. Click on Settings (if available)');
  console.log('   3. Test notification permissions');
  console.log('   4. Check browser console for any errors');
  console.log('\n⏸️  Browser will stay open for manual testing...');
  console.log('   Press Ctrl+C in terminal to close\n');

  // Keep browser open
  await page.waitForTimeout(3600000); // 1 hour
});
