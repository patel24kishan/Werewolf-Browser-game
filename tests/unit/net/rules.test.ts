/**
 * Structural checks on `database.rules.json`. These only read the file; they do
 * not evaluate the rules. Behaviour is verified against a real project by
 * `npm run test:live` (there is no emulator here: it needs Java).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEALT_ROLE_IDS, MAX_PLAYERS, MIN_PLAYERS, NAME_MAX_LENGTH, SPECIAL_ROLE_IDS } from '@/game';
import { ALPHABET, ROOM_SECTIONS } from '@/net';
import { META_FIELDS } from '@/net/paths';

type RuleNode = { [key: string]: RuleNode | string | boolean };

const RULES_PATH = fileURLToPath(new URL('../../../database.rules.json', import.meta.url));
const file = JSON.parse(readFileSync(RULES_PATH, 'utf8')) as { rules: RuleNode };
const root = file.rules;

const HOST = "auth.uid === root.child('rooms/' + $code + '/meta/hostId').val()";

function node(...keys: string[]): RuleNode {
  let current: RuleNode = root;
  for (const key of keys) {
    const next = current[key];
    if (typeof next !== 'object' || next === null) throw new Error(`No rule node at ${keys.join('/')}`);
    current = next;
  }
  return current;
}

function rule(n: RuleNode, kind: '.read' | '.write' | '.validate'): string | boolean | undefined {
  return n[kind] as string | boolean | undefined;
}

/** Every rule expression in the tree, with its location. */
function allRules(n: RuleNode = root, at: string[] = []): Array<{ at: string; kind: string; expr: string | boolean }> {
  const out: Array<{ at: string; kind: string; expr: string | boolean }> = [];
  for (const [key, value] of Object.entries(n)) {
    if (key.startsWith('.')) out.push({ at: at.join('/'), kind: key, expr: value as string | boolean });
    else if (typeof value === 'object' && value !== null) out.push(...allRules(value, [...at, key]));
  }
  return out;
}

const room = node('rooms', '$code');

describe('database.rules.json', () => {
  it('has no read or write rule at the root or on /rooms', () => {
    for (const kind of ['.read', '.write'] as const) {
      expect(rule(root, kind)).toBeUndefined();
      expect(rule(node('rooms'), kind)).toBeUndefined();
    }
    expect(Object.keys(root)).toEqual(['rooms']);
    expect(Object.keys(node('rooms'))).toEqual(['$code']);
  });

  it('never grants read on a whole room', () => {
    expect(rule(room, '.read')).toBeUndefined();
  });

  it('never contains a literal true read or write', () => {
    for (const r of allRules()) {
      if (r.kind === '.read' || r.kind === '.write') {
        expect(typeof r.expr, `${r.at} ${r.kind}`).toBe('string');
        expect(r.expr as string, `${r.at} ${r.kind}`).toContain('auth != null');
      }
    }
  });

  it('lets only the host write a whole room, judged on existing data', () => {
    expect(rule(room, '.write')).toBe(`auth != null && ${HOST}`);
    expect(rule(room, '.write')).not.toContain('newData');
  });

  it('validates the room code against the room-code alphabet and length', () => {
    const v = rule(room, '.validate') as string;
    expect(v).toContain(`$code.matches(/^[${ALPHABET}]+$/)`);
    expect(v).toContain('$code.length === 4');
    expect(v).toContain("newData.hasChild('meta')");
  });

  it('knows exactly the room sections and rejects others', () => {
    const keys = Object.keys(room).filter((k) => !k.startsWith('.'));
    expect(keys.filter((k) => k !== '$other').sort()).toEqual([...ROOM_SECTIONS].sort());
    expect(rule(node('rooms', '$code', '$other'), '.validate')).toBe(false);
  });

  it('lets anyone signed in create meta only if absent, as its host, in the lobby', () => {
    const meta = node('rooms', '$code', 'meta');
    expect(rule(meta, '.read')).toBe('auth != null');
    const w = rule(meta, '.write') as string;
    expect(w).toContain('!data.exists()');
    expect(w).toContain("newData.child('hostId').val() === auth.uid");
    expect(w).toContain("newData.child('status').val() === 'lobby'");
  });

  it('validates every meta field and nothing else', () => {
    const meta = node('rooms', '$code', 'meta');
    const fields = Object.keys(meta).filter((k) => !k.startsWith('.') && k !== '$other');
    expect(fields.sort()).toEqual([...META_FIELDS].sort());
    expect(rule(meta, '.validate')).toBe(
      `newData.hasChildren([${META_FIELDS.map((f) => `'${f}'`).join(', ')}])`,
    );
    expect(rule(node('rooms', '$code', 'meta', '$other'), '.validate')).toBe(false);
    expect(rule(node('rooms', '$code', 'meta', 'sheriffOn'), '.validate')).toBe('newData.isBoolean()');
    expect(rule(node('rooms', '$code', 'meta', 'createdAt'), '.validate')).toBe('newData.isNumber()');
    const status = rule(node('rooms', '$code', 'meta', 'status'), '.validate') as string;
    for (const s of ['lobby', 'dealt', 'night', 'day', 'over']) expect(status).toContain(`'${s}'`);
    const mode = rule(node('rooms', '$code', 'meta', 'hostMode'), '.validate') as string;
    expect(mode).toContain("'moderating'");
    expect(mode).toContain("'playing'");
  });

  it('reads night and spares only as the host', () => {
    for (const section of ['night', 'spares']) {
      const n = node('rooms', '$code', section);
      expect(rule(n, '.read')).toBe(`auth != null && ${HOST}`);
      expect(rule(n, '.write')).toBeUndefined(); // only the room-level host write
      // No child grants a read either.
      for (const r of allRules(n)) if (r.kind === '.read') expect(r.at).toBe('');
    }
  });

  it('reads cards/$pid and events/$pid only as that player or the host; whole sections as the host', () => {
    for (const section of ['cards', 'events']) {
      expect(rule(node('rooms', '$code', section), '.read')).toBe(`auth != null && ${HOST}`);
      expect(rule(node('rooms', '$code', section, '$pid'), '.read')).toBe(
        `auth != null && (auth.uid === $pid || ${HOST})`,
      );
      for (const r of allRules(node('rooms', '$code', section))) expect(r.kind).not.toBe('.write');
    }
  });

  it('restricts card roles to the dealt role ids and events to numeric killedAt', () => {
    const role = rule(node('rooms', '$code', 'cards', '$pid', 'role'), '.validate') as string;
    const listed = [...role.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...DEALT_ROLE_IDS].sort());
    const spare = rule(node('rooms', '$code', 'spares', '$i'), '.validate') as string;
    expect([...spare.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort()).toEqual([...DEALT_ROLE_IDS].sort());
    expect(rule(node('rooms', '$code', 'events', '$pid', 'killedAt'), '.validate')).toBe('newData.isNumber()');
    expect(rule(node('rooms', '$code', 'cards', '$pid', '$other'), '.validate')).toBe(false);
    expect(rule(node('rooms', '$code', 'events', '$pid', '$other'), '.validate')).toBe(false);
  });

  it('matches the deck limits and special roles in the game data', () => {
    const count = rule(node('rooms', '$code', 'deck', 'playerCount'), '.validate') as string;
    expect(count).toContain(`>= ${MIN_PLAYERS}`);
    expect(count).toContain(`<= ${MAX_PLAYERS}`);
    const special = rule(node('rooms', '$code', 'deck', 'specialRoles', '$i'), '.validate') as string;
    expect([...special.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort()).toEqual([...SPECIAL_ROLE_IDS].sort());
  });

  it('lets a player write only their own record, and create it only in the lobby', () => {
    const pid = node('rooms', '$code', 'players', '$pid');
    const w = rule(pid, '.write') as string;
    expect(w).toContain('auth.uid === $pid');
    expect(w).toContain('newData.exists()'); // a player cannot delete their record
    expect(w).toContain("(data.exists() || root.child('rooms/' + $code + '/meta/status').val() === 'lobby')");
    const v = rule(pid, '.validate') as string;
    expect(v).toContain("newData.hasChildren(['name', 'ready', 'connected', 'alive'])");
    expect(v).toContain("newData.child('alive').val() === true");
    expect(v).toContain("newData.child('connected').val() === true");
    expect(rule(node('rooms', '$code', 'players', '$pid', '$other'), '.validate')).toBe(false);
  });

  it('blocks a non-host from changing alive (no self-resurrection)', () => {
    const alive = rule(node('rooms', '$code', 'players', '$pid', 'alive'), '.validate') as string;
    expect(alive).toBe(
      `newData.isBoolean() && ((auth != null && ${HOST}) || data.val() === newData.val() || (!data.exists() && newData.val() === true))`,
    );
  });

  it('allows a player name of up to 12 code points (24 UTF-16 units)', () => {
    const name = rule(node('rooms', '$code', 'players', '$pid', 'name'), '.validate') as string;
    expect(name).toContain('newData.val().length >= 1');
    expect(name).toContain(`newData.val().length <= ${NAME_MAX_LENGTH * 2}`);
  });

  it('only checks the host against existing data (root), never newData', () => {
    for (const r of allRules()) {
      if (typeof r.expr !== 'string') continue;
      expect(r.expr).not.toMatch(/newData[^&|]*meta\/hostId/);
    }
  });

  it('validates every keyed id', () => {
    for (const path of [
      ['players', '$pid'],
      ['cards', '$pid'],
      ['events', '$pid'],
      ['night', 'killed', '$pid'],
    ]) {
      expect(rule(node('rooms', '$code', ...path), '.validate') as string).toContain(
        '$pid.length <= 128 && $pid.matches(/^[A-Za-z0-9_-]+$/)',
      );
    }
  });
});
