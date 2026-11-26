# Werewolf Companion: build plan

The only blueprint for the build. Run with `/builditnow`.

## Goal

Build the Werewolf Companion web app described in `design/companion-flow.md` and
`design/companion-architecture.md`. It's a mobile-browser app for Android and iPhone
that deals role cards to phones in the same room and gives the host a dashboard. The
host narrates out loud. The app has no chat, no timers and no in-app voting.

## Fixed decisions (do not change)

- **Stack:** Next.js (App Router) + React + TypeScript, `output: 'export'` (static
  export). Not Vite.
- **Back end:** Firebase Anonymous Auth + Realtime Database. Guests only; no login
  screen.
- **Folders:**
  - Code root: `src/`. Leave the existing `src/CLAUDE.md` and `src/.gitkeep` alone.
  - Unit tests: `tests/unit/`, with Vitest.
  - Integration tests: `tests/integration/`, with Playwright.
- **Ports to Unity later:**
  - Game logic lives in `src/game/` as plain TypeScript. It has no React, browser or
    Firebase imports.
  - Rules data is JSON in `src/game/data/`.
- **Data layout and security rules:** exactly as in `design/companion-architecture.md`:
  `/rooms/{code}/meta`, `deck`, `players/{id}`, `cards/{id}` (private), `sheriff`,
  `night`, `events/{id}`.
- **Join link:** `/join?code=XXXX`. Room codes use the alphabet from the architecture
  doc's `lib/roomCode.ts` snippet. Reuse that snippet, and the `createRoom` and
  `RoomQr` snippets, as the starting code.
- **Dealing:** the host's phone deals in v1, with one atomic multi-path update.
- **Visual design:** match the existing mockups, not a new style. Colours `#0f0c1d`
  (background), `#1a1530` (surface), `#f2c94c` (gold), `#f6ecd2` (text). Fonts: Cinzel
  for headings, Inter for body. Card art comes from `assets/2d assets/*.svg`, and the
  card back from `card-back.png`.
- **Pin versions:** pin exact Next.js, React, Firebase, Vitest and Playwright versions
  in `package.json`.

## Readings of the open questions (assumptions for this build)

| Open question | What this build does |
|---|---|
| Host is playing | The host gets a card like everyone else, and the dashboard is hidden. The host narrates from memory |
| Day-vote eliminations | Not in the app. The table handles them out loud |
| Other phones on Reveal | Unchanged. Only the victims' phones react |
| Player count | 5 to 18. 8+ follows the rulebook table; 5 to 7 uses the "proposed" small-lobby table in `design/rules/03-setup-and-card-mix.md` |

## Test backend

Every feature that talks to the database goes through one `RoomBackend` interface
(feature 3).
- `MemoryBackend` (in-memory, synced across tabs with BroadcastChannel) runs all unit
  and integration tests, so no test touches the real Firebase.
- `FirebaseBackend` (feature 4) runs in the real app. `NEXT_PUBLIC_BACKEND=memory`
  selects the memory backend for tests and local demos.
- In memory mode the guest ID is per tab (sessionStorage), so Playwright pages act as
  separate phones.

## Features, in order, with subagent assignment

| # | Feature | Frontend | Subagent |
|---|---|---|---|
| 1 | Project scaffold | no | Sonnet |
| 2 | Game rules core | no | Opus |
| 3 | Room backend interface + memory backend | no | Opus |
| 4 | Firebase backend + security rules | no | Opus |
| 5 | Start and join screens | yes | Sonnet |
| 6 | Host setup and lobby | yes | Sonnet |
| 7 | Deal and player card | yes | Sonnet |
| 8 | Host dashboard, Confirm, Reveal, attack | yes | Sonnet |
| 9 | Sheriff (optional) | yes | Sonnet |
| 10 | Game over and host handover | yes | Sonnet |
| 11 | Help guide | yes | Sonnet |

Integration tests from feature 2 on are written by an Opus subagent, as `/builditnow`
requires. Within a feature, the implementation and its test file may be split across
two parallel subagents only when they touch separate files.

### 1. Project scaffold
- Next.js + TypeScript app at the repo root, with `next.config` set to static export.
- Vitest config, plus Playwright config that starts the app with
  `NEXT_PUBLIC_BACKEND=memory`.
- Scripts: `npm test` (Vitest), `npm run test:integration` (Playwright), `npm run
  build`, `npm run lint`.
- `.env.local.example` lists the `NEXT_PUBLIC_FIREBASE_*` keys. `.gitignore` covers
  `.env.local`, `node_modules/`, `.next/` and `out/`.
- Card art is copied into `public/cards/` by a script, not by hand, so `assets/` stays
  the source.
- **Accept when:** `npm run build` produces `out/`, a sample Vitest test passes, and a
  sample Playwright test loads `/`.

### 2. Game rules core (`src/game/`)
- **Data files:**
  - `data/card-mix.json`: player count 5–18 → werewolves, seer and villagers, from
    `design/rules/03-setup-and-card-mix.md`.
  - `data/roles.json`: name, one-line power and art file for each role, from
    `design/rules/02-roles.md`.
- **Functions:**
  - `buildDeck(playerCount, specialRoles)`: each special role replaces a Villager, and
    the Thief adds 2 extra Villagers. The Sheriff is never in the deck.
  - `shuffle(deck, rng)` and `deal(playerIds, deck, rng)`. `rng` is injected so tests
    are deterministic. With the Thief, deal returns the 2 spare cards too.
- **Reducer `applyAction(state, action)`:**
  - Lobby actions: join, setName, setReady, removePlayer, setHostMode, configureDeck.
  - Game actions: deal, assignSheriff / skipSheriff, toggleKilled, confirmKills,
    undoConfirm, reveal, endGame, chooseNextHost.
- **Start rule:** the joined count equals the chosen count and everyone is Ready. A
  playing host counts as a player.
- **Dead players** can't be toggled again. A reveal marks them `alive: false`.
- **Accept when:** unit tests cover every table row, special-role replacement, Thief +2,
  the start rule, kill → confirm → undo → reveal, and dead players not being
  toggleable.

### 3. Room backend interface + memory backend (`src/net/`)
- **`RoomBackend` interface:**
  - `signIn()` returns a guest ID.
  - `claimRoom(code, meta)` is a transaction that fails if the code is taken.
  - `read`, `subscribe(path, cb)`, `update(multiPathObject)` (atomic), `remove(path)`,
    `onDisconnect(path, value)`.
- **`MemoryBackend`** implements the interface and syncs tabs through BroadcastChannel.
- **Room code and join link:** `roomCode.ts` (`newRoomCode`, `ROOM_CODE_PATTERN`,
  `joinUrl`) and `createRoom(hostId)`, from the architecture doc snippets. `createRoom`
  retries 5 times.
- **Room service (`src/net/room.ts`):** turns reducer actions into backend writes using
  the data layout. Two rules:
  - Each player listens only to its own `cards/{id}`.
  - Deal and reveal are single multi-path updates.
- **Accept when:** unit tests cover code format and alphabet, the taken-code retry,
  multi-path atomicity, and subscribe callbacks.

### 4. Firebase backend + security rules
- **`FirebaseBackend`** implements `RoomBackend` with the modular Firebase SDK:
  - Anonymous Auth, with the guest ID kept across refreshes.
  - `runTransaction` for claiming a code, `update` for multi-path writes,
    `onDisconnect` setting `connected: false`.
- **`database.rules.json`** follows the architecture doc's security table:
  - `meta` can be created only if it doesn't exist. `meta`, `deck`, `sheriff` and
    `night` can only be written by the host.
  - A player writes only their own `players/{id}` name and ready flag. The host can
    delete any player.
  - `cards/{id}` can be read by that player or the host, and written by the host.
  - `events/{id}` can be read by that player and written by the host.
- **Accept when:**
  - Unit tests pass with the Firebase SDK mocked.
  - Once `.env.local` exists, a manual smoke check creates a room and joins it from a
    second browser.
  - The rules are pasted into the Firebase console, and the build log notes the paste
    as a manual step.
  - If `.env.local` isn't there yet, the feature is marked "live check pending" and the
    build continues.

### 5. Start and join screens
- **Routes:** `/` (Start), `/join` (code, or straight to Name when `?code=` is valid),
  and the join lobby (Ready / tap again to undo).
- **Scan QR code:** opens the camera. It uses `BarcodeDetector`, with `jsQR` as the
  fallback, and accepts only our `/join` URL with a valid code. Anything else shows
  "That's not a game code".
- **Back buttons** go to the previous screen, except on Start.
- **Accept when:** screens match the mockups. A player can join a memory-backend room
  and appear in the host's lobby. Integration test: a host page plus 2 player pages
  join and ready up.

### 6. Host setup and lobby
- **Session created:** the code shown large, a QR code (`qrcode.react` `QRCodeSVG`,
  `level="M"`, white quiet zone), Share invite link, and the Moderating / Playing
  toggle on this first step.
- **Players & roles:** a count stepper with the rulebook hint, special-role tiles, and
  an Elect a Sheriff switch.
- **Review deck:** the cards and counts from `buildDeck`, with Edit / Looks good.
- **Host lobby:**
  - Joined and Ready counts, and remove-player.
  - Start stays disabled until the start rule passes.
  - The button label says who it's waiting for.
- **Accept when:** these screens match the mockups. The deck always equals the player
  count (+2 with the Thief), and Start obeys the start rule.

### 7. Deal and player card
- **Start deals:** one atomic write of every `cards/{id}`, and `status` becomes `dealt`.
- **On each phone:** the card arrives face down (card back). A tap flips it with a 3D
  flip animation to show the role art, name and power, and another tap flips it back.
- **Accessibility:** `prefers-reduced-motion` gets a fade instead of the flip.
- **Rejoin:** after a refresh, a player gets the same card back, face down.
- **Accept when:** an integration test deals to 3 pages and each page sees only its
  own role. The flip toggles. A refresh keeps the role.

### 8. Host dashboard, Confirm, Reveal, attack
- Shown only when the host is moderating.
- **Dashboard:**
  - A player list with a Killed toggle on each row. Dead players are greyed out and
    can't be toggled.
  - Tapping a name opens that player's card fullscreen over a 70% black overlay; tap
    to close.
- **Confirm:** a sheet listing the toggled players, with Undo and Lock in. Locking
  writes `night` with `locked: true`, and nothing reaches the players yet.
- **Reveal:** one atomic update sets each victim's `alive: false`, writes
  `events/{id}` and sets `status` to `day`. The next night is reached from here.
- **On the victim's phone:**
  - `navigator.vibrate` where supported. On iPhone, a sound and a red screen flash
    instead.
  - A werewolf-attack animation plays over their card, and the card stays marked dead.
- **Accept when:** an integration test covers toggle → confirm → undo → confirm →
  reveal. Only the victim's page shows the attack, and the dead row is greyed out.

### 9. Sheriff (optional)
- **Before the deal:** the setup switch decides whether there's a Sheriff election.
- **After the deal:** an Assign Sheriff screen lists the players. "Give the Sheriff
  card to X" writes `sheriff`. "Skip, no Sheriff this game" skips it.
- **The chosen player** gets the Sheriff card beside their role card. The dashboard
  shows a Sheriff badge on their row.
- **Succession:** when the Sheriff dies, the host reassigns the card with the same
  screen.
- **Accept when:** assign, skip and reassign all work, and the switch being off hides
  the step.

### 10. Game over and host handover
- **Game over screen:** "Who hosts the next game?", offering "Keep me" or "Pass to
  <player>".
- **Passing hosting:** changes `meta.hostId`, and the old host becomes a player
  automatically.
- **Set up next game:** keeps the lobby, clears `cards`, `night`, `events` and
  `sheriff`, and returns to host setup.
- **End session:** deletes the room.
- **Accept when:** an integration test hands over hosting. The new host sees the setup
  screens and the old host sees the player lobby.

### 11. Help guide
- **Where:** a "?" button on Start, Join and the host session screens opens a
  full-screen scrollable guide with a close button.
- **Sections, in this order:** Goal, Roles, A round, Rules, Card mix, Using the app,
  Tips.
- **Content:** from `design/rules/`. Each role shows its card art and power, and the
  optional Sheriff is mentioned. A chip bar jumps to each section.
- **Accept when:** the guide opens from all three screens, the sections are in that
  order, and the card mix table matches `card-mix.json` (rendered from it, not
  retyped).

## Out of scope

- Deploying to Firebase Hosting.
- Dealing from a Cloud Function.
- In-app day voting.
- The Unity version.
- Accounts.
- Anything not listed above.
