import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import roles from '../../src/game/data/roles.json';

const EVIDENCE = 'production/qa/evidence/feature-7';
const ALL_NAMES = Object.values(roles).map((r) => r.name);

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

async function setupHost(context: BrowserContext, playingName?: string): Promise<{ host: Page; code: string }> {
  const host = await newPhone(context);
  await host.goto('/');
  await host.getByRole('button', { name: 'Create session' }).click();
  await expect(host).toHaveURL(/\/host\?code=[A-Z0-9]{4}$/);
  const code = new URL(host.url()).searchParams.get('code')!;
  await expect(host.getByRole('img', { name: `QR code to join game ${code}` })).toBeVisible();
  if (playingName) {
    await host.getByRole('radio', { name: /Playing/ }).check();
    await host.getByLabel('Your name').fill(playingName);
  }
  await host.getByRole('button', { name: 'Next: choose players & cards' }).click();
  for (let i = 0; i < 3; i++) await host.getByRole('button', { name: 'Fewer players' }).click();
  await host.getByRole('button', { name: 'Next: review deck' }).click();
  await host.getByRole('button', { name: 'Looks good' }).click();
  await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  return { host, code };
}

const faceDown = (p: Page) => p.getByRole('button', { name: 'Your card, face down. Tap to reveal.' });
const faceUp = (p: Page) => p.getByRole('button', { name: /^Your card: .+\. Tap to hide\.$/ });

async function roleOf(p: Page): Promise<string> {
  const label = (await faceUp(p).getAttribute('aria-label'))!;
  return /^Your card: (.+)\. Tap to hide\.$/.exec(label)![1];
}

test('deal: each phone sees only its own card; flip toggles; reload keeps the role', async ({ context }) => {
  const { host, code } = await setupHost(context);
  const phones: Page[] = [];
  for (const n of ['Asha', 'Ben', 'Chloé', 'Dev', 'Emeka']) phones.push(await joinAs(context, code, n));
  await expect(host.getByRole('button', { name: /^Start/ })).toBeEnabled();
  await host.getByRole('button', { name: /^Start/ }).click();

  for (const p of phones) {
    await expect(p.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
    await expect(faceDown(p)).toHaveAttribute('aria-pressed', 'false');
    await expect(p.getByText('Keep your screen away from your neighbours.')).toBeVisible();
  }
  await phones[0].waitForTimeout(600);
  await phones[0].screenshot({ path: `${EVIDENCE}/card-face-down.png` });

  const seen: string[] = [];
  for (const p of phones) {
    await faceDown(p).click();
    await expect(faceUp(p)).toHaveAttribute('aria-pressed', 'true');
    const mine = await roleOf(p);
    seen.push(mine);
    await expect(p.getByRole('heading', { level: 1 })).toHaveText(mine);
    const text = await p.locator('body').innerText();
    for (const other of ALL_NAMES.filter((n) => n !== mine)) {
      expect(text, `${other} leaked onto ${mine}'s screen`).not.toMatch(new RegExp(`\\b${other}\\b`));
    }
  }
  expect([...seen].sort()).toEqual(['Seer', 'Simple Villager', 'Simple Villager', 'Simple Villager', 'Werewolf']);
  await phones[0].waitForTimeout(800);
  await phones[0].screenshot({ path: `${EVIDENCE}/card-face-up.png` });

  await faceUp(phones[1]).click();
  await expect(faceDown(phones[1])).toHaveAttribute('aria-pressed', 'false');

  // Reload: same role, face down.
  const before = seen[2];
  await phones[2].reload();
  await expect(faceDown(phones[2])).toBeVisible();
  await faceDown(phones[2]).click();
  expect(await roleOf(phones[2])).toBe(before);

  // Reduced motion: still toggles, captured for evidence.
  await phones[0].emulateMedia({ reducedMotion: 'reduce' });
  await phones[0].reload();
  await faceDown(phones[0]).click();
  await expect(faceUp(phones[0])).toBeVisible();
  await expect(phones[0].locator('.rcard')).toHaveAttribute('data-motion', 'reduced');
  await phones[0].waitForTimeout(500);
  await phones[0].screenshot({ path: `${EVIDENCE}/card-face-up-reduced-motion.png` });
});

test('a playing host sees their own card on /host', async ({ context }) => {
  const { host, code } = await setupHost(context, 'Hosta');
  for (const n of ['Asha', 'Ben', 'Chloé', 'Dev']) await joinAs(context, code, n);
  await expect(host.getByRole('button', { name: /^Start/ })).toBeEnabled();
  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: 'Skip, no Sheriff this game' }).click();
  await expect(host.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
  await expect(host.getByText('Hosta', { exact: true })).toBeVisible();
  await host.waitForTimeout(600);
  await host.screenshot({ path: `${EVIDENCE}/playing-host-card.png` });
  await faceDown(host).click();
  await expect(faceUp(host)).toBeVisible();
});
