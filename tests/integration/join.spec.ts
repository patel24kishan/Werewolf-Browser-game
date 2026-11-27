import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const EVIDENCE = 'production/qa/evidence/feature-5';

async function newPhone(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  return page;
}

/** Walks the host through setup (default 8 players, Moderating) to the lobby. */
async function toLobby(host: Page): Promise<void> {
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await host.getByRole('button', { name: 'Looks good' }).click();
  await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
}

async function joinAs(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await newPhone(context);
  await page.goto(`/join?code=${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the village' }).click();
  await expect(page).toHaveURL(new RegExp(`/play\\?code=${code}`));
  await expect(page.getByRole('heading', { name: 'Waiting for the village' })).toBeVisible();
  return page;
}

test('host creates a session and two players join and ready up', async ({ context }) => {
  const host = await newPhone(context);
  await host.goto('/');
  await expect(host.getByRole('heading', { name: 'WEREWOLF' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await host.screenshot({ path: `${EVIDENCE}/start.png` });

  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=[A-Z0-9]{4}$/);
  const code = new URL(host.url()).searchParams.get('code')!;
  await expect(host.getByText(code, { exact: true }).first()).toBeVisible();

  const ben = await joinAs(context, code, 'Ben');
  const chloe = await joinAs(context, code, 'Chloé');
  await toLobby(host);

  await ben.getByRole('button', { name: "I'm ready" }).click();
  await chloe.getByRole('button', { name: "I'm ready" }).click();

  const rowOf = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
  await expect(rowOf(host, 'Ben')).toContainText('Ready');
  await expect(rowOf(host, 'Chloé')).toContainText('Ready');
  await expect(rowOf(host, 'Ben')).not.toContainText('Not ready');

  // The player sees the others and marks themself.
  await expect(rowOf(ben, 'Ben')).toContainText('(you)');
  await expect(rowOf(ben, 'Chloé')).toContainText('Ready');
  await expect(ben.getByText('Tap again to undo.')).toBeVisible();

  await ben.waitForTimeout(400); // let the button colour transition finish
  await host.screenshot({ path: `${EVIDENCE}/host-lobby.png` });
  await ben.screenshot({ path: `${EVIDENCE}/player-lobby.png` });

  // Tapping again undoes it.
  await ben.getByRole('button', { name: "I'm ready" }).click();
  await expect(rowOf(host, 'Ben')).toContainText('Not ready');
  await expect(rowOf(host, 'Chloé')).not.toContainText('Not ready');
});

test('join screens: bad code, unknown code, name taken, evidence screenshots', async ({ context }) => {
  const host = await newPhone(context);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=/);
  const code = new URL(host.url()).searchParams.get('code')!;
  await joinAs(context, code, 'Asha');

  const phone = await newPhone(context);
  await phone.goto('/join?code=zz');
  const input = phone.getByLabel('Game code');
  await expect(phone.locator('.field__error')).toContainText('4 characters');

  await input.fill('K7QX'); // Valid shape, no such game (the host's code is random; K7QX collides only by chance).
  test.skip(code === 'K7QX', 'random code collided with the unknown-code probe');
  await phone.getByRole('button', { name: 'Continue' }).click();
  await expect(phone.locator('.field__error')).toHaveText('No game with code K7QX');
  await input.fill('');
  await input.fill(code.toLowerCase());
  await expect(input).toHaveValue(code);
  await phone.screenshot({ path: `${EVIDENCE}/join-code.png` });

  // Scan view: no camera in headless Chromium, so the message and the way back show.
  await phone.getByRole('button', { name: "Scan the host's QR code" }).click();
  await expect(phone.getByRole('heading', { name: 'Camera not available' })).toBeVisible();
  await phone.screenshot({ path: `${EVIDENCE}/join-scan-denied.png` });
  await phone.getByRole('button', { name: 'Type the code instead' }).click();
  await phone.getByLabel('Game code').fill(code);

  await phone.getByRole('button', { name: 'Continue' }).click();
  await expect(phone.getByLabel('Your name')).toBeVisible();
  await phone.getByLabel('Your name').fill('Asha');
  await phone.screenshot({ path: `${EVIDENCE}/join-name.png` });
  await phone.getByRole('button', { name: 'Join the village' }).click();
  await expect(phone.locator('.field__error')).toHaveText('That name is taken. Try another.');

  await phone.getByLabel('Your name').fill('A name that is far too long');
  await phone.getByRole('button', { name: 'Join the village' }).click();
  await expect(phone.locator('.field__error')).toContainText('1 to 12 characters');

  await phone.getByRole('button', { name: 'Back' }).click();
  await expect(phone.getByRole('heading', { name: 'Join a game' })).toBeVisible();
  await phone.getByRole('button', { name: 'Back' }).click();
  await expect(phone).toHaveURL(/\/$/);
});

test('opening /play without joining sends the player to the join page', async ({ context }) => {
  const host = await newPhone(context);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=/);
  const code = new URL(host.url()).searchParams.get('code')!;

  const stranger = await newPhone(context);
  await stranger.goto(`/play?code=${code}`);
  await expect(stranger).toHaveURL(new RegExp(`/join\\?code=${code}`));
  await expect(stranger.getByLabel('Your name')).toBeVisible();
});
