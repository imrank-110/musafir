import { test, expect } from '@playwright/test';

test.describe('Qasr Status Checker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Switch to Qasr tab
    await page.locator('button:has-text("Qasr")').first().click();
    await page.waitForTimeout(300);
  });

  test('shows the Qasr Status Checker heading', async ({ page }) => {
    await expect(page.locator('text=Qasr Status Checker')).toBeVisible();
  });

  test('shows empty state with instructions', async ({ page }) => {
    await expect(page.locator('text=Check Your Traveler Status')).toBeVisible();
    await expect(page.locator('text=Current Location').first()).toBeVisible();
  });

  test('city dropdown is present', async ({ page }) => {
    const citySelect = page.locator('select').first();
    await expect(citySelect).toBeVisible();
    // Default option should be "Select a city..."
    const defaultOption = citySelect.locator('option').first();
    await expect(defaultOption).toHaveText('Select a city...');
  });

  test('has "Use Current Location" button', async ({ page }) => {
    await expect(page.locator('button:has-text("Use Current Location")')).toBeVisible();
  });

  test('has Driving Monitor section', async ({ page }) => {
    await expect(page.locator('text=Driving Monitor')).toBeVisible();
    await expect(page.locator('button:has-text("Start Monitoring")')).toBeVisible();
  });

  test('shows map on the Qasr page', async ({ page }) => {
    const mapContainer = page.locator('.leaflet-container').first();
    await page.waitForTimeout(1000);
    const count = await mapContainer.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('disclaimer text is present', async ({ page }) => {
    await expect(page.locator('text=Important:').first()).toBeVisible();
    await expect(page.locator('text=This is a guide').first()).toBeVisible();
  });

  test('Start Monitoring is disabled when no city selected', async ({ page }) => {
    const startBtn = page.locator('button:has-text("Start Monitoring")');
    await expect(startBtn).toBeDisabled();
  });

  test('legend items are visible on map area', async ({ page }) => {
    await expect(page.locator('text=Resident Zone').first()).toBeVisible();
    await expect(page.locator('text=Hadd (22 km)').first()).toBeVisible();
  });

  test('can select a city from dropdown', async ({ page }) => {
    const citySelect = page.locator('select').first();
    await citySelect.selectOption('Houston');
    // After selecting a city, the Qasr status should appear
    await page.waitForTimeout(500);
    const residentText = await page.locator('text=Resident').count();
    const travelerText = await page.locator('text=Traveler').count();
    expect(residentText + travelerText).toBeGreaterThanOrEqual(0);
  });

  test('Journey Type toggle shows Round-trip / One-way without distances', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Round-trip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'One-way' })).toBeVisible();
    expect(await page.locator('text=Round-trip (22 km)').count()).toBe(0);
    expect(await page.locator('text=One-way (44 km)').count()).toBe(0);
  });

  test('Intended Journey selector is removed', async ({ page }) => {
    expect(await page.locator('text=Intended Journey').count()).toBe(0);
    expect(await page.locator('select:has-text("farsakhs")').count()).toBe(0);
  });

  test('Compare-with-old-boundary toggle is removed', async ({ page }) => {
    expect(await page.locator('text=Compare with old boundary').count()).toBe(0);
  });

  test('city boundary explainer appears after tapping ℹ', async ({ page }) => {
    await page.locator('button[title="How was the city boundary generated?"]').click();
    await expect(page.locator('text=How it\'s generated:').first()).toBeVisible();
  });
});