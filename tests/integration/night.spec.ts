import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import roles from '../../src/game/data/roles.json';

const EVIDENCE = 'production/qa/evidence/feature-8';
const ROLE_NAMES = Object.values(roles).map((r) => r.name);

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

/** A moderating host plus five dealt players. */
async function dealtGame(context: BrowserContext): Promise<{ host: Page; code: string; phones: Record<string, Page> }> {
  // Every page records navigator.vibrate calls instead of buzzing.
  await context.addInitScript(() => {
    const calls: number[][] = [];
    (window as unknown as { __vibrations: number[][] }).__vibrations = calls;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number[]) => {
        calls.push(pattern);
        return true;
      },
    });
  });
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
  await expect(host.getByRole('button', { name: 'Night falls' })).toBeVisible();
  return { host, code, phones };
}

const vibrations = (p: Page) => p.evaluate(() => (window as unknown as { __vibrations: number[][] }).__vibrations.length);

test('card overlay: a name tap shows that player\'s role and Escape closes it', async ({ context }) => {
  const { host } = await dealtGame(context);
  await expect(host.getByRole('heading', { name: 'Cards dealt' })).toBeVisible();
  const nameButton = host.getByRole('button', { name: 'Ben' });
  await nameButton.click();
  const dialog = host.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const role = (await dialog.getByRole('heading', { level: 2 }).innerText()).trim();
  expect(ROLE_NAMES).toContain(role);
  await expect(dialog.getByText('Tap anywhere to close')).toBeVisible();
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${EVIDENCE}/card-overlay.png` });
  await host.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(nameButton).toBeFocused();
});

test('night: toggle, confirm, undo, confirm, reveal; only the victim sees the attack', async ({ context }) => {
  const { host, phones } = await dealtGame(context);
  const farah = phones.Farah;
  const bystanders = ['Asha', 'Ben', 'Chloé', 'Dev'].map((n) => phones[n]);

  await host.getByRole('button', { name: 'Night falls' }).click();
  await expect(host.getByRole('heading', { name: 'Night', exact: true })).toBeVisible();
  const toggle = host.getByRole('checkbox', { name: 'Killed: Farah' });
  await toggle.check();
  await expect(toggle).toBeChecked();
  await host.waitForTimeout(200);
  await host.screenshot({ path: `${EVIDENCE}/dashboard-night.png` });

  // Confirm, undo the lock, confirm again.
  await host.getByRole('button', { name: 'Lock in 1 kill' }).click();
  const sheet = host.getByRole('dialog');
  await expect(sheet.getByText("Lock in tonight's kills?")).toBeVisible();
  await expect(sheet.getByText('Farah', { exact: true })).toBeVisible();
  await host.waitForTimeout(200);
  await host.screenshot({ path: `${EVIDENCE}/confirm-sheet.png` });
  await sheet.getByRole('button', { name: 'Lock in', exact: true }).click();
  await expect(host.getByRole('heading', { name: 'Dawn' })).toBeVisible();
  await expect(host.getByText('1 kill locked')).toBeVisible();
  await host.getByRole('button', { name: 'Undo lock' }).click();
  await expect(host.getByRole('button', { name: 'Lock in 1 kill' })).toBeVisible();
  await expect(host.getByRole('checkbox', { name: 'Killed: Farah' })).toBeChecked();
  await host.getByRole('button', { name: 'Lock in 1 kill' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Lock in', exact: true }).click();
  await expect(host.getByText("Farah's phone will shake and show the werewolf attack.")).toBeVisible();

  // Nothing reaches the players before Reveal.
  await expect(farah.getByRole('heading', { name: 'The wolves got you' })).toHaveCount(0);
  expect(await vibrations(farah)).toBe(0);
  await host.waitForTimeout(200);
  await host.screenshot({ path: `${EVIDENCE}/dawn-reveal.png` });

  await host.getByRole('button', { name: 'Reveal' }).click();

  await expect(farah.getByRole('heading', { name: 'The wolves got you' })).toBeVisible();
  await expect.poll(() => vibrations(farah)).toBe(1);
  expect(await farah.evaluate(() => (window as unknown as { __vibrations: number[][] }).__vibrations[0])).toEqual([200, 100, 300]);
  await farah.waitForTimeout(1600);
  await farah.screenshot({ path: `${EVIDENCE}/victim-attack-end.png` });

  for (const p of bystanders) {
    await expect(p.getByRole('heading', { name: 'Your card has arrived' })).toBeVisible();
    await expect(p.getByText('The wolves got you')).toHaveCount(0);
    await expect(p.getByText('You were killed in the night.')).toHaveCount(0);
    expect(await vibrations(p)).toBe(0);
  }

  // Host: Farah is dead and cannot be toggled, also in the next night.
  await expect(host.getByRole('heading', { name: 'Day', exact: true })).toBeVisible();
  await expect(host.getByText('Dead', { exact: true })).toBeVisible();
  await expect(host.getByRole('checkbox', { name: 'Killed: Farah' })).toBeDisabled();
  await expect(host.getByRole('checkbox', { name: 'Killed: Farah' })).not.toBeChecked();
  await expect(host.locator('li.drow--dead', { hasText: 'Farah' })).toHaveCount(1);
  await expect(host.locator('li.drow--killed')).toHaveCount(0);
  await host.screenshot({ path: `${EVIDENCE}/dashboard-day-dead-row.png` });
  await host.getByRole('button', { name: 'Night falls' }).click();
  await expect(host.getByRole('heading', { name: 'Night', exact: true })).toBeVisible();
  await expect(host.getByRole('checkbox', { name: 'Killed: Farah' })).toBeDisabled();
  await expect(host.getByRole('checkbox', { name: 'Killed: Asha' })).toBeEnabled();

  // Reload: the dead state shows straight away and the attack does not replay.
  await farah.reload();
  await expect(farah.getByRole('heading', { name: 'The wolves got you' })).toBeVisible();
  await expect(farah.locator('.attack-flash')).toHaveCount(0);
  expect(await vibrations(farah)).toBe(0); // the init script resets the page's call log on reload

  // Reduced motion: static frame, no flash.
  await farah.emulateMedia({ reducedMotion: 'reduce' });
  await farah.reload();
  await expect(farah.getByRole('heading', { name: 'The wolves got you' })).toBeVisible();
  await expect(farah.locator('.dead')).toHaveAttribute('data-playing', 'false');
  await farah.screenshot({ path: `${EVIDENCE}/victim-attack-reduced-motion.png` });
});
