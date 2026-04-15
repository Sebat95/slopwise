import { test, expect } from '@playwright/test';

test('landing page shows title and Google sign-in when there is no session', async ({
  page
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Slopwise/i);
  await expect(page.getByRole('heading', { name: 'Slopwise' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Sign in with Google/i })
  ).toBeVisible();
});
