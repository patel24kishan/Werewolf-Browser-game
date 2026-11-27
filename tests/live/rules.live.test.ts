/**
 * Live check of `database.rules.json` against the Firebase project configured in
 * `.env.local`. Run by hand with `npm run test:live` after pasting the rules
 * into the Firebase console; never part of `npm test`. Skips when no config is
 * present.
 *
 * Three anonymous guests (host, player, latecomer) use one throwaway room,
 * which the host deletes at the end (also on failure). No config value or
 * token is ever printed.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackendError, FirebaseBackend, createRoom, newRoomCode, type FirebaseConfig } from '@/net';

function liveConfig(): FirebaseConfig | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };
  return Object.values(config).every((v) => v.trim() !== '') ? config : null;
}

const config = liveConfig();
if (!config) {
  console.warn(
    '[test:live] Skipped: no Firebase config. Create .env.local from .env.local.example ' +
      '(NEXT_PUBLIC_FIREBASE_*), paste database.rules.json into the console, then rerun.',
  );
}

/** Resolves when the call is denied by the rules (BackendError `rejected`), fails otherwise. */
async function expectDenied(what: string, call: () => Promise<unknown>): Promise<void> {
  let error: unknown = null;
  try {
    await call();
  } catch (e) {
    error = e;
  }
  expect(error, `${what} should be denied`).toBeInstanceOf(BackendError);
  expect((error as BackendError).code, what).toBe('rejected');
}

describe.skipIf(!config)('database.rules.json on the live project', () => {
  const run = randomUUID().slice(0, 8);
  const guest = (name: string) =>
    new FirebaseBackend(config!, { appName: `live-${name}-${run}`, persistence: 'memory' });
  const host = guest('host');
  const player = guest('player');
  const late = guest('late');
  let hostId = '';
  let playerId = '';
  let lateId = '';
  let code = '';
  const OTHER = `other-${run}`; // a second player record the host writes
  const p = (rest: string) => `rooms/${code}/${rest}`;

  beforeAll(async () => {
    [hostId, playerId, lateId] = await Promise.all([host.signIn(), player.signIn(), late.signIn()]);
    expect(new Set([hostId, playerId, lateId]).size).toBe(3);
    code = await createRoom(host, hostId, { newCode: () => newRoomCode() });
  });

  afterAll(async () => {
    try {
      if (code) await host.remove(`rooms/${code}`);
    } finally {
      await Promise.all([host.close(), player.close(), late.close()]);
    }
  });

  it('lets a stranger read meta but not claim a taken code', async () => {
    const meta = (await late.read(p('meta'))) as { hostId?: unknown };
    expect(meta.hostId).toBe(hostId);
    const stolen = { hostId: lateId, hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: 1 };
    expect(await late.claimRoom(code, stolen)).toBe(false);
    expect(((await late.read(p('meta'))) as { hostId?: unknown }).hostId).toBe(hostId);
  });

  it('lets a player join the lobby with alive and connected true', async () => {
    await expectDenied('joining as dead', () =>
      player.update({ [p(`players/${playerId}`)]: { name: 'Pat', ready: false, connected: true, alive: false } }),
    );
    await player.update({ [p(`players/${playerId}`)]: { name: 'Pat', ready: false, connected: true, alive: true } });
    const handle = await player.onDisconnect(p(`players/${playerId}/connected`), false);
    await handle.cancel();
  });

  it('lets the player change their own name, ready and connected', async () => {
    await player.update({
      [p(`players/${playerId}/name`)]: 'Patty',
      [p(`players/${playerId}/ready`)]: true,
      [p(`players/${playerId}/connected`)]: true,
    });
    expect(await player.read(p(`players/${playerId}`))).toEqual({
      name: 'Patty',
      ready: true,
      connected: true,
      alive: true,
    });
  });

  it('lets the host do its writes', async () => {
    await host.update({
      [p(`players/${OTHER}`)]: { name: 'Other', ready: true, connected: true, alive: true },
      [p(`cards/${playerId}`)]: { role: 'seer' },
      [p(`cards/${OTHER}`)]: { role: 'werewolf' },
      [p('spares')]: ['villager', 'villager'],
      [p('meta/status')]: 'dealt',
      [p('sheriff')]: playerId,
    });
    await host.update({ [p('meta/status')]: 'night', [p('night/killed/' + OTHER)]: true, [p('night/locked')]: true });
    expect(await host.read(p('night'))).toEqual({ killed: { [OTHER]: true }, locked: true });
    expect(await host.read(p('cards'))).toEqual({ [playerId]: { role: 'seer' }, [OTHER]: { role: 'werewolf' } });
  });

  it('hides night, spares, other cards, events and the room list from the player', async () => {
    await expectDenied('reading night', () => player.read(p('night')));
    await expectDenied('reading spares', () => player.read(p('spares')));
    await expectDenied('reading all cards', () => player.read(p('cards')));
    await expectDenied("reading another player's card", () => player.read(p(`cards/${OTHER}`)));
    await expectDenied('reading all events', () => player.read(p('events')));
    await expectDenied('reading the whole room', () => player.read(`rooms/${code}`));
    await expectDenied('listing rooms', () => player.read('rooms'));
    expect(await player.read(p(`cards/${playerId}`))).toEqual({ role: 'seer' });
    expect(await player.read(p('players'))).toBeTruthy();
  });

  it('reveals: the host kills a player and writes their event', async () => {
    await host.update({
      [p(`players/${playerId}/alive`)]: false,
      [p(`events/${playerId}`)]: { killedAt: 1234 },
      [p('meta/status')]: 'day',
    });
    expect(await player.read(p(`events/${playerId}`))).toEqual({ killedAt: 1234 });
    await expectDenied("reading another player's event", () => late.read(p(`events/${playerId}`)));
  });

  it('stops the player from un-dying, cheating or becoming host', async () => {
    await expectDenied('self-resurrection', () => player.update({ [p(`players/${playerId}/alive`)]: true }));
    await expectDenied('rewriting own record as alive', () =>
      player.update({ [p(`players/${playerId}`)]: { name: 'Patty', ready: true, connected: true, alive: true } }),
    );
    await expectDenied('deleting own record', () => player.remove(p(`players/${playerId}`)));
    await expectDenied('renaming outside the lobby', () => player.update({ [p(`players/${playerId}/name`)]: 'Zed' }));
    await expectDenied('writing meta/hostId', () => player.update({ [p('meta/hostId')]: playerId }));
    await expectDenied('writing meta/status', () => player.update({ [p('meta/status')]: 'lobby' }));
    await expectDenied('replacing meta', () =>
      player.update({
        [p('meta')]: { hostId: playerId, hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: 1 },
      }),
    );
    expect(
      await player.claimRoom(code, { hostId: playerId, hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: 1 }),
    ).toBe(false);
    await expectDenied('writing deck', () => player.update({ [p('deck/playerCount')]: 5 }));
    await expectDenied('writing own card', () => player.update({ [p(`cards/${playerId}`)]: { role: 'werewolf' } }));
    await expectDenied('writing night', () => player.update({ [p('night/locked')]: false }));
    await expectDenied('writing sheriff', () => player.update({ [p('sheriff')]: OTHER }));
    await expectDenied("writing another player's record", () =>
      player.update({ [p(`players/${OTHER}/ready`)]: false }),
    );
    await expectDenied("deleting another player's record", () => player.remove(p(`players/${OTHER}`)));
    await expectDenied('deleting the room', () => player.remove(`rooms/${code}`));
    // Presence still works for a dead player outside the lobby.
    await player.update({ [p(`players/${playerId}/connected`)]: false });
    await player.update({ [p(`players/${playerId}/connected`)]: true });
  });

  it('denies joining after the game has left the lobby', async () => {
    await expectDenied('late join', () =>
      late.update({ [p(`players/${lateId}`)]: { name: 'Late', ready: false, connected: true, alive: true } }),
    );
  });

  it('rejects malformed host writes and unknown sections', async () => {
    await expectDenied('unknown role', () => host.update({ [p(`cards/${OTHER}`)]: { role: 'sheriff' } }));
    await expectDenied('unknown section', () => host.update({ [p('extra')]: 1 }));
    await expectDenied('bad status', () => host.update({ [p('meta/status')]: 'paused' }));
    await expectDenied('handover to a stranger', () => host.update({ [p('meta/hostId')]: lateId }));
  });

  it('lets the host remove a player and delete the room', async () => {
    await host.remove(p(`players/${OTHER}`));
    await host.remove(`rooms/${code}`);
    expect(await late.read(p('meta'))).toBeNull();
    code = '';
  });
});

