/**
 * Types for the Werewolf Companion rules core.
 *
 * The room state mirrors the database layout in
 * `design/companion-architecture.md` ("Data layout"), one field per path under
 * `/rooms/{code}/`. Plain data only, so it ports to C# records/dictionaries.
 */

// ---------------------------------------------------------------------------
// Roles and rules data
// ---------------------------------------------------------------------------

/** Every role id that appears in `data/roles.json`. */
export type RoleId =
  | 'werewolf'
  | 'villager'
  | 'seer'
  | 'witch'
  | 'hunter'
  | 'cupid'
  | 'little-girl'
  | 'thief'
  | 'sheriff';

/** Roles that can be in the deck. The Sheriff is a title won by election, never dealt. */
export type DealtRoleId = Exclude<RoleId, 'sheriff'>;

/** Optional roles the host can add; each replaces one Simple Villager. */
export type SpecialRoleId = 'witch' | 'hunter' | 'cupid' | 'little-girl' | 'thief';

/** Which side a role starts on. `none` is used only by the Sheriff title. */
export type Team = 'village' | 'wolves' | 'none';

/** One entry of `data/roles.json`. */
export interface RoleInfo {
  /** Display name, e.g. "Little Girl". */
  readonly name: string;
  /** One plain sentence describing the power. */
  readonly power: string;
  /** Art file name, served from `/cards/` (e.g. "seer.svg"). */
  readonly art: string;
  /** Starting side. */
  readonly team: Team;
  /** True if the card can be dealt. False only for the Sheriff. */
  readonly dealt: boolean;
  /** True for optional roles that replace a Simple Villager. */
  readonly special: boolean;
}

/** One row of `data/card-mix.json`: the base deck for a player count. */
export interface CardMixRow {
  readonly werewolves: number;
  readonly seer: number;
  readonly villagers: number;
}

// ---------------------------------------------------------------------------
// Room state (mirrors /rooms/{code}/...)
// ---------------------------------------------------------------------------

/** A guest id (Firebase Anonymous Auth uid). Must pass `isSafeId`. */
export type PlayerId = string;

/** Whether the host runs the dashboard (`moderating`) or is dealt a card (`playing`). */
export type HostMode = 'moderating' | 'playing';

/** Room lifecycle: lobby → dealt → night ⇄ day → over → lobby. */
export type RoomStatus = 'lobby' | 'dealt' | 'night' | 'day' | 'over';

/** `/rooms/{code}/meta` */
export interface RoomMeta {
  readonly hostId: PlayerId;
  readonly hostMode: HostMode;
  readonly status: RoomStatus;
  readonly sheriffOn: boolean;
  /** Milliseconds since the epoch, supplied by the caller (never read from a clock here). */
  readonly createdAt: number;
}

/**
 * `/rooms/{code}/deck`: the host's deck configuration. The architecture doc shows
 * the deck as role counts; those counts are derived with
 * `countRoles(buildDeck(...).deck)` so only the choice itself is stored.
 */
export interface DeckConfig {
  readonly playerCount: number;
  /** Chosen special roles, each at most once, kept in canonical order. */
  readonly specialRoles: readonly SpecialRoleId[];
}

/** `/rooms/{code}/players/{id}` */
export interface PlayerRecord {
  readonly name: string;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly alive: boolean;
}

/** `/rooms/{code}/cards/{id}` (private: that player and the host). */
export interface CardRecord {
  readonly role: DealtRoleId;
}

/** `/rooms/{code}/night` */
export interface NightState {
  /** Set of players marked killed this night: `{ [id]: true }`. */
  readonly killed: Readonly<Record<PlayerId, true>>;
  /** True once the host has confirmed the kills. */
  readonly locked: boolean;
}

/** `/rooms/{code}/events/{id}`: the victim's phone listens here. */
export interface AttackEvent {
  readonly killedAt: number;
}

/** The whole room, one field per database path. */
export interface RoomState {
  readonly meta: RoomMeta;
  readonly deck: DeckConfig;
  readonly players: Readonly<Record<PlayerId, PlayerRecord>>;
  readonly cards: Readonly<Record<PlayerId, CardRecord>>;
  /**
   * ADDITION to the documented layout: `/rooms/{code}/spares`, the two leftover
   * cards when the Thief is in play (empty otherwise). Host-only read and write;
   * feature 4's security rules must cover it like `cards`.
   */
  readonly spares: readonly DealtRoleId[];
  /** `/rooms/{code}/sheriff`: the Sheriff's id, or null when there is none. */
  readonly sheriff: PlayerId | null;
  readonly night: NightState;
  readonly events: Readonly<Record<PlayerId, AttackEvent>>;
}

// ---------------------------------------------------------------------------
// Errors and results
// ---------------------------------------------------------------------------

/** Machine-readable reason a call or action was rejected. */
export type GameErrorCode =
  | 'invalid-action'
  | 'unknown-action'
  | 'invalid-id'
  | 'invalid-state'
  | 'invalid-context'
  | 'not-host'
  | 'wrong-status'
  | 'invalid-name'
  | 'name-taken'
  | 'already-joined'
  | 'unknown-player'
  | 'room-full'
  | 'not-in-game'
  | 'player-dead'
  | 'sheriff-off'
  | 'night-locked'
  | 'night-not-locked'
  | 'start-rule-failed'
  | 'invalid-player-count'
  | 'invalid-role'
  | 'duplicate-role'
  | 'too-many-specials'
  | 'deck-size-mismatch'
  | 'duplicate-player';

/** A rejected call. Never thrown; always returned. */
export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
}

/** A failed result. */
export interface Failure {
  readonly ok: false;
  readonly error: GameError;
}

/** Result of `buildDeck`. */
export type BuildDeckResult = { readonly ok: true; readonly deck: DealtRoleId[] } | Failure;

/** Result of `deal`. */
export type DealResult =
  | {
      readonly ok: true;
      /** One card per player id. */
      readonly cards: Record<PlayerId, DealtRoleId>;
      /** The two leftover cards when the Thief is in the deck, else empty. */
      readonly spares: DealtRoleId[];
    }
  | Failure;

/** Result of `applyAction` and `newRoomState`. */
export type StateResult = { readonly ok: true; readonly state: RoomState } | Failure;

/** Result of `normalizeName`. */
export type NameResult = { readonly ok: true; readonly name: string } | Failure;

/** Outcome of the start rule (see `checkStartRule`). */
export interface StartCheck {
  /** True when the host may deal. */
  readonly ok: boolean;
  /** The chosen player count (`deck.playerCount`). */
  readonly required: number;
  /** How many players currently count toward the deal. */
  readonly joined: number;
  /** Counted players (never the host) who have not tapped Ready, sorted. */
  readonly notReady: readonly PlayerId[];
  /** True when the host is playing but has no player record (no name) yet. */
  readonly hostNeedsName: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Injected sources of randomness and time. */
export interface ActionContext {
  /** Returns a number in [0, 1). Used by `deal`. */
  readonly rng: () => number;
  /** Returns the current time in ms since the epoch. Used by `reveal`. */
  readonly now: () => number;
}

interface ActionBase {
  /** The guest id of whoever sent the action. */
  readonly actorId: PlayerId;
}

/** Add the actor to the lobby with a name. */
export interface JoinAction extends ActionBase { readonly type: 'join'; readonly name: string }
/** Change the actor's own name (lobby only). */
export interface SetNameAction extends ActionBase { readonly type: 'setName'; readonly name: string }
/** Set the actor's own Ready tick (lobby only). */
export interface SetReadyAction extends ActionBase { readonly type: 'setReady'; readonly ready: boolean }
/** Set the actor's own connected flag (any status). Addition: lets presence go through the reducer. */
export interface SetConnectedAction extends ActionBase {
  readonly type: 'setConnected';
  readonly connected: boolean;
}
/** Host removes a player record from the lobby. */
export interface RemovePlayerAction extends ActionBase {
  readonly type: 'removePlayer';
  readonly playerId: PlayerId;
}
/** Host switches between moderating and playing (lobby only). */
export interface SetHostModeAction extends ActionBase {
  readonly type: 'setHostMode';
  readonly hostMode: HostMode;
}
/** Host chooses player count, special roles and the Sheriff switch (lobby only). */
export interface ConfigureDeckAction extends ActionBase {
  readonly type: 'configureDeck';
  readonly playerCount: number;
  readonly specialRoles: readonly SpecialRoleId[];
  readonly sheriffOn: boolean;
}
/** Host shuffles and deals (lobby only, start rule must pass). */
export interface DealAction extends ActionBase { readonly type: 'deal' }
/** Host gives the Sheriff title to a living player (also used for succession). */
export interface AssignSheriffAction extends ActionBase {
  readonly type: 'assignSheriff';
  readonly playerId: PlayerId;
}
/** Host skips the Sheriff election (clears the title). */
export interface SkipSheriffAction extends ActionBase { readonly type: 'skipSheriff' }
/** Host starts a fresh, unlocked night. */
export interface StartNightAction extends ActionBase { readonly type: 'startNight' }
/** Host toggles a living player's Killed mark during an unlocked night. */
export interface ToggleKilledAction extends ActionBase {
  readonly type: 'toggleKilled';
  readonly playerId: PlayerId;
}
/** Host locks in the night's kills (the Confirm screen). */
export interface ConfirmKillsAction extends ActionBase { readonly type: 'confirmKills' }
/** Host unlocks the night again (Undo on the Confirm screen). */
export interface UndoConfirmAction extends ActionBase { readonly type: 'undoConfirm' }
/** Host reveals a locked night: victims die, events are written, status → day. */
export interface RevealAction extends ActionBase { readonly type: 'reveal' }
/** Host ends the game. */
export interface EndGameAction extends ActionBase { readonly type: 'endGame' }
/** Host picks who hosts the next game (or keeps hosting) and returns to the lobby. */
export interface ChooseNextHostAction extends ActionBase {
  readonly type: 'chooseNextHost';
  readonly newHostId: PlayerId;
}

/** Every action the reducer accepts. */
export type Action =
  | JoinAction
  | SetNameAction
  | SetReadyAction
  | SetConnectedAction
  | RemovePlayerAction
  | SetHostModeAction
  | ConfigureDeckAction
  | DealAction
  | AssignSheriffAction
  | SkipSheriffAction
  | StartNightAction
  | ToggleKilledAction
  | ConfirmKillsAction
  | UndoConfirmAction
  | RevealAction
  | EndGameAction
  | ChooseNextHostAction;

/** The `type` tag of an action. */
export type ActionType = Action['type'];
