const { test, expect } = require('@playwright/test');

test('demonstrates a recorded failure', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
