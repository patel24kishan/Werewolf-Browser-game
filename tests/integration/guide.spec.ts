import { expect, test, type Page } from '@playwright/test';

const EVIDENCE = 'production/qa/evidence/feature-11';
const HEADINGS = ['The goal', 'The roles', 'A round', 'Rules', 'Card mix', 'Using the app', 'Tips'];

async function checkGuide(page: Page, shot?: boolean) {
  const help = page.getByRole('button', { name: 'How to play' });
  await help.click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);
  await expect(dialog.getByRole('table').locator('tbody tr')).toHaveCount(14);
  if (shot) {
    await page.screenshot({ path: `${EVIDENCE}/guide-top.png` });
    await dialog.getByRole('button', { name: 'Roles' }).click();
    await expect(dialog.getByRole('heading', { name: 'The roles' })).toBeFocused();
    await page.screenshot({ path: `${EVIDENCE}/guide-roles.png` });
    await dialog.getByRole('button', { name: 'Card mix' }).click();
    await expect(dialog.getByRole('heading', { name: 'Card mix' })).toBeFocused();
    await page.screenshot({ path: `${EVIDENCE}/guide-card-mix.png` });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Close guide' }).click();
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
}

test('guide opens from Start', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: `${EVIDENCE}/start-with-help.png` });
  await checkGuide(page, true);
  await expect(page.getByRole('button', { name: 'Join game' })).toBeVisible();
});

test('guide opens from the Join code step', async ({ page }) => {
  await page.goto('/join');
  await expect(page.getByRole('heading', { name: 'Join a game' })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/join-with-help.png` });
  await checkGuide(page);
  await expect(page.getByLabel('Game code')).toBeVisible();
});

test('guide opens from the host session step', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.getByText('You are the host')).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/host-session-with-help.png` });
  await checkGuide(page);
  await expect(page.getByRole('button', { name: 'Next: choose players & cards' })).toBeVisible();
});
