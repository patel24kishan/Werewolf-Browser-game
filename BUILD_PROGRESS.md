# Build progress

Log for the `/builditnow` run of [plan.md](plan.md). This file is a log, not a plan.

- **Main session model:** Opus 5.5
- **security-audit:** installed at user level (`~/.claude/skills/security-audit`), loaded in guidance mode at setup
- **Baseline (setup step 2):** no application code, no `package.json` and no test suite exist yet, so there are no pre-existing failures
- **Design system:** not created yet. It's created at the first frontend feature (5)
- **Firebase:** the user is setting up the project. Feature 4's live check waits for `.env.local`

## ⏸ Paused: 2026-11-26

The user paused the build during feature 4.

- **Done and verified:** features 1–3.
  - `npm test`: 179 passed in 16 files.
  - `npm run test:integration`: 1 passed.
  - lint, typecheck and build are clean.
- **Feature 4:** the Opus subagent was stopped before it wrote any files. No
  `src/net/FirebaseBackend.ts`, `database.rules.json` or `tests/live/` exist, and
  `getBackend()` still throws for Firebase. The suite was re-run after the stop and
  still passes 179/179.
- **Nothing is committed.** All build files are untracked in the working tree.
- **To resume:** run `/builditnow` again. It re-runs the tests for features 1–3, then
  starts feature 4 from scratch with the same brief:
  - `FirebaseBackend` implementing `RoomBackend`.
  - `getBackend()` reading the `NEXT_PUBLIC_FIREBASE_*` env values.
  - `database.rules.json` with `night` and `spares` host-only, and players unable to
    change `alive` or join after the lobby.
  - Mocked unit tests and a structural test of the rules.
  - A `test:live` rules check that skips without config.
- **Waiting on the user:** the Firebase project and `.env.local`, needed for feature
  4's live check.

## Feature list

| # | Feature | plan.md section | Frontend | Status |
|---|---|---|---|---|
| 1 | Project scaffold | Features → 1 | no | security-checked (done) |
| 2 | Game rules core | Features → 2 | no | integration-tested (done) |
| 3 | Room backend interface + memory backend | Features → 3 | no | integration-tested (done) |
| 4 | Firebase backend + security rules | Features → 4 | no | paused (not started on disk) |
| 5 | Start and join screens | Features → 5 | yes | pending |
| 6 | Host setup and lobby | Features → 6 | yes | pending |
| 7 | Deal and player card | Features → 7 | yes | pending |
| 8 | Host dashboard, Confirm, Reveal, attack | Features → 8 | yes | pending |
| 9 | Sheriff (optional) | Features → 9 | yes | pending |
| 10 | Game over and host handover | Features → 10 | yes | pending |
| 11 | Help guide | Features → 11 | yes | pending |

### Acceptance criteria (from plan.md)

1. `npm run build` produces `out/`, a sample Vitest test passes, and a sample
   Playwright test loads `/`.
2. Unit tests cover every card-mix row, special-role replacement, Thief +2, the start
   rule, kill → confirm → undo → reveal, and dead players not being toggleable.
3. Unit tests cover code format and alphabet, the taken-code retry, multi-path
   atomicity, and subscribe callbacks.
4. Unit tests pass with the Firebase SDK mocked. A live smoke check once `.env.local`
   exists. The rules are pasted into the console as a manual step. Otherwise the
   feature is marked "live check pending".
5. Screens match the mockups. A host page plus 2 player pages join and ready up.
6. The deck always equals the player count (+2 with the Thief). Start obeys the start
   rule.
7. Deal to 3 pages, and each sees only its own role. The flip toggles. A refresh keeps
   the role.
8. Toggle → confirm → undo → confirm → reveal. Only the victim's page shows the attack.
   The dead row is greyed out.
9. Assign, skip and reassign the Sheriff. The switch being off hides the step.
10. Hosting handover. The new host sees setup and the old host sees the player lobby.
11. The guide opens from 3 screens, with sections in order. The card-mix table is
    rendered from `card-mix.json`.

## Assumptions

- `night` is host-only. The architecture doc's security table lists `night` as
  readable by every guest. That would let a player see the night's victims in
  developer tools before Reveal, which contradicts plan.md feature 8 ("nothing reaches
  the players yet"). So features 3 and 4 treat `night` (and `spares`) as host-only.
- From plan.md "Readings of the open questions": a playing host gets a card and no
  dashboard. Day votes stay out of the app. Other phones don't react on Reveal. 5–18
  players.

## Feature log

### Feature 1: Project scaffold (done)

- **Model:** Sonnet, one attempt.
- **Files:**
  - Config: `package.json` and `package-lock.json` (exact pins), `next.config.ts`
    (static export), `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`,
    `eslint.config.mjs`, `.env.local.example`.
  - Scripts: `scripts/copy-card-art.mjs`, `build-memory.mjs`, `serve-out.mjs`.
  - App and tests: `src/app/layout.tsx` and `page.tsx`, `tests/unit/sanity.test.ts`,
    `tests/integration/smoke.spec.ts`.
  - `.gitignore`: a Next.js block appended at the end.
- **Pinned versions:** next 16.4.6, react 19.3.1, firebase 13.4.0, qrcode.react
  4.2.0, jsqr 1.4.0, vitest 5.1.2, @playwright/test 1.65.1, typescript 6.0.3,
  eslint 10.15.0.
  - TypeScript stays on 6.0.3: 7.x breaks typescript-eslint in eslint-config-next
    16.4.6.
- **Tests (run by the orchestrator):**
  - `npm run build` passes and produces `out/index.html`.
  - `npm test`: 1 passed.
  - `npm run test:integration`: 1 passed.
  - `npm run lint` and `npm run typecheck` are clean.
- **Orchestrator change:** `playwright.config.ts` now sets
  `reuseExistingServer: false`, so every integration run rebuilds and no stale server
  is reused.
- **Security check:**
  - `serve-out.mjs` binds 127.0.0.1, rejects `..` and NUL, and checks that the
    resolved path stays inside `out/`.
  - There are no secrets, and `.env.local` is ignored.
  - `npm audit` shows 4 high findings, all in `@grpc/grpc-js` via
    `@firebase/firestore`. They are not reachable: the app uses only firebase/app,
    auth and database, and grpc-js is Node-only and never bundled for the browser.
    Logged, not fixed, because the fix downgrades firebase to 9.x.
  - Confirmed findings: none.
- **Integration step:** not applicable (feature 1).

### Feature 2: Game rules core (done)

- **Model:** Opus, one attempt.
- **Files:**
  - Data: `src/game/data/card-mix.json` (5–18), `roles.json` (9 roles), `rules.json`.
  - Code: `src/game/types.ts`, `ids.ts`, `rules.ts`, `deck.ts`, `names.ts`, `state.ts`,
    `reducer.ts`, `errors.ts`, `index.ts`.
  - Tests: 7 test files plus `helpers.ts` in `tests/unit/game/`.
- **Tests (run by the orchestrator):** `npm test` 115 passed; lint and typecheck are
  clean. `grep` of `src/game` for Math.random, Date.now, react, firebase, window. and
  document. finds nothing.
- **Decisions the subagent made where the plan was silent** (accepted, and used by
  later features):
  - A playing host needs a player record (a name) but not Ready; a moderating host is
    never counted.
  - `deal` resets alive, sheriff, night and events.
  - `skipSheriff` sets `sheriff` to null.
  - An empty night can be revealed.
  - `chooseNextHost` keeps the lobby, resets ready and alive, and clears cards, spares,
    night, events and sheriff.
  - Names are 1–12 code points and unique ignoring case.
  - There's a new `setConnected` action for presence.
  - `rules.json` holds the tuning values.
- **Additions to the data layout:**
  - `spares` (host-only).
  - `cards/{id}` stores `{ role }`.
  - `deck` stores `{ playerCount, specialRoles }`; role counts are derived with
    `countRoles(buildDeck(...))`.
- **Not modelled:** the Thief's swap with the spares. plan.md doesn't ask for it.
- **Security check:**
  - Ids are validated against a safe pattern, and prototype-pollution keys are
    rejected.
  - Payloads use exact field lists.
  - Host-only actions check the actor.
  - The reducer never throws.
  - Confirmed findings: none.
- **Integration step:** features 1 and 2 share no runtime path yet, because the core
  isn't wired into the app. The cumulative check was the full unit suite (115) plus
  the Playwright smoke test (1). Cross-feature integration tests start at feature 3.
- **Orchestrator config change:**
  - Vitest now also runs `tests/integration/**/*.test.ts`: multi-phone logic tests
    with no browser.
  - Playwright runs only `**/*.spec.ts`.

### Feature 3: Room backend interface + memory backend (done)

- **Model:** Opus, one attempt.
- **Files:**
  - `src/net/`: `RoomBackend.ts`, `MemoryBackend.ts`, `tree.ts`, `errors.ts`,
    `paths.ts`, `roomCode.ts`, `createRoom.ts`, `roomData.ts`, `room.ts`, `backend.ts`,
    `index.ts`.
  - Tests: `tests/helpers/net.ts`, 7 test files in `tests/unit/net/`, and
    `tests/integration/roomFlow.test.ts`.
- **Tests (run by the orchestrator):**
  - `npm test`: 179 passed in 16 files (115 + 64 new). The subagent re-ran it 8 times
    and it passed each time.
  - `npm run test:integration`: 1 passed.
  - lint and typecheck exit 0, and the build passes.
- **Orchestrator change:** the test server moved from port 3100 to 3417
  (`scripts/serve-out.mjs`, `playwright.config.ts`), because another local project's
  server holds 3100.
- **Design:**
  - **Memory backend:** one leader tab (Web Locks) orders every write with sequence
    numbers. Snapshots go to tabs that open later, and leadership fails over when the
    leader tab closes. onDisconnect relies on per-tab member locks.
  - **Limits:** the data lives only while a tab is open. Without Web Locks there's no
    failover.
  - **Room service:**
    - A client acts as a player until a valid `meta` names it host.
    - A player subscribes only to `meta`, `deck`, `players`, `sheriff`, and its own
      `cards` and `events` entries.
    - The diff writes field-level paths in one update; a player may write only under
      `players/{myId}`.
    - Presence re-asserts `connected` after a refresh.
  - **Additions:** `room.deleteRoom()` (for feature 10), and `RoomView.loaded` /
    `exists`.
- **Security check:**
  - Paths are built only in `paths.ts`, with validated ids and room codes.
  - Backend data is parsed defensively.
  - Room codes come from a CSPRNG with rejection sampling.
  - A test proves players never subscribe to `night` or `spares` (the subagent
    confirmed it fails when broken).
  - Confirmed findings: none.
- **Integration:** `tests/integration/roomFlow.test.ts` (written by the Opus feature
  subagent) plays a host and 5 players through a full game and a handover, covering
  features 2 and 3. Together with the full unit suite and the Playwright smoke test,
  everything passes.
- **Notes for feature 4's rules (from the subagent):**
  - A player creates its own record with `alive:true` and `connected:true` and writes
    its own `connected`.
  - `spares` is host-only.
  - `meta` is written field by field.
  - The host can delete `rooms/{code}`.
