<p align="center">
  <img src="assets/screenshots/carousel.gif" width="760" alt="Werewolf Companion screens, one at a time: start, join, host session, deck setup, card arrives face down, card flipped, host dashboard, werewolf attack, how-to-play guide">
</p>

<p align="center">
  <img src="assets/screenshots/01-start.png" width="84" alt="Start">
  <img src="assets/screenshots/02-join.png" width="84" alt="Join a game">
  <img src="assets/screenshots/03-host-session.png" width="84" alt="Host session">
  <img src="assets/screenshots/04-host-roles.png" width="84" alt="Set up the deck">
  <img src="assets/screenshots/05-card-arrives.png" width="84" alt="Card arrives face down">
  <img src="assets/screenshots/06-card-revealed.png" width="84" alt="Card flipped">
  <img src="assets/screenshots/07-host-dashboard.png" width="84" alt="Host dashboard">
  <img src="assets/screenshots/08-werewolf-attack.png" width="84" alt="Werewolf attack">
  <img src="assets/screenshots/09-guide.png" width="84" alt="How to play">
</p>

# Werewolf Companion

A phone app for playing Werewolf in the same room when nobody brought the cards.

The app deals a secret role card to every player's phone. The host narrates out loud,
just as with the physical game, and uses the app to see who has which card and to
reveal each night's victims. There is no chat, no timers and no in-app voting: the game
still happens around the table.

It runs in the mobile browser on Android and iPhone. Players join from a link or a QR
code, as guests, with nothing to install and no account to make.

> **Status:** design phase. The screens above are mockups. The game flow, rules and
> architecture are written up, and the app itself hasn't been built yet.

## How a game works

1. **Host creates a session.** A 4-letter code and a QR code appear. The host chooses
   to moderate or to play.
2. **Players join** by scanning the QR code or typing the code, then enter a name and
   tap Ready.
3. **Host sets up the deck:** player count, then special roles. Card counts follow the
   rulebook's table.
4. **Cards are dealt.** Each card lands face down on its player's phone. A tap flips it
   to show the role, and another tap hides it.
5. **Sheriff (optional).** The table votes out loud, and the host gives the Sheriff
   card to the winner.
6. **Night.** The host marks the wolves' victims on the dashboard and locks them in.
7. **Dawn.** The host taps Reveal. Each victim's phone vibrates and plays a werewolf
   attack over their card.
8. **Game over.** Keep the host or pass hosting on, and deal again with the same lobby.

A **?** button on the Start, Join and host screens opens a scrollable guide with the
goal, roles, rules and card mix.

## Roles

<p>
  <img src="assets/2d%20assets/werewolf.svg" width="72" alt="Werewolf">
  <img src="assets/2d%20assets/villager.svg" width="72" alt="Villager">
  <img src="assets/2d%20assets/seer.svg" width="72" alt="Seer">
  <img src="assets/2d%20assets/witch.svg" width="72" alt="Witch">
  <img src="assets/2d%20assets/hunter.svg" width="72" alt="Hunter">
  <img src="assets/2d%20assets/cupid.svg" width="72" alt="Cupid">
  <img src="assets/2d%20assets/little-girl.svg" width="72" alt="Little Girl">
  <img src="assets/2d%20assets/thief.svg" width="72" alt="Thief">
  <img src="assets/2d%20assets/sheriff.svg" width="72" alt="Sheriff">
</p>

Werewolf, Villager, Seer, Witch, Hunter, Cupid, Little Girl and Thief, plus the
Sheriff, who is elected rather than dealt. Each role's power is in
[design/rules/02-roles.md](design/rules/02-roles.md).

## Tech stack

| Part | Choice |
|---|---|
| App | Next.js (React + TypeScript), exported as a static site |
| Back end | Firebase Realtime Database for rooms, cards and reveals |
| Players | Firebase Anonymous Auth: guests only, no login screen |
| Hosting | Firebase Hosting |
| Art | SVG cards, CSS animations for the flip and the attack |

There's no game server to run. Every phone runs the same web app and they stay in sync
through one shared room record in the database. Game logic and card data are kept apart
from the UI, so a native Unity version for the app stores can reuse them later.

## Project layout

```
assets/2d assets/     card art (SVG, plus the card back as PNG)
assets/screenshots/   the mockup screenshots used in this README
design/               app flow and architecture notes
design/rules/         rulebook: overview, roles, card mix, game flow, rulings
production/qa/        test evidence
```

## Design docs

- [design/companion-flow.md](design/companion-flow.md): the app flow, decisions, tech
  stack and open questions. Start here.
- [design/companion-architecture.md](design/companion-architecture.md): rooms, joining,
  dealing and reveal over Firebase, with the join link and QR code.
- [design/rules/](design/rules/): the rules, written from the physical game's booklet.

## Credits

Designed and developed by Kishan Kahodariya.
