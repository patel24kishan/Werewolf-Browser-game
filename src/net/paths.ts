/**
 * The only place room paths are built. Every builder validates the room code
 * against `ROOM_CODE_PATTERN` and every id with `isSafeId`, so no unchecked
 * string ever becomes part of a database path.
 *
 * Layout (`design/companion-architecture.md`, "Data layout", plus `spares`):
 *
 * ```
 * rooms/{code}/meta            host writes; everyone in the room reads
 * rooms/{code}/deck            host writes; everyone reads
 * rooms/{code}/players/{id}    that player writes name/ready/connected; host writes all
 * rooms/{code}/cards/{id}      { role }: that player and the host read; host writes
 * rooms/{code}/spares          host only (Thief leftovers)
 * rooms/{code}/sheriff         host writes; everyone reads
 * rooms/{code}/night           host only (orchestrator decision: never readable by players)
 * rooms/{code}/events/{id}     that player reads; host writes
 * ```
 */
import { isSafeId } from '@/game';
import { BackendError } from './errors';
import { ROOM_CODE_PATTERN } from './roomCode';

/** Top-level sections of a room. */
export const ROOM_SECTIONS = ['meta', 'deck', 'players', 'cards', 'spares', 'sheriff', 'night', 'events'] as const;
/** One top-level section of a room. */
export type RoomSection = (typeof ROOM_SECTIONS)[number];

/** Sections only the host may ever read (players never subscribe to them). */
export const HOST_ONLY_SECTIONS: readonly RoomSection[] = ['spares', 'night'];

/** Sections keyed by player id. */
export type PerPlayerSection = 'players' | 'cards' | 'events';

/** Fields of `players/{id}`. */
export const PLAYER_FIELDS = ['name', 'ready', 'connected', 'alive'] as const;
/** One field of `players/{id}`. */
export type PlayerField = (typeof PLAYER_FIELDS)[number];

/** Fields of `meta`. */
export const META_FIELDS = ['hostId', 'hostMode', 'status', 'sheriffOn', 'createdAt'] as const;
/** One field of `meta`. */
export type MetaField = (typeof META_FIELDS)[number];

function checkCode(code: string): void {
  if (typeof code !== 'string' || !ROOM_CODE_PATTERN.test(code)) {
    throw new BackendError('invalid-code', `"${String(code)}" is not a valid room code.`);
  }
}

function checkId(id: string): void {
  if (!isSafeId(id)) throw new BackendError('invalid-path', 'Player ids must be safe ids.');
}

/** `rooms/{code}` */
export function roomRoot(code: string): string {
  checkCode(code);
  return `rooms/${code}`;
}

/** `rooms/{code}/{section}` */
export function sectionPath(code: string, section: RoomSection): string {
  if (!(ROOM_SECTIONS as readonly string[]).includes(section)) {
    throw new BackendError('invalid-path', `Unknown room section "${String(section)}".`);
  }
  return `${roomRoot(code)}/${section}`;
}

/** `rooms/{code}/meta/{field}` */
export function metaFieldPath(code: string, field: MetaField): string {
  if (!(META_FIELDS as readonly string[]).includes(field)) {
    throw new BackendError('invalid-path', `Unknown meta field "${String(field)}".`);
  }
  return `${sectionPath(code, 'meta')}/${field}`;
}

/** `rooms/{code}/{players|cards|events}/{id}` */
export function playerEntryPath(code: string, section: PerPlayerSection, id: string): string {
  if (section !== 'players' && section !== 'cards' && section !== 'events') {
    throw new BackendError('invalid-path', `"${String(section)}" is not keyed by player.`);
  }
  checkId(id);
  return `${sectionPath(code, section)}/${id}`;
}

/** `rooms/{code}/players/{id}/{field}` */
export function playerFieldPath(code: string, id: string, field: PlayerField): string {
  if (!(PLAYER_FIELDS as readonly string[]).includes(field)) {
    throw new BackendError('invalid-path', `Unknown player field "${String(field)}".`);
  }
  return `${playerEntryPath(code, 'players', id)}/${field}`;
}

/** `rooms/{code}/night/locked` */
export function nightLockedPath(code: string): string {
  return `${sectionPath(code, 'night')}/locked`;
}

/** `rooms/{code}/night/killed/{id}` */
export function nightKilledPath(code: string, id: string): string {
  checkId(id);
  return `${sectionPath(code, 'night')}/killed/${id}`;
}

/** True if `path` is `prefix` or lies below it. */
export function isWithin(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
