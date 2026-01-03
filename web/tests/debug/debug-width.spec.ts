/**
 * Debug Test: Check Message View Width
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://192.168.1.101:5173';

test('Debug message view width', async ({ page }) => {
  console.log('\n🔍 Starting width debug test...\n');

  // Navigate to app
  await page.goto(BASE_URL);

  // Initialize identity
  await page.locator('button:has-text("Začať")').click();
  await expect(page.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 10000 });

  // Generate invite to create a conversation
  await page.locator('button:has-text("Nová konverzácia")').click();
  await expect(page.locator('h1:has-text("Pozvánka do konverzácie")')).toBeVisible({ timeout: 10000 });

  // Go back and open the conversation
  await page.locator('button:has-text("Späť")').click();
  await page.locator('.conversation-item').first().click();

  // Wait for message view
  await expect(page.locator('.screen.message-view')).toBeVisible({ timeout: 10000 });

  // Get computed widths
  const rootWidth = await page.locator('#root').evaluate(el => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      maxWidth: computed.maxWidth,
      offsetWidth: (el as HTMLElement).offsetWidth,
    };
  });

  const screenWidth = await page.locator('.screen.message-view').evaluate(el => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      maxWidth: computed.maxWidth,
      offsetWidth: (el as HTMLElement).offsetWidth,
      clientWidth: (el as HTMLElement).clientWidth,
    };
  });

  const messagesContainerWidth = await page.locator('.messages-container').evaluate(el => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      maxWidth: computed.maxWidth,
      offsetWidth: (el as HTMLElement).offsetWidth,
      clientWidth: (el as HTMLElement).clientWidth,
    };
  });

  const headerWidth = await page.locator('.message-header').evaluate(el => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      maxWidth: computed.maxWidth,
      offsetWidth: (el as HTMLElement).offsetWidth,
    };
  });

  const inputWidth = await page.locator('.message-input').evaluate(el => {
    const computed = window.getComputedStyle(el);
    return {
      width: computed.width,
      maxWidth: computed.maxWidth,
      offsetWidth: (el as HTMLElement).offsetWidth,
    };
  });

  console.log('\n📊 Width Analysis:');
  console.log('\n#root:');
  console.log(`  width: ${rootWidth.width}`);
  console.log(`  max-width: ${rootWidth.maxWidth}`);
  console.log(`  offsetWidth: ${rootWidth.offsetWidth}px`);

  console.log('\n.screen.message-view:');
  console.log(`  width: ${screenWidth.width}`);
  console.log(`  max-width: ${screenWidth.maxWidth}`);
  console.log(`  offsetWidth: ${screenWidth.offsetWidth}px`);
  console.log(`  clientWidth: ${screenWidth.clientWidth}px`);

  console.log('\n.messages-container:');
  console.log(`  width: ${messagesContainerWidth.width}`);
  console.log(`  max-width: ${messagesContainerWidth.maxWidth}`);
  console.log(`  offsetWidth: ${messagesContainerWidth.offsetWidth}px`);
  console.log(`  clientWidth: ${messagesContainerWidth.clientWidth}px`);

  console.log('\n.message-header:');
  console.log(`  width: ${headerWidth.width}`);
  console.log(`  max-width: ${headerWidth.maxWidth}`);
  console.log(`  offsetWidth: ${headerWidth.offsetWidth}px`);

  console.log('\n.message-input:');
  console.log(`  width: ${inputWidth.width}`);
  console.log(`  max-width: ${inputWidth.maxWidth}`);
  console.log(`  offsetWidth: ${inputWidth.offsetWidth}px\n`);

  // Take screenshot
  await page.screenshot({ path: 'debug-width.png', fullPage: true });
  console.log('📸 Screenshot saved to debug-width.png\n');
});
