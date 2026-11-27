/**
 * Live check that three games running at the same time stay isolated, against
 * the Firebase project configured in `.env.local`. Run by hand with
 * `npm run test:live` after pasting `database.rules.json` into the console;
 * never part of `npm test`. Skips when no config is present.
 *
 * Three rooms, each with an anonymous host and five anonymous players (18 guests,
 * well under the free plan's 100 simultaneous connections), play through the real
 * room service at the same time: create, join, ready, deal, night, reveal. The
 * test then checks that no data crossed between rooms and that the rules refuse
 * cross-room reads and writes. Every room is deleted at the end, also on failure.
 * No config value or token is ever printed.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BackendError,
  FirebaseBackend,
  createRoom,
  newRoomCode,
  openRoom,
  type FirebaseConfig,
  type Room,
  type RoomAction,
} from '@/net';

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
  console.warn('[test:live] Three-room test skipped: no Firebase config in .env.local.');
}

const ROOMS = 3;
const PLAYERS_PER_ROOM = 5; // the smallest card mix: 1 werewolf, 1 seer, 3 villagers
const WAIT_MS = 20_000;

async function waitFor<T>(predicate: () => T, label: string): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > WAIT_MS) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function ok(room: Room, action: RoomAction, what: string): Promise<void> {
  const result = await room.dispatch(action);
  if (!result.ok) throw new Error(`${what} failed: ${result.error.code} ${result.error.message}`);
}

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

interface Phone {
  backend: FirebaseBackend;
  id: string;
  room: Room | null;
}

interface Game {
  label: string;
  code: string;
  host: Phone;
  players: Phone[];
}

describe.skipIf(!config)('three simultaneous games on the live project', () => {
  const run = randomUUID().slice(0, 8);
  const phone = (name: string): Phone => ({
    backend: new FirebaseBackend(config!, { appName: `rooms-${name}-${run}`, persistence: 'memory' }),
    id: '',
    room: null,
  });
  const games: Game[] = Array.from({ length: ROOMS }, (_, g) => ({
    label: String.fromCharCode(65 + g), // A, B, C
    code: '',
    host: phone(`host${g}`),
    players: Array.from({ length: PLAYERS_PER_ROOM }, (_, i) => phone(`g${g}p${i}`)),
  }));
  const everyone = games.flatMap((g) => [g.host, ...g.players]);

  beforeAll(async () => {
    await Promise.all(everyone.map(async (p) => (p.id = await p.backend.signIn())));
    expect(new Set(everyone.map((p) => p.id)).size).toBe(everyone.length);
    // All three hosts create their rooms at the same moment.
    await Promise.all(
      games.map(async (g) => {
        g.code = await createRoom(g.host.backend, g.host.id, { newCode: () => newRoomCode() });
      }),
    );
  }, 60_000);

  afterAll(async () => {
    try {
      await Promise.allSettled(games.filter((g) => g.code).map((g) => g.host.backend.remove(`rooms/${g.code}`)));
    } finally {
      for (const p of everyone) p.room?.close();
      await Promise.allSettled(everyone.map((p) => p.backend.close()));
    }
  }, 60_000);

  it('gives every game its own room code', () => {
    expect(new Set(games.map((g) => g.code)).size).toBe(ROOMS);
  });

  it('plays all three games at the same time without crossing over', async () => {
    await Promise.all(
      games.map(async (g) => {
        g.host.room = openRoom(g.host.backend, g.code, g.host.id);
        await g.host.room.whenLoaded();
        await ok(g.host.room, { type: 'configureDeck', playerCount: PLAYERS_PER_ROOM, specialRoles: [], sheriffOn: false }, `${g.label} configure`);

        await Promise.all(
          g.players.map(async (p, i) => {
            p.room = openRoom(p.backend, g.code, p.id);
            await p.room.whenLoaded();
            await ok(p.room, { type: 'join', name: `${g.label}${i + 1}` }, `${g.label}${i + 1} join`);
            await ok(p.room, { type: 'setReady', ready: true }, `${g.label}${i + 1} ready`);
          }),
        );

        const host = g.host.room;
        await waitFor(() => {
          const players = host.getView().state?.players ?? {};
          const ids = Object.keys(players);
          return ids.length === PLAYERS_PER_ROOM && ids.every((id) => players[id]?.ready);
        }, `room ${g.label} to fill`);
        await ok(host, { type: 'deal' }, `${g.label} deal`);
      }),
    );

    for (const g of games) {
      const hostState = g.host.room!.getView().state!;
      // Only this room's own players are in it.
      expect(Object.keys(hostState.players).sort()).toEqual(g.players.map((p) => p.id).sort());
      // The deal is this room's own five cards: 1 werewolf, 1 seer, 3 villagers.
      const roles = Object.values(hostState.cards).map((c) => c.role).sort();
      expect(roles).toEqual(['seer', 'villager', 'villager', 'villager', 'werewolf']);

      for (const p of g.players) {
        const state = await waitFor(() => {
          const s = p.room!.getView().state;
          return s && s.meta.status === 'dealt' && Object.keys(s.cards).length > 0 ? s : null;
        }, `card for ${g.label} player`);
        // Each phone sees only its own card, and it matches the host's view.
        expect(Object.keys(state.cards)).toEqual([p.id]);
        expect(state.cards[p.id]?.role).toBe(hostState.cards[p.id]?.role);
      }
    }
  }, 120_000);

  it('keeps one room’s night and reveal out of the other rooms', async () => {
    // Each host kills its own first player, all at the same time.
    await Promise.all(
      games.map(async (g) => {
        const host = g.host.room!;
        const victim = g.players[0]!.id;
        await ok(host, { type: 'startNight' }, `${g.label} night`);
        await ok(host, { type: 'toggleKilled', playerId: victim }, `${g.label} toggle`);
        await ok(host, { type: 'confirmKills' }, `${g.label} confirm`);
        await ok(host, { type: 'reveal' }, `${g.label} reveal`);
      }),
    );

    for (const g of games) {
      const victim = g.players[0]!;
      const victimState = await waitFor(() => {
        const s = victim.room!.getView().state;
        return s && s.events[victim.id] ? s : null;
      }, `attack event in room ${g.label}`);
      expect(victimState.players[victim.id]?.alive).toBe(false);

      for (const p of g.players.slice(1)) {
        const s = await waitFor(() => {
          const v = p.room!.getView().state;
          return v && v.meta.status === 'day' ? v : null;
        }, `day in room ${g.label}`);
        expect(s.players[p.id]?.alive).toBe(true);
        expect(Object.keys(s.events)).toEqual([]);
      }
    }

    // Every room lost exactly its own victim, and nobody else.
    for (const g of games) {
      const players = g.host.room!.getView().state!.players;
      const dead = Object.keys(players).filter((id) => players[id]?.alive === false);
      expect(dead).toEqual([g.players[0]!.id]);
    }
  }, 120_000);

  it('refuses cross-room reads and writes', async () => {
    const [a, b] = games as [Game, Game, Game];
    const intruder = a.players[1]!;
    const target = b.players[1]!.id;
    await expectDenied('a room A player reading room B cards', () => intruder.backend.read(`rooms/${b.code}/cards/${target}`));
    await expectDenied('a room A player reading room B night', () => intruder.backend.read(`rooms/${b.code}/night`));
    await expectDenied('a room A player joining room B after the deal', () =>
      intruder.backend.update({
        [`rooms/${b.code}/players/${intruder.id}`]: { name: 'Sneak', ready: false, connected: true, alive: true },
      }),
    );
    await expectDenied('room A host writing room B meta', () =>
      a.host.backend.update({ [`rooms/${b.code}/meta/status`]: 'over' }),
    );
    await expectDenied('room A host reading room B cards', () => a.host.backend.read(`rooms/${b.code}/cards`));
    await expectDenied('room A host deleting room B', () => a.host.backend.remove(`rooms/${b.code}`));
    // Room B is untouched.
    expect(((await b.host.backend.read(`rooms/${b.code}/meta`)) as { status?: unknown }).status).toBe('day');
  }, 60_000);
});
