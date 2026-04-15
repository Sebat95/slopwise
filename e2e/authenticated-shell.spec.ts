import { test, expect } from '@playwright/test';

test.describe('mocked API session', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/session', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: {
            name: 'Playwright User',
            email: 'playwright@example.com',
            picture: ''
          }
        })
      });
    });

    await page.route('**/api/googleProxy', async (route) => {
      const raw = route.request().postData();
      let url = '';
      try {
        url = raw ? ((JSON.parse(raw) as { url?: string }).url ?? '') : '';
      } catch {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Bad proxy body' })
        });
        return;
      }

      if (url.includes('drive/v3/files')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ files: [] })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });
  });

  test('redirects to spreadsheet picker with empty Drive list', async ({
    page
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sheets$/);
    await expect(
      page.getByRole('heading', { name: 'Choose a Spreadsheet' })
    ).toBeVisible();
    await expect(page.getByText('No spreadsheets found')).toBeVisible({
      timeout: 15_000
    });
  });
});
