import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const EVIDENCE = 'production/qa/evidence/feature-6';

async function newPhone(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  return page;
}

async function joinAs(context: BrowserContext, code: string, name: string, ready = false): Promise<Page> {
  const page = await newPhone(context);
  await page.goto(`/join?code=${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the village' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for the village' })).toBeVisible();
  if (ready) await page.getByRole('button', { name: "I'm ready" }).click();
  return page;
}

async function createSession(context: BrowserContext): Promise<{ host: Page; code: string }> {
  const host = await newPhone(context);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=[A-Z0-9]{4}$/);
  const code = new URL(host.url()).searchParams.get('code')!;
  await expect(host.getByRole('img', { name: `QR code to join game ${code}` })).toBeVisible();
  return { host, code };
}

test('host sets up 5 players with Witch and Thief, then deals from the lobby', async ({ context }) => {
  const { host, code } = await createSession(context);
  await expect(host.getByText('Players join with this code')).toBeVisible();
  await expect(host.getByRole('radio', { name: /Moderating/ })).toBeChecked();
  await host.screenshot({ path: `${EVIDENCE}/session-created.png` });
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();

  // Players & roles: default 8, step down to 5.
  await expect(host.getByText('Step 1–2 of 3')).toBeVisible();
  await expect(host.getByTestId('player-count')).toHaveText('8');
  for (let i = 0; i < 3; i++) await host.getByRole('button', { name: 'Fewer players' }).click();
  await expect(host.getByTestId('player-count')).toHaveText('5');
  await expect(host.getByRole('button', { name: 'Fewer players' })).toBeDisabled();
  await expect(host.getByText(/From the rulebook for 5 players/)).toContainText('1 Werewolf, 1 Seer');
  await host.getByRole('button', { name: 'Witch' }).click();
  await host.getByRole('button', { name: 'Thief' }).click();
  await expect(host.getByRole('button', { name: 'Witch' })).toHaveAttribute('aria-pressed', 'true');
  await host.screenshot({ path: `${EVIDENCE}/players-roles.png` });

  // Too many specials shows an error and refuses to go on.
  await host.getByRole('button', { name: 'Hunter' }).click();
  await host.getByRole('button', { name: 'Cupid' }).click();
  await expect(host.locator('.notice')).toContainText('at most 3 special roles');
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await expect(host.getByText('Step 1–2 of 3')).toBeVisible();
  await host.getByRole('button', { name: 'Hunter' }).click();
  await host.getByRole('button', { name: 'Cupid' }).click();

  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await expect(host.getByRole('heading', { name: 'Review the deck' })).toBeVisible();
  await expect(host.getByText('7 cards: 5 players + 2 spare for the Thief')).toBeVisible();
  await host.screenshot({ path: `${EVIDENCE}/review-deck.png` });

  // Back and Edit return to the previous step; then on to the lobby.
  await host.getByRole('button', { name: 'Edit' }).click();
  await expect(host.getByText('Step 1–2 of 3')).toBeVisible();
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await host.getByRole('button', { name: 'Looks good' }).click();
  await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const start = host.getByRole('button', { name: /^Start/ });
  await expect(start).toBeDisabled();
  await expect(start).toHaveText('Start — 5 more players needed');

  const names = ['Asha', 'Ben', 'Chloé', 'Dev', 'Emeka'];
  const phones: Page[] = [];
  for (const n of names) phones.push(await joinAs(context, code, n));
  await expect(host.getByText('5 / 5').first()).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(start).toContainText('waiting for');

  for (const phone of phones.slice(0, 3)) await phone.getByRole('button', { name: "I'm ready" }).click();
  await expect(start).toHaveText('Start — waiting for Dev and Emeka');
  await phones[4].getByRole('button', { name: "I'm ready" }).click();
  await expect(start).toHaveText('Start — waiting for Dev');
  await host.screenshot({ path: `${EVIDENCE}/lobby-waiting.png` });
  await phones[3].getByRole('button', { name: "I'm ready" }).click();
  await expect(start).toHaveText('Start');
  await expect(start).toBeEnabled();

  // Remove a player (with confirmation): the count drops and Start is blocked again.
  await host.getByRole('button', { name: 'Remove Emeka' }).click();
  await expect(host.getByRole('dialog')).toContainText('Remove Emeka?');
  await host.getByRole('button', { name: 'Keep' }).click();
  await expect(host.getByRole('listitem').filter({ hasText: 'Emeka' })).toHaveCount(1);
  await host.getByRole('button', { name: 'Remove Emeka' }).click();
  await host.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(host.getByRole('listitem').filter({ hasText: 'Emeka' })).toHaveCount(0);
  await expect(host.getByText('4 / 5').first()).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(start).toHaveText('Start — 1 more player needed');

  // A replacement joins and readies.
  const farah = await joinAs(context, code, 'Farah');
  await expect(start).toHaveText('Start — waiting for Farah');
  await farah.getByRole('button', { name: "I'm ready" }).click();
  await expect(start).toBeEnabled();
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${EVIDENCE}/lobby-ready-to-start.png` });

  await start.click();
  await host.getByRole('button', { name: 'Skip, no Sheriff this game' }).click();
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  // Players see the game has started (room status is no longer lobby).
  await expect(phones[0].getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
  await expect(farah.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Night falls' })).toBeVisible();
});

test('host who plays must give a name and counts as a player', async ({ context }) => {
  const { host, code } = await createSession(context);
  await host.getByRole('radio', { name: /Playing/ }).check();
  await expect(host.getByLabel('Your name')).toBeVisible();

  // No name: stays on step 1 with an error.
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();
  await expect(host.locator('.field__error')).toContainText('1 to 12 characters');
  await host.getByLabel('Your name').fill('Hosta');
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();

  await expect(host.getByText('Step 1–2 of 3')).toBeVisible();
  for (let i = 0; i < 3; i++) await host.getByRole('button', { name: 'Fewer players' }).click();
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await expect(host.getByText('5 cards for 5 players')).toBeVisible();
  await host.getByRole('button', { name: 'Looks good' }).click();

  const start = host.getByRole('button', { name: /^Start/ });
  await expect(host.getByRole('listitem').filter({ hasText: 'Hosta' })).toContainText('(you)');
  await expect(host.getByText('1 / 5').first()).toBeVisible();
  await expect(start).toHaveText('Start — 4 more players needed');

  const phones: Page[] = [];
  for (const n of ['Asha', 'Ben', 'Chloé', 'Dev']) phones.push(await joinAs(context, code, n, true));
  await expect(host.getByText('5 / 5').first()).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();
  await host.getByRole('button', { name: 'Skip, no Sheriff this game' }).click();
  await expect(host.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
});
