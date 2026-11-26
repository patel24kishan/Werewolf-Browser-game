/**
 * Logic-level integration (Vitest, no browser): one host phone and five player
 * phones, each with its own MemoryBackend on one shared BroadcastChannel name,
 * play a full game through the room service. (Five players, not three: the card
 * mix starts at 5.)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoom, openRoom, type MemoryBackend, type Room, type RoomView } from '@/net';
import { RecordingBackend, TabPool, waitFor } from '../helpers/net';
import { seededRng } from '../unit/game/helpers';

const NOW = 1_700_000_000_000;
const PLAYER_IDS = ['asha', 'bo', 'cy', 'dee', 'eli'];

interface Phone {
  readonly id: string;
  backend: MemoryBackend;
  rec: RecordingBackend;
  room: Room;
}

let pool = new TabPool();
const openRooms: Room[] = [];
let tabCount = 0;
afterEach(async () => {
  for (const r of openRooms.splice(0)) r.close();
  await pool.closeAll();
  pool = new TabPool();
});

async function phone(id: string, code: string | null): Promise<Phone> {
  const backend = pool.open(`tab${++tabCount}-${id}`, { guestId: id });
  const rec = new RecordingBackend(backend);
  const guest = await rec.signIn();
  expect(guest).toBe(id);
  const roomCode = code ?? (await createRoom(rec, guest, { now: () => NOW, newCode: () => 'K7QX' }));
  const room = openRoom(rec, roomCode, guest, { rng: seededRng(11), now: () => NOW });
  openRooms.push(room);
  await room.whenLoaded();
  return { id, backend, rec, room };
}

function until(p: Phone, pred: (v: RoomView) => boolean, label: string): Promise<RoomView> {
  return waitFor(() => (pred(p.room.getView()) ? p.room.getView() : null), 3000, `${p.id}: ${label}`);
}

async function ok(p: Phone, action: Parameters<Room['dispatch']>[0]) {
  const r = await p.room.dispatch(action);
  if (!r.ok) throw new Error(`${p.id} ${action.type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}

describe('a full game across six phones', () => {
  it('creates, joins, deals privately, reveals to the victim only and hands over hosting', async () => {
    // Create the room and join.
    const host = await phone('host', null);
    expect(host.room.getView()).toMatchObject({ exists: true, isHost: true, loaded: true });
    const players: Phone[] = [];
    for (const id of PLAYER_IDS) {
      const p = await phone(id, 'K7QX');
      expect(p.room.getView()).toMatchObject({ exists: true, isHost: false });
      await ok(p, { type: 'join', name: id.toUpperCase() });
      players.push(p);
    }
    const [asha, bo, cy, dee, eli] = players;

    // Configure the deck and ready up.
    await ok(host, { type: 'configureDeck', playerCount: 5, specialRoles: ['witch'], sheriffOn: true });
    for (const p of players) await ok(p, { type: 'setReady', ready: true });
    await until(host, (v) => PLAYER_IDS.every((id) => v.state?.players[id]?.ready && v.state.players[id].connected), 'all ready');

    // Deal: one update; each player sees only its own card.
    const updatesBefore = host.rec.updates.length;
    const dealt = await ok(host, { type: 'deal' });
    expect(host.rec.updates.length - updatesBefore).toBe(1);
    expect(Object.keys(dealt.cards).sort()).toEqual([...PLAYER_IDS].sort());
    for (const p of players) {
      const view = await until(p, (v) => v.state?.meta.status === 'dealt' && v.state.cards[p.id] !== undefined, 'card');
      expect(view.state!.cards).toEqual({ [p.id]: dealt.cards[p.id] });
    }
    await until(host, (v) => Object.keys(v.state?.cards ?? {}).length === 5, 'host sees all cards');

    // A refreshed phone (same guest id, new tab instance) gets the same card back.
    openRooms.splice(openRooms.indexOf(eli.room), 1);
    eli.room.close();
    await eli.backend.close();
    await until(host, (v) => v.state?.players.eli?.connected === false, 'eli disconnected');
    const eli2 = await phone('eli', 'K7QX');
    await until(eli2, (v) => v.state?.cards.eli?.role === dealt.cards.eli.role, 'same card after refresh');
    await until(host, (v) => v.state?.players.eli?.connected === true, 'eli reconnected');
    players[4] = eli2;

    // Night: toggle → confirm → undo → confirm (different victim) → reveal.
    await ok(host, { type: 'startNight' });
    await ok(host, { type: 'toggleKilled', playerId: 'bo' });
    await ok(host, { type: 'confirmKills' });
    await ok(host, { type: 'undoConfirm' });
    await ok(host, { type: 'toggleKilled', playerId: 'bo' });
    await ok(host, { type: 'toggleKilled', playerId: 'cy' });
    await ok(host, { type: 'confirmKills' });
    expect(host.room.getView().state?.night).toEqual({ killed: { cy: true }, locked: true });
    expect(await host.backend.read('rooms/K7QX/night')).toEqual({ killed: { cy: true }, locked: true });

    const revealBefore = host.rec.updates.length;
    await ok(host, { type: 'reveal' });
    expect(host.rec.updates.length - revealBefore).toBe(1);
    const victim = await until(cy, (v) => v.state?.events.cy !== undefined, 'victim event');
    expect(victim.state!.events).toEqual({ cy: { killedAt: NOW } });
    expect(victim.state!.players.cy.alive).toBe(false);
    for (const p of [asha, bo, dee, players[4]]) {
      const v = await until(p, (x) => x.state?.meta.status === 'day' && x.state.players.cy?.alive === false, 'day');
      expect(v.state!.events).toEqual({});
    }

    // Nobody but the host ever read or listened to night, spares or other phones' private paths.
    for (const p of [...players, cy, eli]) {
      for (const path of p.rec.observedPaths) {
        expect(path).not.toMatch(/\/(night|spares)(\/|$)/);
        expect(path).not.toBe('rooms/K7QX/cards');
        expect(path).not.toBe('rooms/K7QX/events');
        const own = path.match(/\/(cards|events)\/([^/]+)$/);
        if (own) expect(own[2]).toBe(p.id);
      }
    }
    expect(host.rec.observedPaths).toContain('rooms/K7QX/night');

    // Game over and handover.
    await ok(host, { type: 'endGame' });
    await ok(host, { type: 'chooseNextHost', newHostId: 'asha' });
    const ashaView = await until(asha, (v) => v.isHost && v.loaded && v.state?.meta.status === 'lobby', 'asha hosts');
    expect(ashaView.state!.cards).toEqual({});
    expect(asha.rec.subscribed).toEqual(
      expect.arrayContaining(['rooms/K7QX/cards', 'rooms/K7QX/spares', 'rooms/K7QX/night', 'rooms/K7QX/events']),
    );
    const oldHostView = await until(host, (v) => !v.isHost && v.loaded && v.state?.meta.hostId === 'asha', 'old host is a player');
    expect(oldHostView.state!.night).toEqual({ killed: {}, locked: false });

    // The new host runs the next setup; the old host joins as a player.
    await ok(asha, { type: 'configureDeck', playerCount: 5, specialRoles: [], sheriffOn: false });
    await ok(host, { type: 'join', name: 'OldHost' });
    await until(asha, (v) => v.state?.players.host?.name === 'OldHost' && v.state.meta.sheriffOn === false, 'old host joined');
    expect(await host.room.dispatch({ type: 'deal' })).toMatchObject({ ok: false, error: { code: 'not-host' } });
  });
});
