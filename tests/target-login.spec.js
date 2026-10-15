const { test, expect } = require('@playwright/test');

const config = {
  loginPath: process.env.TARGET_LOGIN_PATH,
  emailLabel: process.env.TARGET_EMAIL_LABEL,
  passwordLabel: process.env.TARGET_PASSWORD_LABEL,
  submitName: process.env.TARGET_SUBMIT_NAME,
  successPath: process.env.TARGET_SUCCESS_PATH,
  invalidMessage: process.env.TARGET_INVALID_MESSAGE,
  email: process.env.TARGET_VALID_EMAIL,
  password: process.env.TARGET_VALID_PASSWORD,
  invalidPassword: process.env.TARGET_INVALID_PASSWORD
};

test('valid login opens the expected page', async ({ page }) => {
  await page.goto(config.loginPath);
  await page.getByLabel(config.emailLabel).fill(config.email);
  await page.getByLabel(config.passwordLabel).fill(config.password);
  await page.getByRole('button', { name: config.submitName }).click();
  await expect(page).toHaveURL(new URL(config.successPath, process.env.TARGET_BASE_URL).toString());
});

test('invalid password shows the expected error', async ({ page }) => {
  await page.goto(config.loginPath);
  await page.getByLabel(config.emailLabel).fill(config.email);
  await page.getByLabel(config.passwordLabel).fill(config.invalidPassword);
  await page.getByRole('button', { name: config.submitName }).click();
  await expect(page.getByText(config.invalidMessage, { exact: true })).toBeVisible();
});
