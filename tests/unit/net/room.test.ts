import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryBackend, createRoom, openRoom, type Room, type RoomView } from '@/net';
import { RecordingBackend, idGen, waitFor } from '../../helpers/net';
import { seededRng } from '../game/helpers';

const NOW = 1_700_000_000_000;
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'];

let db: MemoryBackend;
let rooms: Room[];

beforeEach(() => {
  db = new MemoryBackend({ createChannel: () => null, newId: idGen('db'), storage: null });
  rooms = [];
});
afterEach(async () => {
  for (const r of rooms) r.close();
  await db.close();
});

function client(id: string): { rec: RecordingBackend; room: (code: string) => Room } {
  const rec = new RecordingBackend(db);
  return {
    rec,
    room: (code) => {
      const room = openRoom(rec, code, id, { rng: seededRng(7), now: () => NOW });
      rooms.push(room);
      return room;
    },
  };
}

function until(room: Room, pred: (v: RoomView) => boolean, label = 'view'): Promise<RoomView> {
  return waitFor(() => (pred(room.getView()) ? room.getView() : null), 2000, label);
}

async function ok(room: Room, action: Parameters<Room['dispatch']>[0]) {
  const r = await room.dispatch(action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}

/** Host + 5 ready players in a lobby with the Thief (so spares exist). */
async function readyLobby() {
  const host = client('host');
  const code = await createRoom(host.rec, 'host', { now: () => NOW, newCode: () => 'K7QX' });
  const hostRoom = host.room(code);
  await hostRoom.whenLoaded();
  await ok(hostRoom, { type: 'configureDeck', playerCount: 5, specialRoles: ['thief'], sheriffOn: true });
  const players = new Map<string, { rec: RecordingBackend; room: Room }>();
  for (const id of PLAYERS) {
    const c = client(id);
    const room = c.room(code);
    await room.whenLoaded();
    await ok(room, { type: 'join', name: `Name-${id}` });
    await ok(room, { type: 'setReady', ready: true });
    players.set(id, { rec: c.rec, room });
  }
  await until(hostRoom, (v) => PLAYERS.every((id) => v.state?.players[id]?.ready === true), 'all ready');
  return { code, host, hostRoom, players };
}

describe('room service', () => {
  it('validates the code and id when opening', () => {
    expect(() => openRoom(db, 'k7qx', 'me')).toThrow(/room code/);
    expect(() => openRoom(db, 'K7QX', '__proto__')).toThrow(/safe id/);
  });

  it('reports a missing room and refuses to dispatch to it', async () => {
    const room = client('p1').room('ZZZZ');
    const view = await room.whenLoaded();
    expect(view).toMatchObject({ loaded: true, exists: false, state: null });
    expect(await room.dispatch({ type: 'join', name: 'A' })).toMatchObject({ ok: false, error: { code: 'room-missing' } });
  });

  it('writes a deal as one update with every card, the spares and the status', async () => {
    const { hostRoom, host } = await readyLobby();
    const before = host.rec.updates.length;
    const state = await ok(hostRoom, { type: 'deal' });
    expect(host.rec.updates.length - before).toBe(1);
    const writes = host.rec.updates[host.rec.updates.length - 1];
    expect(Object.keys(writes).sort()).toEqual([
      ...PLAYERS.map((id) => `rooms/K7QX/cards/${id}`),
      'rooms/K7QX/meta/status',
      'rooms/K7QX/spares',
    ]);
    expect(await db.read('rooms/K7QX/meta/status')).toBe('dealt');
    expect(hostRoom.getView().state?.cards).toEqual(state.cards);
  });

  it('writes a reveal as one update, and the night never reaches players', async () => {
    const { hostRoom, host, players } = await readyLobby();
    await ok(hostRoom, { type: 'deal' });
    await ok(hostRoom, { type: 'startNight' });
    await ok(hostRoom, { type: 'toggleKilled', playerId: 'p2' });
    await ok(hostRoom, { type: 'confirmKills' });
    expect(hostRoom.getView().state?.night).toEqual({ killed: { p2: true }, locked: true });
    for (const { room } of players.values()) expect(room.getView().state?.night).toEqual({ killed: {}, locked: false });

    const before = host.rec.updates.length;
    await ok(hostRoom, { type: 'reveal' });
    expect(host.rec.updates.length - before).toBe(1);
    expect(host.rec.updates[host.rec.updates.length - 1]).toEqual({
      'rooms/K7QX/meta/status': 'day',
      'rooms/K7QX/players/p2/alive': false,
      'rooms/K7QX/events/p2': { killedAt: NOW },
    });
    const victim = players.get('p2')!.room;
    await until(victim, (v) => v.state?.events.p2?.killedAt === NOW, 'victim event');
    await until(players.get('p1')!.room, (v) => v.state?.meta.status === 'day');
    expect(players.get('p1')!.room.getView().state?.events).toEqual({});
  });

  it('lets a player see only its own card, never night, spares or other cards', async () => {
    const { hostRoom, players } = await readyLobby();
    const dealt = await ok(hostRoom, { type: 'deal' });
    for (const [id, { room, rec }] of players) {
      const view = await until(room, (v) => v.state?.meta.status === 'dealt' && v.state.cards[id] !== undefined);
      expect(view.isHost).toBe(false);
      expect(view.state!.cards).toEqual({ [id]: dealt.cards[id] });
      expect(view.state!.spares).toEqual([]);
      const allowed = ['meta', 'deck', 'players', 'sheriff', `cards/${id}`, `events/${id}`].map((s) => `rooms/K7QX/${s}`);
      expect([...new Set(rec.observedPaths)].sort()).toEqual(allowed.sort());
    }
  });

  it('lets a player write only its own record', async () => {
    const { players } = await readyLobby();
    const { room, rec } = players.get('p3')!;
    const before = rec.updates.length;
    await ok(room, { type: 'setReady', ready: false });
    expect(rec.updates.slice(before)).toEqual([{ 'rooms/K7QX/players/p3/ready': false }]);

    for (const action of [{ type: 'deal' }, { type: 'removePlayer', playerId: 'p1' }] as const) {
      expect(await room.dispatch(action)).toMatchObject({ ok: false, error: { code: 'not-host' } });
    }
    // actorId is always myId, whatever the caller passes.
    const spoof = { type: 'deal', actorId: 'host' } as unknown as Parameters<Room['dispatch']>[0];
    expect(await room.dispatch(spoof)).toMatchObject({ ok: false, error: { code: 'not-host' } });
    expect(rec.updates.length).toBe(before + 1);
  });

  it('moves the host listeners to the new host on handover', async () => {
    const { hostRoom, host, players } = await readyLobby();
    await ok(hostRoom, { type: 'deal' });
    await ok(hostRoom, { type: 'endGame' });
    await ok(hostRoom, { type: 'chooseNextHost', newHostId: 'p1' });

    const newHost = players.get('p1')!;
    const view = await until(newHost.room, (v) => v.isHost && v.loaded, 'p1 is host');
    expect(view.state?.meta).toMatchObject({ hostId: 'p1', status: 'lobby' });
    expect(newHost.rec.subscribed).toEqual(expect.arrayContaining(['rooms/K7QX/night', 'rooms/K7QX/spares', 'rooms/K7QX/cards', 'rooms/K7QX/events']));

    const oldView = await until(hostRoom, (v) => !v.isHost && v.loaded, 'old host is a player');
    expect(oldView.state?.meta.hostId).toBe('p1');
    const after = host.rec.subscribed.slice(host.rec.subscribed.lastIndexOf('rooms/K7QX/events') + 1);
    expect(after).toEqual(expect.arrayContaining(['rooms/K7QX/cards/host', 'rooms/K7QX/events/host']));

    // The new host can run the next game's setup; the old host no longer can.
    await ok(newHost.room, { type: 'configureDeck', playerCount: 5, specialRoles: [], sheriffOn: false });
    expect(await hostRoom.dispatch({ type: 'setHostMode', hostMode: 'playing' })).toMatchObject({ ok: false, error: { code: 'not-host' } });
  });

  it('survives malformed data without throwing', async () => {
    const { hostRoom, players } = await readyLobby();
    await db.update({
      'rooms/K7QX/players/p1': 'not-an-object',
      'rooms/K7QX/players/ghost': { connected: false },
      'rooms/K7QX/cards/p2': { role: 'emperor' },
      'rooms/K7QX/night': 42,
      'rooms/K7QX/deck': { playerCount: 'many' },
    });
    const view = await until(hostRoom, (v) => v.state?.players.p1 === undefined, 'garbage applied');
    expect(view.state?.players.ghost).toBeUndefined();
    expect(view.state?.cards).toEqual({});
    expect(view.state?.night).toEqual({ killed: {}, locked: false });
    expect(view.state?.deck.playerCount).toBe(8);

    await db.update({ 'rooms/K7QX/meta': { hostId: 7 } });
    const gone = await until(players.get('p2')!.room, (v) => !v.exists, 'meta broken');
    expect(gone.state).toBeNull();
    expect(await players.get('p2')!.room.dispatch({ type: 'setReady', ready: true })).toMatchObject({ ok: false, error: { code: 'room-missing' } });
  });

  it('keeps presence: queues connected=false and restores true', async () => {
    const { players } = await readyLobby();
    const { rec } = players.get('p4')!;
    await waitFor(() => rec.disconnects.length > 0, 2000, 'onDisconnect');
    expect(rec.disconnects[0]).toEqual({ path: 'rooms/K7QX/players/p4/connected', value: false });
    await db.update({ 'rooms/K7QX/players/p4/connected': false }); // e.g. an old tab's disconnect firing late
    await waitFor(async () => (await db.read('rooms/K7QX/players/p4/connected')) === true, 2000, 'reconnect');
  });

  it('lets only the host delete the room', async () => {
    const { hostRoom, players } = await readyLobby();
    expect(await players.get('p1')!.room.deleteRoom()).toMatchObject({ ok: false, error: { code: 'not-host' } });
    expect((await hostRoom.deleteRoom()).ok).toBe(true);
    expect(await db.read('rooms/K7QX')).toBeNull();
    await until(players.get('p1')!.room, (v) => !v.exists, 'room gone');
  });

  it('runs dispatches in order and returns rules errors without writing', async () => {
    const { hostRoom, host } = await readyLobby();
    const before = host.rec.updates.length;
    const results = await Promise.all([
      hostRoom.dispatch({ type: 'deal' }),
      hostRoom.dispatch({ type: 'startNight' }),
      hostRoom.dispatch({ type: 'deal' }),
    ]);
    expect(results.map((r) => (r.ok ? 'ok' : r.error.code))).toEqual(['ok', 'ok', 'wrong-status']);
    expect(host.rec.updates.length - before).toBe(2);
  });
});
