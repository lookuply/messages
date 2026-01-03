/**
 * Notifications Test
 * Tests browser notification functionality
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.setTimeout(60000); // 60 second timeout

test('Notification system functionality', async ({ browser, context: _ }) => {
  console.log('\n🔔 Notification Test\n');

  // Create context with notification permissions granted
  const context = await browser.newContext({
    permissions: ['notifications'],
  });

  const page = await context.newPage();

  // Log console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('notification') ||
        text.includes('Notification') ||
        text.includes('Service Worker') ||
        text.includes('[SW]')) {
      console.log(`[Browser Console] ${text}`);
    }
  });

  // Step 1: Initialize app
  console.log('📱 Opening app...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Wait for initialization
  const hasSetup = await page.locator('button:has-text("Začať")').count();
  if (hasSetup > 0) {
    console.log('👤 First time setup detected - initializing identity...');
    await page.locator('button:has-text("Začať")').click();
    await expect(page.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 15000 });
  }
  console.log('✅ App initialized');

  // Step 2: Navigate to Settings
  console.log('\n⚙️ Navigating to Settings...');
  const settingsButton = page.locator('button[aria-label="Nastavenia"]');
  await expect(settingsButton).toBeVisible({ timeout: 5000 });
  await settingsButton.click();

  // Wait for settings view
  await expect(page.locator('h1:has-text("Nastavenia")')).toBeVisible({ timeout: 5000 });
  console.log('✅ Settings page opened');

  // Step 3: Check notification support
  console.log('\n🔍 Checking notification support...');

  const notSupported = await page.locator('.settings-warning:has-text("nie sú podporované")').count();
  if (notSupported > 0) {
    console.log('⚠️ Notifications not supported in this browser context');
    console.log('ℹ️ This is expected in headless mode - notifications require user interaction');
    return;
  }

  // Step 4: Check permission status
  console.log('\n🔐 Checking permission status...');
  const permissionStatus = await page.evaluate(() => {
    return 'Notification' in window ? Notification.permission : 'denied';
  });
  console.log(`📋 Permission status: ${permissionStatus}`);

  // Step 5: Verify settings UI elements
  console.log('\n🎨 Verifying Settings UI...');

  // Check for notification toggle
  const notificationToggle = page.locator('input[type="checkbox"]').first();
  await expect(notificationToggle).toBeVisible();
  console.log('✅ Notification toggle found');

  // Check for preview toggle
  const previewToggle = page.locator('input[type="checkbox"]').nth(1);
  if (await previewToggle.count() > 0) {
    console.log('✅ Preview toggle found');
  }

  // Check for PWA section
  await expect(page.locator('h2:has-text("Progressive Web App")')).toBeVisible();
  console.log('✅ PWA section found');

  // Check for Privacy section
  await expect(page.locator('h2:has-text("Súkromie")')).toBeVisible();
  console.log('✅ Privacy section found');

  // Step 6: Test notification settings persistence
  console.log('\n💾 Testing settings persistence...');

  // Get current toggle state
  const initialState = await notificationToggle.isChecked();
  console.log(`Initial notification state: ${initialState}`);

  // Toggle it
  await notificationToggle.click();
  await page.waitForTimeout(500); // Wait for save

  const newState = await notificationToggle.isChecked();
  console.log(`New notification state: ${newState}`);
  expect(newState).toBe(!initialState);
  console.log('✅ Settings toggle works');

  // Step 7: Check Service Worker registration
  console.log('\n🔧 Checking Service Worker...');
  const swRegistered = await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      return !!registration;
    }
    return false;
  });

  if (swRegistered) {
    console.log('✅ Service Worker registered');
  } else {
    console.log('⚠️ Service Worker not registered (may take a moment)');
  }

  // Step 8: Verify notification permission status display
  console.log('\n📊 Verifying permission status display...');
  const statusElement = await page.locator('.settings-status').first();
  await expect(statusElement).toBeVisible();
  const statusText = await statusElement.textContent();
  console.log(`Status display: ${statusText}`);

  if (permissionStatus === 'granted') {
    expect(statusText).toContain('Povolené');
    console.log('✅ Permission status correctly shows "Granted"');

    // Check for test notification button
    const testButton = page.locator('button:has-text("Testovacia notifikácia")');
    if (await testButton.count() > 0) {
      console.log('✅ Test notification button available');
    }
  } else if (permissionStatus === 'denied') {
    expect(statusText).toContain('Zamietnuté');
    console.log('✅ Permission status correctly shows "Denied"');
  } else {
    expect(statusText).toContain('Nepýtané');
    console.log('✅ Permission status correctly shows "Default"');

    // Check for request permission button
    const requestButton = page.locator('button:has-text("Požiadať o povolenie")');
    await expect(requestButton).toBeVisible();
    console.log('✅ Request permission button available');
  }

  // Step 9: Verify manifest.json is accessible
  console.log('\n📄 Checking PWA manifest...');
  const manifestResponse = await page.request.get(`${BASE_URL}/manifest.json`);
  expect(manifestResponse.ok()).toBeTruthy();

  const manifestData = await manifestResponse.json();
  expect(manifestData.name).toBe('Privacy Messaging');
  expect(manifestData.short_name).toBe('Privacy Msg');
  console.log('✅ PWA manifest.json is valid');

  // Step 10: Verify icons exist
  console.log('\n🎨 Checking PWA icons...');
  const iconSizes = ['192x192', '512x512'];
  for (const size of iconSizes) {
    const iconResponse = await page.request.get(`${BASE_URL}/icons/icon-${size}.png`);
    if (iconResponse.ok()) {
      console.log(`✅ Icon ${size} exists`);
    } else {
      console.log(`⚠️ Icon ${size} not found (status: ${iconResponse.status()})`);
    }
  }

  // Step 11: Navigate back to conversation list
  console.log('\n🔙 Testing navigation back...');
  const backButton = page.locator('button:has-text("Späť")');
  await backButton.click();
  await expect(page.locator('h1:has-text("Konverzácie")')).toBeVisible({ timeout: 5000 });
  console.log('✅ Navigation back works');

  console.log('\n🎉 Notification Test PASSED!\n');

  await context.close();
});

test('Notification manager API', async ({ page }) => {
  console.log('\n🧪 Testing Notification Manager API\n');

  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Test the notification manager functions in browser context
  const apiTest = await page.evaluate(async () => {
    const results: any = {
      notificationSupported: false,
      permissionCheckWorks: false,
      settingsLoadable: false,
    };

    try {
      // Check if Notification API is available
      results.notificationSupported = 'Notification' in window;

      // Dynamic import of notification manager
      const {
        checkNotificationPermission,
        getNotificationSettings,
        canShowNotifications
      } = await import('./src/utils/notificationManager');

      // Test permission check
      const permission = await checkNotificationPermission();
      results.permission = permission;
      results.permissionCheckWorks = typeof permission === 'string';

      // Test settings loading
      const settings = await getNotificationSettings();
      results.settings = settings;
      results.settingsLoadable = !!settings;

      // Test canShowNotifications function
      results.canShow = canShowNotifications();

      return results;
    } catch (error: any) {
      results.error = error.message;
      return results;
    }
  });

  console.log('API Test Results:', JSON.stringify(apiTest, null, 2));

  expect(apiTest.notificationSupported).toBe(true);
  expect(apiTest.permissionCheckWorks).toBe(true);
  expect(apiTest.settingsLoadable).toBe(true);

  console.log('✅ Notification Manager API works correctly\n');
});
