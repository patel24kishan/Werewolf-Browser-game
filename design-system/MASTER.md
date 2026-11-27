# Werewolf Companion: design system (MASTER)

This is binding for every screen built in features 5–11. It writes down the look of
the approved mockups; it doesn't introduce a new style. `plan.md` decides what gets
built, and this file decides how it looks. Guidance comes from `ui-ux-pro-max` (UX
domain: touch, forms, animation, focus, contrast). The tokens were extracted from
the 19 approved mockups.

## Product

A mobile-browser party companion (Android Chrome and iPhone Safari). It's used in a
dim room, held in one hand, and glanced at quickly. Moods: dark, candle-lit, gothic
fairy tale. The content is the cards, so the interface stays quiet around them.

## Tokens

Define these once as CSS custom properties (for example in
`src/app/globals.css`) and use them by name. Don't put raw hex values in
components.

### Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0f0c1d` | Page background |
| `--surface` | `#1a1530` | Cards, rows, sheets, panels |
| `--surface-2` | `#2c2550` | Raised or secondary surface, chips, decorative borders |
| `--surface-3` | `#3a3266` | Pressed state, dividers on `--surface` |
| `--gold` | `#f2c94c` | Primary action fill, headings, the code, selected outline |
| `--gold-hover` | `#ffe08a` | Hover and active on gold, and links |
| `--on-gold` | `#1a1306` | Text on gold buttons (11.6:1) |
| `--text` | `#f6ecd2` | Main text |
| `--text-2` | `#cfc5e6` | Secondary text |
| `--text-3` | `#9c90c4` | Captions and labels. Use on `--bg` or `--surface` only (≥ 6:1), not on `--surface-2` (4.8:1 is OK only for text ≥ 14px bold) |
| `--field-border` | `#6a5fa0` | Borders of inputs, toggles and checkboxes: 3.15:1 on surface, the WCAG 1.4.11 minimum |
| `--danger` | `#c0392b` | Kill fills and outlines only. **Never as text** (3.5:1) |
| `--danger-bg` | `#3a1512` | Killed-row and attack backgrounds |
| `--danger-text` | `#ff9a8a` | Red text (≥ 8.6:1) |
| `--success` | `#9fe08c` | "Ready" text and ticks |
| `--ready-bg` | `#2f6b3a` | Filled "I'm ready" button, from the `PlayerLobby` mockup. Its text is `--text` (5.4:1). Added in feature 5 |
| `--selected-bg` | `#2a2410` | Selected choice or tile tint, from the `HostCreate`/`HostRoles` mockups. `--text` on it is 13.1:1. Added in feature 6 |
| `--ok-bg` / `--ok-text` | `#16301b` / `#c9f2bd` | Success summary panel (e.g. "7 cards: 5 players + 2 spare"), 11.5:1. Added in feature 6 |
| `--qr-bg` | `#ffffff` | The QR code's quiet-zone box only. Added in feature 6 |
| `--on-danger` | `#fff4f0` | Text on `--danger` buttons ("Lock in"), 5.0:1. Added in feature 8 |
| `--danger-soft` | `#f3b19f` | Soft red text on `--danger-bg` or `--dead-bg` (≥ 8.9:1). Added in feature 8 |
| `--dead-bg` | `#1c0807` | The victim's dead-screen background (`--text` on it is 16.4:1). Added in feature 8 |
| `--claw` / `--flash` | `#b3170f` / `#e0533f` | Claw slashes and the attack flash. Decorative only, never text. Added in feature 8 |
| `--overlay` | `rgba(0,0,0,0.7)` | Full-screen card view backdrop (70% black, a user decision) |

Measured contrast on `--bg` / `--surface`:
- `--text`: 16.4 / 14.9
- `--gold`: 12.1 / 11.1
- `--text-2`: 11.7 / 10.7
- `--text-3`: 6.6 / 6.0

### Type

- **Headings:** Cinzel 600/700, gold. Screen titles are 24–28px, section titles 20px.
- **Body:** Inter 400/500/600/700, with a base size of **16px** and line-height 1.5.
  - Secondary text is 14–15px.
  - Captions can go down to 13px, and nothing smaller than **12px** (labels only).
- **The room code:** Inter 700, 40–48px, letter-spacing 0.3em, in gold.
- Load both fonts with `next/font/google` (self-hosted at build time), using
  `display: swap`. Fall back to Georgia/serif for headings and system-ui for body.

### Space, shape, size

- **Spacing:** steps of 4 (4, 8, 12, 16, 20, 24, 32). Screen padding is 20–24px
  sideways.
- **Radius:** 10 for small controls, 12–14 for rows, inputs and buttons, 16 for
  primary buttons and sheets, 26 for card art, 999 for chips and pills.
- **Heights:**
  - Primary button: **60px**, gold fill, Inter 700 18px.
  - Secondary button: 48–52px, transparent with a gold 2px border.
  - List rows: ≥ 48px. Icon buttons: ≥ **44×44px**.
  - Keep ≥ 8px between adjacent targets.
- **Layout:** a single column at a max width of 480px, centred, `min-height: 100dvh`.
  - Primary actions sit at the bottom, inside a safe-area-aware footer:
    `padding-bottom: max(24px, env(safe-area-inset-bottom))`.
  - Nothing may scroll horizontally.

## Components (from the mockups)

- **Top bar:**
  - Back chevron on the left, a 44px button with `aria-label="Back"`. It goes to the
    previous screen and is absent on Start.
  - A step label or the game code on the right.
  - A "?" help button wherever plan.md asks for one: 44px, `aria-label="How to
    play"`.
- **Primary button:** gold fill with `--on-gold` text.
  - Disabled: `--surface-2` fill and `--text-3` text, plus a visible reason in its
    label or next to it (for example "Start (waiting for Dev)").
- **Text input:**
  - A visible `<label>` above the field. Never a placeholder-only label.
  - Field: 52px high, `--surface`, 2px `--field-border`. On focus the border turns
    gold.
  - Errors show under the field in `--danger-text`, with `aria-describedby`.
- **Room code input:** one input, uppercase, `inputmode="text"`,
  `autocapitalize="characters"`, `autocomplete="off"`, `maxlength=4`. Validate
  against the room-code pattern on blur and on submit.
- **List row (player):**
  - An initial avatar and the name, plus status text: Ready in `--success`, Not ready
    in `--text-3`.
  - Dead: 50% opacity with a "Dead" label. Colour is never the only signal.
- **Toggle / checkbox:** a native `input` with a custom look. Hit area ≥ 44px, with
  a text label such as "Killed".
- **Card:**
  - Uses the art from `/cards/<role>.svg`, with the card back from
    `/cards/card-back.png`.
  - Rounded 26px corners, a gold glow when face up.
  - The role name is in Cinzel underneath, with the one-line power below that.
- **Sheet / confirm:** a bottom sheet on `--surface` with a grabber. It has a title,
  a list, and a pair of buttons (secondary on the left, primary on the right).
- **Full-screen overlay (host card view):**
  - `--overlay` backdrop, the card centred, "Tap anywhere to close".
  - Escape closes it too, and so does a visible ✕ (44px, labelled).
  - Focus moves into it and goes back to the row afterwards.

## Motion

- **Feedback:** 150–200ms colour and opacity transitions on press. Animate only
  `transform` and `opacity`.
- **Card arrives:** slides up and fades in, 350ms ease-out.
- **Card flip:** a 3D Y-rotation, 500ms ease-in-out, with
  `backface-visibility: hidden`. Every tap toggles, and a tap mid-flip reverses it.
- **Werewolf attack:**
  - Claw slashes plus a red flash, about 1.2s, played once.
  - The card then stays marked dead.
  - Android also gets `navigator.vibrate([200,100,300])`. iPhone, which has no
    vibration, plays a short sound (after any user gesture) and a stronger flash.
- **Reduced motion:** with `@media (prefers-reduced-motion: reduce)`, flips and
  slides become a 150ms cross-fade. The attack becomes a static red frame with the
  claw marks; there's no flashing.
  - Never flash more than 3 times a second.
- **Limit:** at most one or two animated elements per screen.

## Accessibility and interaction checklist (every screen)

- Contrast meets the tokens above. Text is ≥ 4.5:1, and large text and UI boundaries
  are ≥ 3:1.
- Every interactive element is a real `<button>`, `<a>`, `<input>` or `<label>`,
  reachable by keyboard.
- Focus ring: `outline: 2px solid var(--gold); outline-offset: 2px`, never removed.
- Icon-only buttons have an `aria-label`, and decorative SVGs have
  `aria-hidden="true"`.
- Card art has alt text naming the role. The card back reads "Your card, face down.
  Tap to reveal."
- Live updates use `aria-live="polite"` for lobby counts and "card arrived", and the
  attack is announced politely.
- Viewport: `width=device-width, initial-scale=1`. Zoom is never disabled.
- No emoji as icons. Use inline SVG icons drawn as 1.8px strokes, as in the mockups.
- Tap targets are ≥ 44×44px with ≥ 8px between them. No hover-only actions.
- Loading states: buttons show a busy state ("Creating…") and can't be tapped twice.
- Errors are in plain words, next to their cause. For example: "No game with code
  K7QX" or "That name is taken".

## Anti-patterns (reject in review)

- New colours, gradients or fonts outside the tokens, and any light theme.
- Placeholder-only labels, grey-on-grey text, or red used as text colour.
- Shrinking body text below 16px to fit content. Wrap or scroll instead.
- Animating width, height or top, or more than two simultaneous animations.
- A modal without Escape, without a visible close, or that loses focus.
