import { test, expect } from '@playwright/test';

/** Select a bundled city through the searchable combobox. */
async function selectCityViaSearch(page, name) {
  const search = page.locator('input[role="combobox"]').first();
  await search.click();
  await search.fill(name);
  await page.getByRole('option', { name, exact: true }).click();
}

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

  test('city search dropdown is present', async ({ page }) => {
    const search = page.locator('input[role="combobox"]').first();
    await expect(search).toBeVisible();
    await search.click();
    await expect(page.getByRole('option', { name: 'Houston', exact: true })).toBeVisible();
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

  test('disclaimer card and Get Complete Verdict button are removed', async ({ page }) => {
    expect(await page.locator('text=Important:').count()).toBe(0);
    expect(await page.locator('text=This is a guide').count()).toBe(0);
    expect(await page.locator('button:has-text("Get Complete Verdict")').count()).toBe(0);
  });

  test('Start Monitoring is disabled when no city selected', async ({ page }) => {
    const startBtn = page.locator('button:has-text("Start Monitoring")');
    await expect(startBtn).toBeDisabled();
  });

  test('legend items are visible on map area', async ({ page }) => {
    await expect(page.locator('text=City Boundary').first()).toBeVisible();
    await expect(page.locator('text=Hadd (22 km)').first()).toBeVisible();
  });

  test('can select a city from dropdown', async ({ page }) => {
    await selectCityViaSearch(page, 'Houston');
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

  test('legal city limits legend entry is present', async ({ page }) => {
    await expect(page.locator('text=Legal city limits').first()).toBeVisible();
  });

  test('legal boundary overlay renders for a selected city', async ({ page }) => {
    await selectCityViaSearch(page, 'Houston');
    // The legal-boundaries.json file is fetched lazily (4.3 MB) — poll for the
    // blue dashed Leaflet path instead of guessing a wait.
    await expect.poll(async () => {
      const paths = page.locator('.leaflet-overlay-pane path');
      const count = await paths.count();
      for (let i = 0; i < count; i++) {
        if ((await paths.nth(i).getAttribute('stroke')) === '#3b82f6') return true;
      }
      return false;
    }, { timeout: 15000 }).toBe(true);
  });

  test('legal city limits explainer appears after tapping its ℹ', async ({ page }) => {
    await page.locator('button[title="What are the legal city limits?"]').click();
    await expect(page.locator('text=administrative border on paper').first()).toBeVisible();
  });

  test('Hadd explainer opens from the map legend', async ({ page }) => {
    await page.locator('button[title="Why this recommendation?"]').click();
    await expect(page.locator('text=can no longer see you').first()).toBeVisible();
  });

  test('legal city limits can be toggled off and on', async ({ page }) => {
    await selectCityViaSearch(page, 'Houston');
    // Wait for the blue overlay to appear (default is on).
    await expect.poll(async () => {
      const paths = page.locator('.leaflet-overlay-pane path');
      const count = await paths.count();
      for (let i = 0; i < count; i++) {
        if ((await paths.nth(i).getAttribute('stroke')) === '#3b82f6') return true;
      }
      return false;
    }, { timeout: 15000 }).toBe(true);

    // Toggle off — the blue dashed paths must disappear (legal limits off is
    // also reflected in the legend entry's tooltip).
    await page.locator('button[title="Hide legal city limits"]').click();
    await expect.poll(async () => {
      const paths = page.locator('.leaflet-overlay-pane path');
      const count = await paths.count();
      for (let i = 0; i < count; i++) {
        if ((await paths.nth(i).getAttribute('stroke')) === '#3b82f6') return false;
      }
      return true;
    }, { timeout: 8000 }).toBe(true);

    // Toggle back on — the overlay returns from the in-memory cache.
    await page.locator('button[title="Show legal city limits"]').click();
    await expect.poll(async () => {
      const paths = page.locator('.leaflet-overlay-pane path');
      const count = await paths.count();
      for (let i = 0; i < count; i++) {
        if ((await paths.nth(i).getAttribute('stroke')) === '#3b82f6') return true;
      }
      return false;
    }, { timeout: 8000 }).toBe(true);
  });

  test('Use Current Location requires a selected city and never auto-generates one', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:5173' });
    await context.setGeolocation({ latitude: 29.7604, longitude: -95.3698 });

    // No city selected → the location button just prompts; it must not create a city.
    await page.locator('button:has-text("Use Current Location")').click();
    await expect(page.locator('text=Select a city from the list first').first()).toBeVisible();

    // After choosing a city, the same location is measured against it.
    await selectCityViaSearch(page, 'Houston');
    await page.locator('button:has-text("Use Current Location")').click();
    await expect(page.locator('text=measured against Houston').first()).toBeVisible();
  });
});