import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const EVIDENCE = 'production/qa/evidence/feature-10';

async function newPhone(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  return page;
}

async function joinAs(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await newPhone(context);
  await page.goto(`/join?code=${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the village' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for the village' })).toBeVisible();
  await page.getByRole('button', { name: "I'm ready" }).click();
  return page;
}

/** Moderating host + 5 players, dealt, Sheriff skipped. The host is on the dashboard. */
async function dealGame(context: BrowserContext): Promise<{ host: Page; code: string; phones: Record<string, Page> }> {
  const host = await newPhone(context);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=[A-Z0-9]{4}$/);
  const code = new URL(host.url()).searchParams.get('code')!;
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();
  for (let i = 0; i < 3; i++) await host.getByRole('button', { name: 'Fewer players' }).click();
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await host.getByRole('button', { name: 'Looks good' }).click();
  await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const phones: Record<string, Page> = {};
  for (const n of ['Asha', 'Ben', 'Chloé', 'Dev', 'Farah']) phones[n] = await joinAs(context, code, n);
  await expect(host.getByRole('button', { name: /^Start/ })).toBeEnabled();
  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: 'Skip, no Sheriff this game' }).click();
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  for (const p of Object.values(phones)) await expect(p.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
  return { host, code, phones };
}

async function endGame(host: Page) {
  await host.getByRole('button', { name: 'End game' }).click();
  const sheet = host.getByRole('dialog', { name: 'End this game?' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('hand hosting to a player: new host sets up, old host joins as a player, next game deals to everyone', async ({ context }) => {
  const { host, code, phones } = await dealGame(context);

  const sheet = await endGame(host);
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${EVIDENCE}/end-game-confirm.png` });
  await sheet.getByRole('button', { name: 'End game' }).click();

  await expect(host.getByRole('heading', { name: 'Another round?' })).toBeVisible();
  await expect(host.getByRole('radio', { name: 'Keep me' })).toBeChecked();
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${EVIDENCE}/game-over.png` });
  for (const p of Object.values(phones)) await expect(p.getByText('Game over. The host is setting up the next game.')).toBeVisible();
  await phones['Chloé'].waitForTimeout(300);
  await phones['Chloé'].screenshot({ path: `${EVIDENCE}/player-game-over.png` });

  await host.getByRole('radio', { name: 'Pass to Ben' }).check();
  await host.getByRole('button', { name: 'Set up next game' }).click();

  // The new host lands on setup step 1.
  const ben = phones['Ben'];
  await expect(ben).toHaveURL(new RegExp(`/host\\?code=${code}$`));
  await expect(ben.getByText('You are the host')).toBeVisible();
  await ben.waitForTimeout(300);
  await ben.screenshot({ path: `${EVIDENCE}/new-host-setup.png` });

  // The old host has no player record: the existing redirect leads to the Name step.
  await expect(host).toHaveURL(new RegExp(`/join\\?code=${code}$`));
  await expect(host.getByLabel('Your name')).toBeVisible();
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${EVIDENCE}/old-host-joins.png` });
  await host.getByLabel('Your name').fill('Hosta');
  await host.getByRole('button', { name: 'Join the village' }).click();
  await expect(host.getByRole('heading', { name: 'Waiting for the village' })).toBeVisible();
  await expect(host).toHaveURL(new RegExp(`/play\\?code=${code}$`));

  // Other players are back in the lobby, ready reset.
  for (const n of ['Asha', 'Chloé', 'Dev', 'Farah']) {
    await expect(phones[n].getByRole('heading', { name: 'Waiting for the village' })).toBeVisible();
    await expect(phones[n].getByText('Not ready').first()).toBeVisible();
  }

  // Ben hosts and plays: 5 players + himself would be 6.
  await ben.getByRole('radio', { name: /Playing/ }).check();
  await ben.getByRole('button', { name: 'Next: choose players & cards' }).click();
  await ben.getByRole('button', { name: 'More players' }).click();
  await ben.getByRole('button', { name: 'Next: review deck' }).click();
  await ben.getByRole('button', { name: 'Looks good' }).click();
  await expect(ben.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  const everyone = [host, phones['Asha'], phones['Chloé'], phones['Dev'], phones['Farah']];
  for (const p of everyone) await p.getByRole('button', { name: "I'm ready" }).click();
  await expect(ben.getByRole('button', { name: /^Start/ })).toBeEnabled();
  await ben.getByRole('button', { name: /^Start/ }).click();
  const skip = ben.getByRole('button', { name: 'Skip, no Sheriff this game' });
  await skip.click();

  for (const p of [ben, ...everyone]) await expect(p.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
});

test('keeping the host returns to setup step 1 with the lobby ready reset', async ({ context }) => {
  const { host, phones } = await dealGame(context);
  const sheet = await endGame(host);
  await sheet.getByRole('button', { name: 'End game' }).click();
  await expect(host.getByRole('heading', { name: 'Another round?' })).toBeVisible();
  await host.getByRole('radio', { name: 'Keep me' }).check();
  await host.getByRole('button', { name: 'Set up next game' }).click();

  await expect(host.getByText('You are the host')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Next: choose players & cards' })).toBeVisible();
  for (const p of Object.values(phones)) {
    await expect(p.getByRole('heading', { name: 'Waiting for the village' })).toBeVisible();
    await expect(p.getByRole('button', { name: "I'm ready" })).toHaveAttribute('aria-pressed', 'false');
  }
});

test('ending the session sends the host to Start and shows players that the game is gone', async ({ context }) => {
  const { host, phones } = await dealGame(context);
  const sheet = await endGame(host);
  await sheet.getByRole('button', { name: 'End game' }).click();
  await expect(host.getByRole('heading', { name: 'Another round?' })).toBeVisible();

  await host.getByRole('button', { name: 'End session' }).click();
  await host.getByRole('dialog', { name: 'End the session for everyone?' }).getByRole('button', { name: 'End session' }).click();

  await expect(host).toHaveURL(/\/$/);
  for (const p of Object.values(phones)) await expect(p.getByRole('heading', { name: 'That game is gone' })).toBeVisible();
});
