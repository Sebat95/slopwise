import { test, expect } from '@playwright/test';

test('has title and basic UI elements', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Slopwise/i);

  // You can add more specific assertions here based on your UI
  // For example, checking if the main heading is visible:
  // await expect(page.locator('h1')).toBeVisible();
});
