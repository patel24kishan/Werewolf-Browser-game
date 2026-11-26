# 07 · Digital Adaptation (Mobile Browser)

> **Superseded** by [../companion-flow.md](../companion-flow.md). The game is a
> same-room companion app that deals cards and gives the host a dashboard, not the
> fully online game described below.

The game runs in a mobile browser on Android and iOS, designed for phones first. This
file maps every table action to a phone action and lists the decisions still open.
Nothing here is final. It is input for `/brainstorm` and `/design-system`.

## Table action → phone action

| At the table | On the phone |
|---|---|
| A human moderator calls each phase | The app narrates with voice and on-screen text, and runs every timer |
| Deal a face-down card | Your role card appears on a long-press, and hides again when you let go |
| Close your eyes | The screen goes to the night view. Everyone's screen looks and sounds the same |
| Open your eyes when called | Only the acting player's phone shows choices. Everyone else sees the same "sleeping" screen with the same animation |
| Point at a player | Tap a player's portrait in the village circle |
| Wolves agree silently | Wolves see each other's picks live. When the timer ends, the most picks wins, and a tie means no kill |
| Witch's thumbs up or down | Two potion buttons, each grayed out once used |
| Moderator taps the lovers | Lovers get a private heart animation and see their partner's name |
| Show a dead player's card | The card flips face up in the circle, and their portrait goes dim |
| Dead players keep silent | Dead players' chat and voice are muted. They watch as ghosts and can see every role |
| Simultaneous finger-pointing vote | Votes stay hidden until the timer ends, then all are revealed at once |
| The debate | Same-room lobbies: out loud. Online lobbies: built-in voice or text chat |

## Hiding information on a shared screen

Every phone must look and sound identical during the night, whatever role it belongs
to. Otherwise players glance at each other's screens or listen for buzzes.

- Same vibration, sound and screen brightness for everyone during each night step.
- Non-acting players get a decoy task on screen, such as "tap the candle to keep it
  lit". From across the room it looks exactly like making a choice.
- Night steps for absent roles still run for a random, realistic length of time.

## The Little Girl, digitally

Peeking can't be physical online. **Proposed** mechanic, kept as the default because
no alternative was preferred on 2026-11-25. The alternatives considered were one tap
for one random wolf at a fixed risk, and wolves who must tap "listen" at the right
moment to catch her.

- During the werewolves' turn, the Little Girl may press and hold an eye button.
- While she holds it, she sees the wolves' portraits, revealed gradually.
- While she holds it, the wolves see a faint "something is watching" pulse, without
  learning who.
- The longer she peeks, the higher the chance she is caught. A caught Little Girl
  dies instead of the wolves' victim.
- Tuning knobs: reveal speed and the curve of catch chance over hold time.

## Timers (proposed starting values, all tunable)

| Phase | Time |
|---|---|
| Each night role turn | 20 s |
| Werewolves' turn | 30 s. Most picks wins, and a tie means no kill |
| Dawn reveal | 8 s of narration and drama |
| Debate | 3 min, extendable by vote |
| Sheriff election (day 1) | 45 s |
| Vote | 30 s |
| Hunter's shot | 15 s. What happens on timeout is still open (see 05) |

## Decided (2026-11-25)

| Question | Decision | What it means for the build |
|---|---|---|
| Same room or online? | **Both modes** | Every lobby is either *same room*, where people talk out loud and phones carry roles, night actions and votes, or *online*, with in-app voice or text chat for the debate. Both need a server for shared game state. Online also needs chat, voice and reconnection handling |
| Player count | **5 to 18** | Reduced card mix for 5–7 players (see 03). The table for 8–18 is unchanged |
| Bots | **Practice mode only** | A solo tutorial against AI players. Bots never join real lobbies |
| Accounts | **Guest names** | Pick a name, then join with a room code or link. No sign-up and no stored profiles at launch |

## Open questions

1. **Game name.** Our own title is needed. The physical game's name can't be used.
2. **Little Girl mechanic.** Hold-to-peek is the default, but it isn't confirmed.
3. **Timeouts.** Does an unsent vote or an unused Hunter shot mean no action, or a
   random choice?
4. **Remaining Proposed rulings** in
   [05-rulings-and-edge-cases.md](05-rulings-and-edge-cases.md), listed under "Still
   open", for you to review.
5. **Online voice chat.** Should it be built in, text only, or should players be
   left to use their own call app? This decides most of the online-mode cost.

## Mobile constraints to design for

- **Portrait, one-handed.** Every action within thumb reach, with touch targets of at
  least 44 pt.
- **Wake lock.** The screen must not sleep during long debates.
- **Interrupted sessions.** Reconnect cleanly after a call, an app switch or a dropped
  signal.
- **Audio unlock.** iOS Safari plays sound only after a user tap, so the game needs a
  "tap to join" gate.
- **Low data and battery.** Vector card art (SVG), no heavy video.
