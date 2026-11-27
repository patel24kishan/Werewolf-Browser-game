import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const EVIDENCE = 'production/qa/evidence/feature-9';

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

/** Moderating host, 5 players, deal. `sheriffOn` false turns the setup switch off first. */
async function deal(context: BrowserContext, sheriffOn: boolean): Promise<{ host: Page; phones: Record<string, Page> }> {
  const host = await newPhone(context);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=[A-Z0-9]{4}$/);
  const code = new URL(host.url()).searchParams.get('code')!;
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();
  for (let i = 0; i < 3; i++) await host.getByRole('button', { name: 'Fewer players' }).click();
  if (!sheriffOn) {
    await host.getByRole('switch', { name: /Elect a Sheriff/ }).click();
    await expect(host.getByRole('switch', { name: /Elect a Sheriff/ })).toHaveAttribute('aria-checked', 'false');
  }
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await host.getByRole('button', { name: 'Looks good' }).click();
  await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const phones: Record<string, Page> = {};
  for (const n of ['Asha', 'Ben', 'Chloé', 'Dev', 'Farah']) phones[n] = await joinAs(context, code, n);
  await expect(host.getByRole('button', { name: /^Start/ })).toBeEnabled();
  await host.getByRole('button', { name: /^Start/ }).click();
  return { host, phones };
}

const sheriffHeading = (p: Page) => p.getByRole('heading', { name: "You're the Sheriff" });

test('assign the Sheriff, see the badge, then pass the card on when the Sheriff dies', async ({ context }) => {
  const { host, phones } = await deal(context, true);
  await expect(host.getByRole('heading', { name: "Who's the Sheriff?" })).toBeVisible();
  const give = host.getByRole('button', { name: 'Give the Sheriff card to Chloé' });
  await expect(host.getByRole('button', { name: 'Give the Sheriff card' })).toBeDisabled();
  await host.getByRole('radio', { name: 'Chloé' }).check();
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${EVIDENCE}/assign-sheriff.png` });
  await give.click();

  const chloe = phones['Chloé'];
  await expect(sheriffHeading(chloe)).toBeVisible();
  await expect(chloe.getByAltText('Sheriff card')).toBeVisible();
  await chloe.waitForTimeout(1500);
  await chloe.screenshot({ path: `${EVIDENCE}/player-sheriff.png` });
  for (const n of ['Asha', 'Ben', 'Dev', 'Farah']) {
    await expect(phones[n].getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
    await expect(sheriffHeading(phones[n])).toHaveCount(0);
  }

  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  const badge = host.locator('.drow', { hasText: 'Chloé' }).locator('.drow__badge');
  await expect(badge).toHaveText('Sheriff');
  await expect(host.locator('.drow__badge')).toHaveCount(1);
  await host.screenshot({ path: `${EVIDENCE}/dashboard-sheriff-badge.png` });

  // The Sheriff taps the tile to see the secret role card.
  await chloe.getByRole('button', { name: /Your secret role card/ }).click();
  await chloe.getByRole('button', { name: 'Your card, face down. Tap to reveal.' }).click();
  await expect(chloe.getByRole('button', { name: /^Your card: .+\. Tap to hide\.$/ })).toBeVisible();

  // Night: Chloé is killed and revealed.
  await host.getByRole('button', { name: 'Night falls' }).click();
  await host.getByRole('checkbox', { name: 'Killed: Chloé' }).check();
  await host.getByRole('button', { name: 'Lock in 1 kill' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Lock in' }).click();
  await host.getByRole('button', { name: 'Reveal' }).click();
  await expect(host.getByText('The Sheriff died. Ask them to name a successor.')).toBeVisible();
  await expect(host.locator('.drow', { hasText: 'Chloé' }).locator('.drow__badge')).toBeVisible();
  await host.screenshot({ path: `${EVIDENCE}/succession-prompt.png` });

  await host.getByRole('button', { name: 'Choose the new Sheriff' }).click();
  await expect(host.getByRole('radio', { name: 'Chloé' })).toHaveCount(0);
  await host.getByRole('radio', { name: 'Dev' }).check();
  await host.getByRole('button', { name: 'Give the Sheriff card to Dev' }).click();

  await expect(sheriffHeading(phones.Dev)).toBeVisible();
  await expect(sheriffHeading(chloe)).toHaveCount(0);
  await expect(chloe.getByText('Dead', { exact: true })).toBeVisible();
  await expect(host.getByText('The Sheriff died. Ask them to name a successor.')).toHaveCount(0);
});

test('skipping the Sheriff goes to the dashboard with no badge and no Sheriff card', async ({ context }) => {
  const { host, phones } = await deal(context, true);
  await host.getByRole('button', { name: 'Skip, no Sheriff this game' }).click();
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  await expect(host.locator('.drow__badge')).toHaveCount(0);
  // A reload before the night does not ask again.
  await host.reload();
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  await expect(host.getByText("Who's the Sheriff?")).toHaveCount(0);
  for (const p of Object.values(phones)) {
    await expect(p.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
    await expect(sheriffHeading(p)).toHaveCount(0);
  }
  // The dashboard can still open the screen to assign later.
  await host.getByRole('button', { name: 'Sheriff', exact: true }).click();
  await expect(host.getByRole('heading', { name: "Who's the Sheriff?" })).toBeVisible();
  await host.getByRole('button', { name: 'Back' }).click();
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
});

test('with the Sheriff switched off the step and its controls never appear', async ({ context }) => {
  const { host } = await deal(context, false);
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Night falls' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Sheriff', exact: true })).toHaveCount(0);
  await expect(host.getByText("Who's the Sheriff?")).toHaveCount(0);
});
