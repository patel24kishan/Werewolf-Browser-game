# Companion App Architecture

How the phones talk to each other. Companion to [companion-flow.md](companion-flow.md).

There is **no game server to write or run**. Firebase is the shared back end. Every phone
runs the same Next.js web app, and the phones coordinate by reading and writing one
real-time database. "Creating a server" means creating a **room** record. "Joining"
means adding yourself to that room.

## The pieces

```
              ┌──────────────────────────── Firebase ─────────────────────────────┐
              │  Hosting: serves the static Next.js app (HTML, JS, card art)      │
              │  Anonymous Auth: gives each phone a hidden guest ID               │
              │  Realtime Database: /rooms/K7QX/...  (live, pushed over WebSocket)│
              │  Security rules: who may read and write each part of a room       │
              └───────────────▲──────────────────────────▲────────────────────────┘
                              │ read/write + live updates │
        ┌─────────────────────┴───────┐          ┌────────┴─────────────────────┐
        │ Host phone (same web app)   │          │ Player phones (same web app) │
        │ creates room, sets deck,    │          │ join, ready up, receive card,│
        │ deals, marks kills, reveals │          │ get Sheriff, get attacked    │
        └─────────────────────────────┘          └──────────────────────────────┘
```

## Data layout (one room per code)

```
/rooms/K7QX
  meta              { hostId, hostMode: "moderating" | "playing",
                      status: "lobby" | "dealt" | "night" | "day" | "over",
                      sheriffOn: true, createdAt }
  deck              { werewolf: 2, seer: 1, witch: 1, hunter: 1, cupid: 1, villager: 4 }
  players/{guestId} { name: "Asha", ready: true, connected: true, alive: true }
  cards/{guestId}   { role: "seer" }        ← private: that player and the host only
  sheriff           "<guestId of the Sheriff>"
  night             { killed: { <guestId>: true }, locked: false }
  events/{guestId}  { killedAt: <timestamp> } ← the victim's phone listens here
```

The Unity app (backlog) reads and writes this same shape.

## Flow, step by step

1. **Open the link.** Firebase Hosting serves the app. The app signs the phone in as a
   guest (Anonymous Auth) and gets a hidden ID, kept in the browser across refreshes.
2. **Create a game.** The host's app picks a random 4-character code and claims
   `/rooms/{code}/meta` in one atomic transaction, which fails if the code is taken.
   `meta.hostId` is set to the host's guest ID. The code and QR code appear.
3. **Join.** A player scans the QR or types the code. The app checks the room exists and
   its `status` is `lobby`, then writes `players/{myId}` with their name. An
   `onDisconnect` handler flips `connected` to false if the phone drops.
4. **Lobby.** The host's screen listens to `players/`, so names and Ready ticks update
   live. Start unlocks when the count matches the deck and everyone is ready.
5. **Deal.** The host's app shuffles the deck and writes every `cards/{id}` in one
   atomic multi-path update, then sets `status` to `dealt`. Each player's phone listens
   to its own `cards/{myId}`, so the card arrives face down.
6. **Sheriff (optional).** The host picks the winner and the app writes `sheriff`. That
   phone shows the Sheriff card. The host can skip this.
7. **Night.** The host toggles Killed and confirms. The app writes `night.killed` with
   `locked: true`. Nothing reaches the players yet.
8. **Reveal.** One atomic update sets each victim's `players/{id}/alive` to false,
   writes `events/{id}` and sets `status` to `day`. The victim's phone sees its event,
   vibrates and plays the attack animation.
9. **Next game.** The host clears `cards` and `night`, reshuffles, and can hand hosting
   to another player by changing `meta.hostId`.
10. **Cleanup.** End session deletes the room. Leftover rooms older than a few hours are
    removed.

## Security rules (outline)

| Path | Read | Write |
|---|---|---|
| `meta`, `deck`, `sheriff`, `night`, `players` | Any signed-in guest who knows the code | `meta`, `deck`, `sheriff`, `night`: host only. `meta` can be created only if it doesn't exist |
| `players/{id}` | Any signed-in guest in the room | That player (name, ready). The host can delete it (remove a player) |
| `cards/{id}` | That player, or the host | Host only |
| `events/{id}` | That player | Host only |

Result: no one can read another player's role from the browser's developer tools.

## Reconnecting

- **A player's phone locks or refreshes:** the same guest ID gets the same card back. If
  they clear their browser data they get a new ID, and the host re-adds them.
- **The host's phone sleeps:** nothing is lost, because the game lives in the database.
  The host reopens the link and lands back on the dashboard.

## Decision: who deals the cards

| Option | How | Trade-off |
|---|---|---|
| **Host's phone deals** (first version) | The host's app shuffles and writes the cards | Fine when the host moderates, since they see every role anyway. When the host also plays, their phone briefly holds every card, so a tech-savvy host could peek |
| **Server deals** (before a public launch) | A small Cloud Function shuffles and writes the cards | No one can peek. Needs Firebase's pay-as-you-go plan, which has a free allowance but requires a card on file |

## Join link and QR code

**Link format:** `https://<site>/join?code=K7QX`. The query-string form works with
Next.js static export, which can't build a page per room code at runtime. *(Proposed.
The alternative is a Firebase Hosting rewrite that sends every `/join/...` path to one
page.)*

**Codes** use 4 characters from an alphabet without look-alikes (no 0/O, 1/I/L), so
they're easy to read aloud and type.

The snippets below are a reference implementation. They go into the code root once the
Next.js project is set up. Library: [`qrcode.react`](https://www.npmjs.com/package/qrcode.react)
(MIT), which draws the QR code as an SVG on the phone, offline, with no server call.

### Room code and join link

```ts
// lib/roomCode.ts
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I, L

export function newRoomCode(length = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

export function joinUrl(code: string, origin: string = window.location.origin): string {
  const url = new URL('/join', origin);
  url.searchParams.set('code', code);
  return url.toString(); // https://<site>/join?code=K7QX
}
```

### Claiming a free code (create a game)

```ts
// lib/createRoom.ts
import { getDatabase, ref, runTransaction } from 'firebase/database';
import { newRoomCode } from './roomCode';

export async function createRoom(hostId: string): Promise<string> {
  const db = getDatabase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    const result = await runTransaction(ref(db, `rooms/${code}/meta`), (current) =>
      current ?? { hostId, hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: Date.now() }
    );
    // Taken codes keep their old meta, so check that it's really ours.
    if (result.committed && result.snapshot.val()?.hostId === hostId) return code;
  }
  throw new Error('Could not find a free game code. Try again.');
}
```

### Showing the QR code (host screen)

```tsx
// components/RoomQr.tsx
'use client';
import { QRCodeSVG } from 'qrcode.react';
import { joinUrl } from '@/lib/roomCode';

export function RoomQr({ code }: { code: string }) {
  return (
    <div role="img" aria-label={`QR code to join game ${code}`}
         style={{ background: '#fff', padding: 12, borderRadius: 12, width: 'fit-content' }}>
      <QRCodeSVG value={joinUrl(code)} size={160} level="M" />
    </div>
  );
}
```

`level="M"` lets the code survive smudges and screen glare. White padding around it is
the quiet zone that scanners need.

### Reading the code on the join page

```tsx
// app/join/page.tsx
'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ROOM_CODE_PATTERN } from '@/lib/roomCode';

function JoinForm() {
  const raw = (useSearchParams().get('code') ?? '').toUpperCase();
  const code = ROOM_CODE_PATTERN.test(raw) ? raw : '';
  // code filled in from the QR → skip straight to "What's your name?"
  // no or invalid code → show the "Enter game code" field
  return null; // screen markup goes here
}

export default function JoinPage() {
  // useSearchParams needs a Suspense boundary in a static export
  return <Suspense><JoinForm /></Suspense>;
}
```

### Scanning inside the app

The in-app **Scan QR code** button opens the camera. It uses the browser's built-in
`BarcodeDetector` where it exists (Chrome on Android) and a small decoder library such
as `jsQR` elsewhere (Safari on iPhone). The scanner accepts a result only if it is a URL
on our own site, with path `/join` and a `code` matching `ROOM_CODE_PATTERN`. Any other
QR code shows "That's not a game code". A phone's normal camera app also works, because
the QR code is just the join link.

## Not verified yet

- Exact package versions are pinned at engine setup (see companion-flow.md, Technology).
- None of this code has been compiled or run. The project doesn't exist yet.
