import { test, expect } from '@playwright/test';

test.describe('Navigation & App Shell', () => {
  test('app renders with title and nav bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Musafir').first()).toBeVisible();
    await expect(page.locator('text=Flight').first()).toBeVisible();
    await expect(page.locator('text=Qasr').first()).toBeVisible();
  });

  test('Flight tab is active by default', async ({ page }) => {
    await page.goto('/');
    // Flight tab should show In-Flight Prayer Planner heading
    await expect(page.locator('text=In-Flight Prayer Planner')).toBeVisible();
    // Qasr tab content should not be visible
    await expect(page.locator('text=Qasr Status Checker')).not.toBeVisible();
  });

  test('clicking Qasr tab switches to Qasr view', async ({ page }) => {
    await page.goto('/');
    // Click the Qasr button in the nav bar (first visible one)
    await page.locator('button:has-text("Qasr")').first().click();
    await expect(page.locator('text=Qasr Status Checker')).toBeVisible();
    // Flight content should no longer be visible
    await expect(page.locator('text=In-Flight Prayer Planner')).not.toBeVisible();
  });

  test('CrescentMoon logo renders', async ({ page }) => {
    await page.goto('/');
    const svg = page.locator('nav svg, .glass-nav svg').first();
    await expect(svg).toBeVisible();
  });

  test('footer attribution text is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=OpenStreetMap')).toBeVisible();
    await expect(page.locator('text=Ayatollah Syed Ali al-Sistani')).toBeVisible();
  });

  test('tabs are accessible by keyboard', async ({ page }) => {
    await page.goto('/');
    // Tab through to the Qasr button and press Enter
    const qasrButton = page.locator('button:has-text("Qasr")').first();
    await qasrButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Qasr Status Checker')).toBeVisible();
  });
});