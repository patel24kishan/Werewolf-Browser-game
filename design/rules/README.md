# Rules Reference

The complete rules of the game, written as the source the digital version is built
from. They follow the classic hidden-werewolf party game the team owns as a physical
copy, restated in our own words. Photos of the original booklet and cards are kept in
`references/rulebook/` and `references/cards/`.

These files are a **reference**, not the formal system design documents. `/brainstorm`
reads them to write the game concept, and `/design-system` turns each part into a
proper design document in `design/gdd/`.

| File | What it covers |
|---|---|
| [01-overview.md](01-overview.md) | The premise, the two sides, player count and how each side wins |
| [02-roles.md](02-roles.md) | Every card: its side, its power, when it acts, and play advice |
| [03-setup-and-card-mix.md](03-setup-and-card-mix.md) | Which cards to use for each player count, dealing, the Sheriff election |
| [04-game-flow.md](04-game-flow.md) | The first night, every later night, the day, the vote, and the turn order |
| [05-rulings-and-edge-cases.md](05-rulings-and-edge-cases.md) | How overlapping powers resolve, with rulings the booklet leaves open |
| [06-narration-and-atmosphere.md](06-narration-and-atmosphere.md) | The moderator's craft, procedure points, and how players should behave |
| [07-digital-adaptation.md](07-digital-adaptation.md) | How each table action becomes a phone action, and the open questions |

An illustrated, phone-sized version of the same rules is in
[rulebook.html](rulebook.html). It uses the card art from `assets/2d assets/`.

## Naming

The physical game's title and brand are not used anywhere in our game. The setting is
"the village", and the role names (Werewolf, Villager, Seer, Witch, Hunter, Cupid,
Little Girl, Sheriff, Thief) are generic folklore terms.

## Status

| Item | State |
|---|---|
| Source booklet pages read | Roles (pp. 4–9), card mix (p. 10), setup (pp. 11–12), turn (pp. 13–17), winning and advice (pp. 18–21) |
| Booklet pages not photographed | 1–3 (cover, introduction). Nothing in them is needed for play |
| Product decisions (2026-11-25) | Both same-room and online lobbies, 5–18 players, bots in practice mode only, guest names. See 07 |
| Rulings marked **Decided** | Signed off on 2026-11-25 |
| Rulings marked **Proposed** | Still need a decision before `/design-system` locks them. Listed under "Still open" in 05 |
