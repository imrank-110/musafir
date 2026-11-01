import { test, expect } from '@playwright/test';

/** Open the app and click a top-nav tab by name. */
async function openTab(page, name) {
  await page.goto('/');
  await page.locator(`button:has-text("${name}")`).first().click();
  await page.waitForTimeout(300);
}

/** Add a bundled city as a Watan via the search + suggestion list. */
async function addWatan(page, cityName) {
  const input = page.locator('input[data-testid="watan-city-search"]');
  await input.click();
  await input.fill(cityName);
  await page.getByRole('option', { name: cityName, exact: true }).click();
}

test.describe('Settings tab (Watan + frequent traveller)', () => {
  test('opens with both sections', async ({ page }) => {
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Your Hometowns (Watan)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Frequent traveller' })).toBeVisible();
    await expect(page.locator('text=No hometowns added yet.')).toBeVisible();
  });

  test('can add and remove a Watan', async ({ page }) => {
    await openTab(page, 'Settings');
    await addWatan(page, 'Houston');
    await expect(page.locator('text=Houston').first()).toBeVisible();

    await page.getByRole('button', { name: 'Remove Houston' }).click();
    await expect(page.locator('text=Houston')).not.toBeVisible();
    await expect(page.locator('text=No hometowns added yet.')).toBeVisible();
  });

  test('Watan persists across reloads', async ({ page }) => {
    await openTab(page, 'Settings');
    await addWatan(page, 'Houston');
    await expect(page.locator('text=Houston').first()).toBeVisible();

    await page.reload();
    await page.locator('button:has-text("Settings")').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Houston').first()).toBeVisible();
  });

  test('"i" buttons open the fiqh explainers', async ({ page }) => {
    await openTab(page, 'Settings');
    await page.locator('button[data-testid="watan-info"]').click();
    await expect(page.locator('text=What is a Watan (hometown)?')).toBeVisible();
    await expect(page.locator('text=You can genuinely have more than one Watan').first()).toBeVisible();

    await page.locator('button[data-testid="frequent-info"]').click();
    await expect(page.locator('text=What is Katheer al-Safar (frequent traveller)?')).toBeVisible();
  });

  test('frequent traveller setting drives the Qasr verdict (Not a traveller)', async ({ page }) => {
    await openTab(page, 'Settings');
    await page.getByRole('button', { name: /Yes — travel is a regular part of my routine/ }).click();

    await openTab(page, 'Qasr');
    await expect(page.locator('[data-testid="verdict-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="verdict-card"]')).toContainText('Not a traveller');
    await expect(page.locator('[data-testid="verdict-card"]')).toContainText('Katheer al-Safar');
  });

  test('inside a saved Watan → verdict is Not a traveller', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:5173' });
    await context.setGeolocation({ latitude: 29.7604, longitude: -95.3698 });

    await openTab(page, 'Settings');
    await addWatan(page, 'Houston');

    await openTab(page, 'Qasr');
    await page.locator('button:has-text("Use Current Location")').click();
    await expect(page.locator('[data-testid="verdict-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="verdict-card"]')).toContainText('Not a traveller');
    await expect(page.locator('[data-testid="verdict-card"]')).toContainText('Watan');
    await expect(page.locator('text=inside your Watan (Houston)')).toBeVisible();
  });

  test('Reset settings clears the saved Watan', async ({ page }) => {
    await openTab(page, 'Settings');
    await addWatan(page, 'Houston');
    await expect(page.locator('text=Houston').first()).toBeVisible();

    await page.getByRole('button', { name: 'Reset settings' }).click();
    await expect(page.locator('text=No hometowns added yet.')).toBeVisible();
    await expect(page.locator('text=Houston')).not.toBeVisible();
  });
});
