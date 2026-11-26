# Companion App Flow

A phone app that replaces the physical card deck when the group doesn't have one.
Everyone plays in the **same room**, and the **host narrates out loud**. The app only:

1. **Deals the cards** to everyone who joined.
2. **Gives the host a dashboard** showing who has which card, plus a way to mark and
   reveal the night's kills.

The app has no narration, chat, timers or in-app voting. Card powers and the card
count per player number come from the rulebook reference in `design/rules/`.

## Flow

```
                    START
                      │
         ┌────────────┴─────────────┐
   CREATE SESSION                JOIN GAME
   (you become host)                │
         │                     enter code "xyz"
   code "xyz" shown                 │
         │                     enter Name ──────────► appears in host's lobby
   HOST SETUP                       │
   • Toggle: I'm moderating / I'm playing
   • 1. Number of players           │
   • 2. Pick roles                  │
   • 3. Review deck                 │
     (counts follow the rulebook table)
         │                     press READY ✓
      START  (enabled when everyone has joined and is ready)
         │
   CARDS DEALT ───────────────► card arrives face down on each phone;
                                 tap → flip animation reveals the role,
                                 tap again → flips back face down
         │
   SHERIFF ELECTION  (optional; out loud, at the table)
   • On/off switch in host setup; the host can also skip it on the assign screen
   • Host asks the group who should be Sheriff
   • Host taps the winner on the ASSIGN SHERIFF screen
       → the Sheriff card lands on that player's phone, next to their role
       → a Sheriff badge appears by their name on the host dashboard
         │
   HOST DASHBOARD  (only when the host is moderating)
   • List of player names
   • Tap a name → shows that player's card
   • "Killed" toggle next to each name
   • Night: the wolves point at the table, and the host switches that player's
     toggle on (more than one if needed)
   • CONFIRM screen → locks in the night's kills
   • Morning: the host says "wake up" out loud and taps REVEAL
       → each killed player's phone vibrates
       → a werewolf-attack animation plays over their card
         │
   GAME ENDS
         │
   "Is the host changing?" ──► keep the host, or pass hosting to another player
         │
   NEXT GAME (same lobby, new shuffle)
```

## Decisions

| Question | Decision |
|---|---|
| Host plays or moderates? | A toggle each game. After a game ends, before the next one starts, the app asks whether the host is changing |
| Night wake-up calls | Not in the app. The host narrates in the room |
| Setup steps 2 and 3 | Pick roles, then review the deck. Card counts follow the rulebook's player-count table |
| Sheriff | Optional: an on/off switch in host setup, and a Skip button on the assign screen. Not dealt. After the deal the host asks the table who should be Sheriff, then assigns the Sheriff card to that player in the app. It shows on their phone beside their role, and as a badge on the host dashboard |
| Help | A "?" button on Start, Join a game and the host's session screen opens a scrollable guide: goal, a round, full rules, roles, card mix, using the app, tips |
| Tracking after the deal | The host dashboard: names, tap to see a card, a Killed toggle, a Confirm screen, and Reveal. On Reveal each victim's phone vibrates and plays a werewolf-attack animation over their card |

## Small pieces between the boxes

- **Share the code.** Show it large, with a QR code.
- **Host lobby list.** Names, a Ready tick, and a way to remove someone who joined by
  mistake.
- **Start rule.** Joined players must match the chosen count, and everyone must be
  Ready. A playing host counts as a player.
- **Automatic deck.** The werewolf count comes from the rulebook table. Each special
  role picked replaces a Villager. The Thief adds 2 extra cards. The Sheriff is never
  dealt, because it's elected at the table.
- **Card arrival and flip.** When the host deals, each card slides in face down. A tap
  flips it over with an animation to reveal the role, and another tap flips it back.
- **Sheriff succession.** If the Sheriff dies, they name a successor out loud, and the
  host moves the Sheriff card with the same Assign Sheriff screen.
- **Rejoin.** A player who locks or refreshes their phone gets the same card back.
- **Confirm screen.** Lists the toggled players, with an Undo.
- **After Reveal.** The victim's card stays marked as dead. Dead players are greyed
  out on the dashboard and can't be toggled again.
- **iOS.** iPhone browsers can't vibrate, so they use sound and a screen flash
  instead.
- **Hand over hosting.** Pick the new host from the lobby list for the next game. The
  old host automatically becomes a player. The new host chooses moderating or playing
  in their own setup, the first host step.

## Architecture

How rooms, joining, dealing and reveal work over Firebase, plus the join link and QR
code: see [companion-architecture.md](companion-architecture.md).

## Technology (decided)

| Area | Decision |
|---|---|
| Platform | Web first: a mobile-browser game for Android and iPhone, opened from a link or QR |
| Language | TypeScript |
| Build tool | Next.js (React + TypeScript) with static export. Not Vite |
| Back end | Firebase: Realtime Database for rooms, cards and reveals, plus Hosting |
| Players | Guests only, through Firebase Anonymous Auth. No accounts and no login screen. A hidden per-phone ID keeps each card private and lets a player rejoin |
| Portability | Game rules and data (card mix, roles) live in plain data files, so a later app can reuse them |

### Why Next.js and not Three.js

They do different jobs. Three.js draws a 3D scene into one canvas. Next.js builds the
app around it: screens, navigation, text, buttons, inputs, lists, the build and the
static export. This game is screens (join, lobby, setup, dashboard, reveal, guide), not
a 3D world, so it needs the app framework. The card flip, claw attack and badge drop are
CSS animations. Three.js stays an optional add-on for a single 3D view later, through
React Three Fiber, inside the Next.js app.

### Checked against a browser-game stack guide (Nov 2026)

| Topic | Guide's advice | Our stack | Verdict |
|---|---|---|---|
| Engine | Three.js unless there's a reason; Unity and Godot web builds are heavy | Next.js + React | Holds. No 3D scene. Supports keeping Unity for a native app |
| Renderer | WebGL now, WebGPU when needed | SVG art and CSS animations | Holds, and reaches more browsers |
| Physics | None until needed | None | Holds |
| Multiplayer | WebSockets and a small relay | Firebase Realtime Database (syncs over WebSockets) | Holds. Occasional events, not 10 position updates a second |
| Versions | Tell the AI tool the exact versions | Not pinned yet | Action: pin Next.js, React and Firebase versions at engine setup |

Follow-ups from the check:

- **Pin versions.** `/setup-engine` records exact Next.js, React and Firebase versions.
- **Join link format.** Next.js static export can't build a page per room at runtime,
  so join links use `/join?code=K7QX`, or a Firebase Hosting rewrite sends every
  `/join/...` path to one page. Decide before building the QR code.
- **Fast first load.** Keep the static export light, with SVG art and no heavy
  libraries, so there is no loading screen.
- **Free tier.** Firebase's free plan allows 100 simultaneous connections, about 5 to 10
  games at once. The pay-as-you-go plan raises it with no code change.
- **PartyKit is not an option.** Its hosted platform shut down on 23 Oct 2026. We use
  Firebase anyway.

### Built to port to Unity later

No web code moves into Unity, which uses C#. Next.js and Three.js would both be
rewritten. These rules keep everything except the screens and a thin logic layer
reusable:

1. **Game logic in one plain TypeScript module,** with no React, browser or Firebase code
   inside. It takes a game state and an action and returns the new state, so it ports
   to C# almost line by line.
2. **Rules as JSON data:** the card-mix table, roles and powers. Both versions read the
   same files.
3. **Firebase data layout documented** in `design/`, so the Unity app reads and writes
   the same shape.
4. **Card art exported to PNG** alongside the SVGs, for Unity.

| Carries over to Unity | Rewritten in Unity |
|---|---|
| Firebase project, data layout and security rules | Screens, in Unity's UI system |
| Rules and card data (JSON) | Game logic, translated from TypeScript to C# |
| Card art (SVG exported to PNG) | Animations |
| Design docs, flow note, mockups | |

## Backlog (not now)

- **App-store version in Unity.** Port the game to Android and iOS with Unity, using the
  same Firebase project through Firebase's Unity SDK, so web and app players could share
  games. Parked until the web version ships. See "Built to port to Unity later".

## Open, not blocking

1. **When the host plays,** nobody has the dashboard. Who moderates that game?
2. **Day-vote eliminations.** Should the same toggle, Confirm and Reveal be used,
   maybe with a different animation?
3. **Other phones on Reveal.** Do they stay unchanged, with the host announcing the
   deaths?
4. **Below 8 players.** The rulebook table starts at 8. Keep that as the minimum?
