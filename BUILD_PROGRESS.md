# Build progress

Log for the `/builditnow` run of [plan.md](plan.md). This file is a log, not a plan.

- **Main session model:** Opus 5.5
- **security-audit:** installed at user level (`~/.claude/skills/security-audit`), loaded in guidance mode at setup
- **Baseline (setup step 2):** no application code, no `package.json` and no test suite exist yet, so there are no pre-existing failures
- **Design system:** `design-system/MASTER.md`, created 2026-11-27 before feature 5. It writes down the approved mockup look (tokens extracted from the 19 mockups) plus the ui-ux-pro-max UX rules: touch 44px, visible labels, reduced motion and focus rings. Contrast was measured. Two fixes keep the look: red text uses `#ff9a8a`, and form-field borders use `#6a5fa0` (3:1). Binding for features 5–11.
- **Firebase:** the user is setting up the project. Feature 4's live check waits for `.env.local`

## Paused 2026-11-26, resumed 2026-11-27

On resume: the working tree matched commit `be01114`. `npm test` passed 179 and `npm run test:integration` passed 1. There's still no `.env.local`, so feature 4's live check stays pending.


The user paused the build during feature 4.

- **Done and verified:** features 1–3.
  - `npm test`: 179 passed in 16 files.
  - `npm run test:integration`: 1 passed.
  - lint, typecheck and build are clean.
- **Feature 4:** the Opus subagent was stopped before it wrote any files. No
  `src/net/FirebaseBackend.ts`, `database.rules.json` or `tests/live/` exist, and
  `getBackend()` still throws for Firebase. The suite was re-run after the stop and
  still passes 179/179.
- **Committed:** features 1–3 are in local commit `be01114`, not pushed.
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
| 4 | Firebase backend + security rules | Features → 4 | no | integration-tested; live check pending |
| 5 | Start and join screens | Features → 5 | yes | integration-tested (done) |
| 6 | Host setup and lobby | Features → 6 | yes | integration-tested (done) |
| 7 | Deal and player card | Features → 7 | yes | integration-tested (done) |
| 8 | Host dashboard, Confirm, Reveal, attack | Features → 8 | yes | integration-tested (done) |
| 9 | Sheriff (optional) | Features → 9 | yes | integration-tested (done) |
| 10 | Game over and host handover | Features → 10 | yes | integration-tested (done) |
| 11 | Help guide | Features → 11 | yes | integration-tested (done) |

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

### Feature 4: Firebase backend + security rules (done; live check pending)

- **Model:** Opus. The first attempt was stopped by the user's pause before it wrote
  any files; the second attempt is this one.
- **Files:**
  - Created: `src/net/FirebaseBackend.ts`, `database.rules.json`,
    `vitest.live.config.ts`, `tests/live/rules.live.test.ts`,
    `tests/unit/net/firebaseBackend.test.ts`, `tests/unit/net/rules.test.ts`.
  - Changed: `src/net/backend.ts` (`getBackend()` and `readFirebaseConfig()`),
    `src/net/errors.ts` (`BackendNotConfiguredError`, which names the missing keys
    and never their values), `src/net/index.ts`, `tests/unit/net/backend.test.ts`
    (the placeholder message changed), and `package.json` (the `test:live` script).
- **Tests (run by the orchestrator):**
  - `npm test`: 227 passed in 18 files.
  - `npm run test:integration`: 1 passed.
  - `npm run test:live`: skips cleanly (10 skipped), since there's no `.env.local`.
  - lint, typecheck and build are clean, and `database.rules.json` is valid JSON.
- **Rules design:**
  - Deny by default; nothing can be read or written at `/` or `/rooms`.
  - The host writes anything in the room. `meta` can only be created when it's
    absent, by its own host, in the lobby.
  - `players/$pid` is written by its owner: joining only in the lobby, with
    alive/connected true and ready false. The owner can never change `alive`, and can
    change name and ready only in the lobby.
  - `cards/$pid` and `events/$pid` are readable by that player or the host.
  - `night` and `spares` are host-only.
  - Every non-delete write must keep `meta`.
  - Handover only goes to an existing player.
  - The name limit is 24 UTF-16 units, because the client counts 12 code points.
  - Regexes use `+` plus a length check.
- **Security check** (orchestrator review, adversarial reading of the rules):
  - Confirmed findings: none.
  - `needs_validation`: every rule *behaviour* (no emulator, since there's no Java)
    waits for `npm run test:live` against the user's project. Its 10 cases cover
    stranger claims, hidden paths, self-revive, late join, foreign writes, handover to
    a stranger, and cleanup.
  - Informational:
    - About 920k room codes, so anyone signed in who guesses a live code can read its
      lobby and join while it's in the lobby. This is by design for joining by code.
    - Abandoned rooms aren't cleaned up. The architecture mentions cleanup; plan.md
      doesn't.
  - No secrets or config values are logged.
- **Integration:** the full suite (unit + multi-phone logic + Playwright) passes with
  features 1–4. The live rules test is feature 4's integration against real Firebase
  and is pending the user's `.env.local`.
- **Manual steps for the user:**
  1. Create `.env.local`.
  2. Paste `database.rules.json` into the console (Realtime Database → Rules →
     Publish).
  3. Run `npm run test:live`.
  4. Do the two-browser smoke check.

### Feature 5: Start and join screens (done)

- **Model:** Sonnet, one attempt.
- **Files:**
  - `src/app/globals.css` (MASTER tokens and component styles) and `layout.tsx`
    (Cinzel and Inter via next/font).
  - Routes: `src/app/{page,host/page,join/page,play/page}.tsx`.
  - Shared UI: `src/ui/components.tsx` and `useRoom.ts`.
  - Join flow: `src/join/*` (`parseJoinQr`, code, name and scan steps, `JoinFlow`).
  - Screens: `src/start/StartScreen.tsx`, `src/play/{PlayScreen,PlayerLobby}.tsx`,
    `src/host/HostPlaceholder.tsx` (replaced in feature 6).
  - Tests: `tests/unit/join/*`, `tests/unit/ui/lobby.test.tsx`,
    `tests/integration/join.spec.ts`.
- **Routes:** a static export can't create pages per room, so rooms use query
  strings: `/`, `/join?code=`, `/play?code=`, `/host?code=`.
- **Tests (run by the orchestrator):**
  - `npm test`: 245 passed in 21 files.
  - `npm run test:integration`: 4 passed. A host and 2 player pages join and ready
    up; the bad and unknown code and name-taken errors show; an unjoined `/play`
    redirects to join.
  - lint, typecheck and build are clean, and every route is static.
- **Design review** (orchestrator, against the mockups using
  `production/qa/evidence/feature-5/*.png`):
  - The start, join-code, join-name, player-lobby and host list screens match in
    layout, tokens, type and copy.
  - The "?" buttons are deferred to feature 11.
  - The scan screen was checked in its camera-unavailable state, since headless
    Chromium has no camera.
  - The focus ring shows on fields, contrast passes, and the ready state uses text as
    well as colour.
  - `--ready-bg #2f6b3a` comes from the mockup and was added to MASTER.md, with text
    at 5.4:1.
- **Security check:**
  - `parseJoinQr` accepts only same-origin URLs on `/join` with a pattern-valid code,
    and never navigates to the scanned URL.
  - Codes from the URL are pattern-checked, and names render as text.
  - There's no `dangerouslySetInnerHTML` or `location` assignment.
  - Camera tracks stop on every exit.
  - Confirmed findings: none.
- **Not verified:** the live camera and the `jsqr` fallback (no camera in headless
  tests; `parseJoinQr` is unit-tested), and running against Firebase (memory backend
  only).
- **Decisions:**
  - Leaving the lobby only navigates away, because there's no leave action. The host
    removes stale players in feature 6.
  - Rejoining as the same guest counts as success.
  - Lobby order is by name.
- **Process note:** the integration spec was written by the feature subagent and
  reviewed and run by the orchestrator. It covers features 3–5 across 3 browser
  pages.

### Feature 6: Host setup and lobby (done)

- **Model:** Sonnet. One build, plus one design-review fix through the same subagent.
- **Files:**
  - Host view: `src/host/HostScreen.tsx` (switches on status), `src/host/steps/{Session,Roles,Review,Lobby}Step.tsx`, `src/host/DealtPlaceholder.tsx` (replaced in features 7–8), `src/host/deckInfo.ts`.
  - Shared: `PlayerRow` in `src/ui/components.tsx` gained `statusText` and `action`, and `globals.css` has new host classes plus 4 mockup tokens.
  - Removed: `src/host/HostPlaceholder.tsx`.
  - Tests: `tests/unit/host/*`, `tests/integration/host-setup.spec.ts`.
  - `tests/integration/join.spec.ts` now walks the host to the lobby before it checks the list. The orchestrator confirmed its assertions are unchanged: Ready, then Not ready after an undo, on the host's screen.
- **Tests (run by the orchestrator):**
  - `npm test`: 272 passed.
  - `npm run test:integration`: 6 passed.
    - Moderating flow: 5 players, Witch + Thief, 7 cards (5 + 2 spare), Start blocked with names, remove a player, a new player joins, deal reaches `dealt`.
    - Playing-host flow: the host must give a name and counts as a player.
  - lint, typecheck and build are clean.
- **Design review** (orchestrator, `production/qa/evidence/feature-6/` against the mockups):
  - Session (real QR), roles, review and lobby all match.
  - Failed once: the role tiles showed selection by colour only. Fixed by adding the mockup's tick box (gold with a tick, or an empty box with a `--field-border` outline). A unit test covers it, and the screenshot was re-checked.
  - The tokens `--selected-bg`, `--ok-bg`/`--ok-text` and `--qr-bg` come from the mockups. They were added to MASTER.md and pass contrast at 13.1:1 and 11.5:1.
  - Accepted deviations: the room code is 44px (MASTER) rather than the mockup's 56px; the Sheriff control is a `role=switch`; the role tiles are `aria-pressed` buttons; the "?" button waits for feature 11.
- **Security check:**
  - The QR encodes only `joinUrl(code, origin)` from a pattern-valid code.
  - Share and clipboard run only on a tap, with a visible fallback.
  - A non-host is redirected away, and the reducer and DB rules stay the authority.
  - Names render as text.
  - Confirmed findings: none.
- **Decisions:**
  - The setup step is local state, so a refresh returns the host to step 1 with the saved config.
  - The Start label names who isn't ready (2 names at most, then a count).
  - A playing host shows "Host" instead of Ready.
  - Removing a player asks for confirmation.

### Feature 7: Deal and player card (done)

- **Model:** Sonnet, one attempt.
- **Files:**
  - Created: `src/card/RoleCard.tsx` (a single button with `aria-pressed` and a changing accessible name; CSS 3D flip; art looked up by id from `roles.json`) and `src/play/CardScreen.tsx`.
  - Changed: `src/play/PlayScreen.tsx`, `src/host/HostScreen.tsx` (a playing host sees their own card), `globals.css` (card styles).
  - Tests: `tests/unit/card/roleCard.test.tsx`, `tests/integration/deal.spec.ts`.
  - `host-setup.spec.ts`: 3 lines changed from the removed "game has started" stub to "Your card has arrived". The moderating host's `Cards dealt` and `status: dealt` checks are untouched (orchestrator checked).
- **Tests (run by the orchestrator):**
  - `npm test`: 284 passed.
  - `npm run test:integration`: 8 passed.
    - Deal to 5 phones: each shows only its own role, the roles together equal the deck, a tap flips the card and a second tap hides it, and a reload keeps the role face down.
    - A playing host sees their own card.
  - lint and typecheck are clean.
- **Design review** (`production/qa/evidence/feature-7/`):
  - The face-down, face-up, reduced-motion and playing-host shots match the mockups' look.
  - Accepted deviation: the heading sits under the card, not above it, so the card stays in place across the flip; the plan requires the name and power under the card.
  - The flip runs 500ms per MASTER (the mockup used 0.8s with a pulse). Reduced motion cross-fades in 150ms.
- **Security check:**
  - Only `state.cards[myId]` is read, through `Object.hasOwn`.
  - The art URL comes only from `roles.json`.
  - The card state isn't stored in the URL, storage, logs or the title.
  - Confirmed findings: none.
- **Not covered by a test:** reversing a flip when the card is tapped mid-flip. That relies on CSS transition retargeting.

### Feature 8: Host dashboard, Confirm, Reveal, attack (done)

- **Model:** Sonnet. One build, plus one review fix through the same subagent.
- **Files:**
  - Host: `src/host/dashboard/{types,Dashboard,CardOverlay,ConfirmKillsSheet,DawnScreen,HostGame}.tsx`.
  - Player: `src/play/{AttackOverlay.tsx,useAttackPlayback.ts,attackEffects.ts}`.
  - Changed: `HostScreen.tsx`, `PlayScreen.tsx`, `CardScreen.tsx`, `RoleCard.tsx` (exports `lookupRole`), `components.tsx` (a danger button), and `globals.css` (5 tokens plus styles; `.shell` gets a z-index).
  - Removed: `DealtPlaceholder.tsx`.
  - Tests: `tests/unit/dashboard/*`, `tests/unit/attack/*`, `tests/integration/night.spec.ts`.
  - `host-setup.spec.ts`: the removed placeholder line `status: dealt` now asserts the "Night falls" button instead, an equivalent check.
- **Tests (run by the orchestrator):**
  - `npm test`: 302 passed.
  - `npm run test:integration`: 10 passed.
    - Night loop: toggle → confirm → undo lock → confirm → REVEAL.
    - Only Farah's page shows the attack and records `vibrate([200,100,300])`; the other 4 phones show nothing.
    - Host Day dashboard: Farah shows "Dead", her toggle is unchecked and disabled, and there are no killed-style rows. She stays disabled after the next "Night falls".
    - After a reload there's no replay.
    - The card overlay opens and closes.
  - lint, typecheck and build are clean.
- **Design review:**
  - Dashboard, overlay (70% black), confirm sheet, dawn/REVEAL and the victim screen match the mockups.
  - Failed once: during the day, a dead player still showed the red killed style with a checked toggle, because `night.killed` persists until `startNight`. Fixed so that dead always wins and counts include only living toggled players. A unit test and the integration assertions cover it, and the screenshot was re-checked.
  - The flash runs at most 2 pulses in 1.2s (about 1.7/s), under the 3/s limit. Reduced motion shows a static frame.
  - The new tokens pass contrast at 5.0–16.4:1.
  - Accepted deviations:
    - No night or day numbers: the state has no counter, and `src/game` stays unchanged.
    - "Undo lock" takes the slot of the mockup's disabled "Night 2" button.
    - The victim's pill reads "Dead" instead of "Vibrating".
- **Security check:**
  - No new subscriptions or reads. Players still never get `night`, other cards or other events.
  - The host overlay reads roles only from the host's own view.
  - `sessionStorage` holds only the seen `killedAt`.
  - Haptics and sound fire only on the player's own event.
  - Confirmed findings: none.
- **Weak or untested:**
  - Integration "no replay after reload" checks only that there's no `.attack-flash`; the vibrate log resets on reload. A unit test covers the stored `killedAt`.
  - The real iPhone sound path is untested, because jsdom has no AudioContext.

### Feature 9: Sheriff, optional (done)

- **Model:** Sonnet. One build, plus one security-review fix through the same subagent.
- **Files:**
  - Created: `src/host/sheriff/{AssignSheriff.tsx,SheriffHost.tsx,sheriffStep.ts}`, `src/play/{SheriffScreen,PlayerView}.tsx`.
  - Changed: `HostScreen.tsx`, `HostGame.tsx`, `Dashboard.tsx`, `dashboard/types.ts`, `CardScreen.tsx` (an `actions` prop), `PlayScreen.tsx`, `globals.css`.
  - Tests: `tests/unit/sheriff/sheriff.test.tsx`, `tests/integration/sheriff.spec.ts`.
  - Existing specs: `night.spec.ts`, `deal.spec.ts` and `host-setup.spec.ts` (×2) each gained exactly one line clicking "Skip, no Sheriff this game", because the Sheriff is on by default. No assertions changed (orchestrator checked).
- **Tests (run by the orchestrator):**
  - `npm test`: 317 passed.
  - `npm run test:integration`: 13 passed.
    - Assign to Chloé: only her phone shows the Sheriff card, and the dashboard badge appears.
    - Chloé is killed: the succession prompt appears and the card moves to Dev. Chloé gets the dead screen without the Sheriff card.
    - Skip: no badge or card, and a host reload doesn't ask again.
    - Sheriff switch off: no step and no Sheriff action.
  - lint, typecheck and build are clean.
- **Design review:**
  - Assign, player Sheriff, badge (star plus the word, not colour alone) and succession prompt match the mockups.
  - Accepted deviation: the role tile shows the card back instead of the role art, so a neighbour can't glance the role.
- **Security check:**
  - Failed once: the "step done" marker put every player's id:role into sessionStorage keys. It was replaced by a role-free flag `sheriff-step:<code>` that is cleared in the lobby, and a unit test checks that no storage key or value holds a role.
  - Orchestrator `grep`: the app writes only that flag and the victim's seen `killedAt`.
  - The assign screen shows names only.
  - Confirmed findings: none open.
- **Decisions:**
  - A playing host also sees the Assign screen (it shows no roles) and gets a "Sheriff" text button to reassign later.
  - Dead players can't be chosen.
- **Not done (optional):** a "Sheriff (dead)" line on the dead screen. The role-card live region repeats when the Sheriff flips to their role card.

### Feature 10: Game over and host handover (done)

- **Model:** Sonnet, one attempt.
- **Files:**
  - Created: `src/host/gameover/{candidates.ts,EndGameSheet.tsx,GameOver.tsx,GameOverHost.tsx}`.
  - Changed:
    - `HostScreen.tsx`: `over` shows GameOverHost, and a playing host gets an End game button.
    - `Dashboard.tsx` and `HostGame.tsx`: an End game button with a confirm.
    - `PlayScreen.tsx`: a new host is redirected to `/host`, and an `over` notice is shown.
    - `CardScreen.tsx`, `SheriffScreen.tsx` and `AttackOverlay.tsx`: a `notice` prop.
    - `globals.css`: `.notice--calm`.
  - Tests: `tests/unit/gameover/*` (10) and `tests/integration/gameover.spec.ts`. No existing test was changed.
- **Unrequested change:** the subagent ran `prettier` over `src/host` and `src/play`, then reapplied single quotes at a print width of 160. The orchestrator checked that the style now matches the other folders (single quotes, line lengths like `src/ui` and `src/join`) and that the full suite passes. Behaviour is unchanged. Accepted and logged as scope creep.
- **Tests (run by the orchestrator):**
  - `npm test`: 327 passed.
  - `npm run test:integration`: 16 passed.
    - Handover: End game → Pass to Ben → Ben lands on host setup. The old moderating host goes to the Name step, then the player lobby. The others show "Not ready". Ben deals a second game and every phone, including the old host's, gets a card.
    - Keep host: back to setup step 1, and players' ready is reset.
    - End session: every player sees "That game is gone".
  - lint, typecheck and build are clean.
- **Design review:**
  - The end-game confirm, Game over, the player's notice, the new host's setup and the old host's name step match the mockup.
  - All players are listed, with no "4 of 9".
- **Security check:**
  - Only the host view has Game over and End session; the reducer and DB rules remain the authority.
  - Redirects use the pattern-checked code.
  - No new subscriptions or storage.
  - Confirmed findings: none.
- **Decisions:**
  - End game isn't offered on the locked-night Dawn screen (undo the lock first).
  - "Keep me" shows the host's name only if they have a player record.
  - A moderating old host gives a name on the Name step to join the next game.

### Feature 11: Help guide (done)

- **Model:** Sonnet, one attempt.
- **Files:**
  - Created: `src/guide/Guide.tsx` (a full-screen dialog with a sticky header, a ✕ button, a chip bar, an Escape/focus trap and a body scroll lock) and `src/guide/HelpButton.tsx`.
  - Changed: `globals.css`, `StartScreen.tsx`, `CodeStep.tsx`, `SessionStep.tsx` (each gained a "?" button).
  - Tests: `tests/unit/guide/guide.test.tsx` (9) and `tests/integration/guide.spec.ts` (3). No existing test was changed.
- **Tests (run by the orchestrator):**
  - `npm test`: 336 passed.
  - `npm run test:integration`: 19 passed.
  - lint and typecheck are clean, and there's no `dangerouslySetInnerHTML`.
- **Design review:** the guide matches the mockup.
  - Sections run in order: Goal, Roles, A round, Rules, Card mix, Using the app, Tips.
  - The roles come from `roles.json`, with art.
  - The card-mix table is rendered from `card-mix.json`: 14 rows, with 5–7 tagged "small lobby" in text.
  - The "?" is on Start, Join code and the host session.
  - Chips are 44px tall (the mockup has 36px).
- **Correction to the orchestrator's brief:** the brief said the werewolves win when they "equal or outnumber" the villagers. The subagent used the rules docs' actual rule instead (`01-overview.md`: werewolves win when the last villager is eliminated). The docs are correct, and the brief was wrong.
- **Security check:** static content only, and image URLs come only from `roles.json`. Confirmed findings: none.
- **Decisions:**
  - No "?" on the Name step.
  - The Rules and Tips copy is trimmed from the mockup.
  - The guide renders only when opened, though its code is statically imported.

## Final suite (setup step 12), 2026-11-27

| Check | Baseline (setup) | Final |
|---|---|---|
| `npm test` (unit + logic integration) | no suite | 336 passed, 29 files |
| `npm run test:integration` (Playwright, memory backend) | no suite | 19 passed |
| `npm run lint` / `npm run typecheck` | n/a | clean |
| `npm run build` (static export) | n/a | passes: `/`, `/host`, `/join`, `/play` |
| `npm run test:live` (Firebase rules) | n/a | skipped, since there's no `.env.local` (pending the user) |
| `npm audit --omit=dev` | n/a | 4 high, all `@grpc/grpc-js` through firestore. Not reachable (see feature 1) |

No regressions against the baseline, which had no suite.

**Not yet verified** (needs the user's Firebase project and real phones):
1. The FirebaseBackend and the rules against the real service: `npm run test:live`.
2. The Playwright specs against a Firebase build. They need one browser context per phone, because pages in one context share one Firebase sign-in.
3. A real-device playtest, with Android and iPhone mixed: lock a phone during the night, refresh during the deal, close and reopen the host mid-game, the iPhone sound, and real camera QR scanning.

**Known design limits** (from plan.md and the architecture, not bugs):
- The host's phone is the referee. If it goes offline the game pauses until it returns.
- A join at the same instant as the deal gets no card.
- A playing host's phone briefly holds every card while dealing; the server-side deal is deferred.
- The free plan allows about 100 simultaneous connections.

## Full security audit (setup step 13), quick profile, 2026-11-27

- **Report:** `C:/Users/kkish/security-audit-skill/werewolf-browser-game/run-1/`. It holds `REPORT.md`, `NEEDS-VALIDATION.md`, `FINDINGS-DETAIL.md`, `findings.json` and `coverage-ledger.json`. Both validators pass: 3 findings and 13 units.
- **Execution:** source-only. No sandbox is available on this Windows host, so no target code was run and nothing contacted Firebase.
- **Agents spent:** 11 (4 reconnaissance, 3 hunters, 1 critic, 3 verifiers).
- **Confirmed findings:** none, so there was nothing for the build to fix.
- **Needs validation** (each independently verified, with no severity):
  1. A former host's raw listener may survive handover. This depends on Firebase server behaviour.
  2. Unbounded room creation with no expiry can exhaust the 923k code space.
  3. A host can write unbounded per-room entries, filling the shared storage quota.
- **Coverage:** 8 units covered, 2 candidates, and 3 deferred by the critic. The deferred gaps are the anonymous-auth identity, the host and player UI write paths, and the deployment and header config. This is a partial pass.
- **Hardening notes:** see `REPORT.md` section 5. Examples: look-alike names, lobby flooding, the memory build sharing `out/`, framing headers, and `.env.production` not ignored.

## Build summary

| # | Feature | Frontend | Unit | Security | Integration | Model(s) |
|---|---|---|---|---|---|---|
| 1 | Project scaffold | no | ✅ | ✅ | smoke ✅ | Sonnet |
| 2 | Game rules core | no | ✅ | ✅ | suite ✅ | Opus |
| 3 | Room backend + memory backend | no | ✅ | ✅ | ✅ multi-phone | Opus |
| 4 | Firebase backend + rules | no | ✅ | ✅ (live check pending) | ✅ | Opus |
| 5 | Start and join screens | yes | ✅ | ✅ | ✅ | Sonnet |
| 6 | Host setup and lobby | yes | ✅ | ✅ | ✅ (1 design fix) | Sonnet |
| 7 | Deal and player card | yes | ✅ | ✅ | ✅ | Sonnet |
| 8 | Dashboard, Confirm, Reveal, attack | yes | ✅ | ✅ | ✅ (1 design fix) | Sonnet |
| 9 | Sheriff | yes | ✅ | ✅ (1 storage fix) | ✅ | Sonnet |
| 10 | Game over and handover | yes | ✅ | ✅ | ✅ | Sonnet |
| 11 | Help guide | yes | ✅ | ✅ | ✅ | Sonnet |

**Final result:** 336 unit tests and 19 browser tests pass, lint, typecheck and build are clean, and there are no regressions against the baseline (which had no suite).

**Design system:** `design-system/MASTER.md`, used by features 5–11.

**Still open:**
- The Firebase live checks (`test:live`, browser tests against Firebase).
- A real-phone playtest.
- The three needs-validation leads.
- The three deferred audit gaps.
- Features 4–11 are uncommitted.
