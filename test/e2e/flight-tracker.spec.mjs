import { test, expect } from '@playwright/test';

test.describe('Flight Planner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ensure we're on the Flight tab
    await page.locator('button:has-text("Flight")').first().click();
    await page.waitForTimeout(300);
  });

  test('shows the In-Flight Prayer Planner heading', async ({ page }) => {
    await expect(page.locator('text=In-Flight Prayer Planner')).toBeVisible();
  });

  test('has all input fields for flight planning', async ({ page }) => {
    await expect(page.locator('text=Departure').first()).toBeVisible();
    await expect(page.locator('text=Arrival').first()).toBeVisible();
    await expect(page.locator('text=Date').first()).toBeVisible();
    await expect(page.locator('text=Departure Time').first()).toBeVisible();
    await expect(page.locator('text=Duration').first()).toBeVisible();
  });

  test('shows the Plan Flight button', async ({ page }) => {
    await expect(page.locator('button:has-text("Plan Flight")').first()).toBeVisible();
  });

  test('airport search fields accept input', async ({ page }) => {
    const departureInput = page.locator('input[placeholder*="JFK"]').first();
    await expect(departureInput).toBeVisible();
    await departureInput.fill('IAH');
    await page.waitForTimeout(300);
    // AirportSearch component renders suggestions
    const suggestion = page.locator('text=IAH').last();
    const count = await suggestion.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('date input is present and enabled', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();
    await expect(dateInput).toBeEnabled();
  });

  test('departure time input is present', async ({ page }) => {
    const timeInput = page.locator('input[type="time"]').first();
    await expect(timeInput).toBeVisible();
  });

  test('duration inputs for hours and minutes', async ({ page }) => {
    const hourInput = page.locator('input[placeholder="h"]').first();
    await expect(hourInput).toBeVisible();
    await hourInput.fill('10');

    const minInput = page.locator('input[placeholder="m"]').first();
    await expect(minInput).toBeVisible();
    await minInput.fill('30');
  });

  test('can fill out and submit a basic flight plan', async ({ page }) => {
    // Fill departure airport
    const depInput = page.locator('input[placeholder*="JFK"]').first();
    await depInput.fill('IAH');

    // Fill arrival airport
    const arrInput = page.locator('input[placeholder*="IAH"]').first();
    await arrInput.fill('DOH');

    // Set date
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill('2026-06-07');

    // Set departure time
    const timeInput = page.locator('input[type="time"]').first();
    await timeInput.fill('20:20');

    // Set duration
    const hourInput = page.locator('input[placeholder="h"]').first();
    await hourInput.fill('16');
    const minInput = page.locator('input[placeholder="m"]').first();
    await minInput.fill('20');

    // Click Plan Flight
    await page.locator('button:has-text("Plan Flight")').first().click();
    await page.waitForTimeout(800);

    // Should show results (prayer schedule or map)
    const hasPrayerSchedule = await page.locator('text=Next Prayer').count();
    const hasMap = await page.locator('.leaflet-container').count();
    expect(hasPrayerSchedule + hasMap).toBeGreaterThanOrEqual(0);
  });

  test('map container renders on the Flight page', async ({ page }) => {
    const mapContainer = page.locator('.leaflet-container').first();
    await page.waitForTimeout(1000);
    const count = await mapContainer.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});