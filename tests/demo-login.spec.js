const { test, expect } = require('@playwright/test');

test('valid login opens dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.DEMO_VALID_EMAIL || 'demo@example.test');
  await page.getByLabel('Password').fill(process.env.DEMO_VALID_PASSWORD || 'demo-only-password');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('invalid password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.DEMO_VALID_EMAIL || 'demo@example.test');
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page).toHaveURL(/\/login$/);
});
