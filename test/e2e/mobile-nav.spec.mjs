import { test, expect } from '@playwright/test';

test.describe('Mobile Navigation (Bottom Tab Bar)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('top nav with Flight/Qasr tabs is visible on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Flight').first()).toBeVisible();
    await expect(page.locator('text=Qasr').first()).toBeVisible();
  });

  test('mobile top nav Flight shows Flight content', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("Flight")').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=In-Flight Prayer Planner')).toBeVisible();
  });

  test('mobile top nav Qasr shows Qasr content', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("Qasr")').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Qasr Status Checker')).toBeVisible();
  });

  test('tapping Flight then Qasr switches content', async ({ page }) => {
    await page.goto('/');

    // Start on Qasr
    await page.locator('button:has-text("Qasr")').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Qasr Status Checker')).toBeVisible();

    // Switch to Flight
    await page.locator('button:has-text("Flight")').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=In-Flight Prayer Planner')).toBeVisible();
    await expect(page.locator('text=Qasr Status Checker')).not.toBeVisible();
  });

  test('CrescentMoon logo and Musafir title render on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Musafir').first()).toBeVisible();
    // Check an SVG exists for the logo
    const svgCount = await page.locator('svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(1);
  });

  test('footer attribution is visible on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=OpenStreetMap')).toBeVisible();
  });
});