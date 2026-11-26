# 05 · Rulings and Edge Cases

The booklet covers the core rules. A digital version must resolve every combination
of powers without a human moderator to make a judgement call. Each ruling below is
marked:

- **Booklet**: stated in the source rules.
- **Decided**: our ruling for a case the booklet leaves open, signed off on
  2026-11-25.
- **Proposed**: our ruling for a case the booklet leaves open. It still needs
  sign-off before `/design-system` locks it.

## Night resolution

| Case | Ruling | Source |
|---|---|---|
| Werewolves cannot agree on a victim | Nobody is killed by the wolves tonight | Booklet |
| How the app decides the wolves' victim | When the wolves' timer ends, the player with the most wolf picks is the victim. A tie, or no picks at all, means no kill | Decided |
| Can the wolves target a werewolf? | Yes. Any living player is a valid target, including a fellow wolf. This allows a sacrifice gambit | Decided |
| The Little Girl is caught peeking | She dies instead of the chosen victim. The chosen victim survives | Booklet |
| The Witch's view when the Little Girl was caught | The Witch is shown the Little Girl as the victim, because she is the one dying | Proposed |
| The Witch heals the victim | The victim survives. Nobody dies from the wolves tonight | Booklet |
| The Witch uses both potions in one night | Allowed. The heal saves the wolves' victim and the poison kills a second player | Booklet |
| The Witch poisons the wolves' victim | Allowed but wasteful. One death | Proposed |
| The Witch heals or poisons herself | Allowed | Booklet |
| The Witch has already used her healing potion | She is still woken and shown the victim, so her turn takes the same time every night | Proposed |
| The Seer is killed on the night they look | The Seer still sees the result, because their turn comes first. They die at dawn | Proposed |
| The Seer looks at the Thief after a swap | They see the Thief's current role, not "Thief" | Booklet (the Thief becomes that role) |

## Deaths and chain reactions

Deaths are revealed at dawn, or right after the vote, and then resolved one at a time
in this order until nothing else triggers:

1. Reveal each eliminated player's card.
2. **Lover grief.** If an eliminated player had a lover still alive, the lover dies.
3. **Hunter's shot.** Each eliminated Hunter shoots one living player, who is then
   eliminated. Go back to step 1 for that player.
4. **Sheriff succession.** If the Sheriff was eliminated, they name a living
   successor.
5. **Win check.**

| Case | Ruling | Source |
|---|---|---|
| The Hunter shoots one of the lovers | The other lover dies of grief too | Booklet (grief is immediate) |
| A lover who is the Hunter dies of grief | The Hunter still gets their shot | Decided |
| The Hunter is killed by the Witch's poison | The Hunter still shoots. Any elimination counts | Decided |
| The Hunter does not shoot before their timer ends | No shot is taken. The alternative, a random target, is still open | Proposed |
| The Hunter and the Sheriff are the same player | Shoot first, then name a successor | Proposed |
| The Sheriff dies at night | They name a successor at dawn, when their death is revealed | Proposed |
| The Sheriff's chosen successor dies in the same chain | The successor chooses again, or it passes at random if nobody is left to choose | Proposed |

## The vote

| Case | Ruling | Source |
|---|---|---|
| Tie for most votes | Nobody is eliminated | Booklet |
| The Sheriff's double vote | Always two votes on one player, never split | Booklet |
| A lover votes for their partner | Not allowed. In the app, the partner cannot be selected | Booklet |
| A player does not vote before the timer ends | Their vote counts for nobody. The alternative, a random vote, is still open | Proposed |
| Tie in the Sheriff election | Revote between the tied players only. If still tied, one of them is picked at random | Decided |
| Dead players | Do not vote and do not speak for the rest of the game | Booklet |

## Thief

| Case | Ruling | Source |
|---|---|---|
| Both leftover cards are Werewolves | The Thief must take one | Booklet |
| The Thief takes Cupid | They act as Cupid in the Cupid step that same night, because the Thief wakes first | Proposed |
| The Thief takes a Werewolf | They wake with the wolves from that first night on | Proposed |
| The card the Thief gives up | Leaves the game unseen. Nobody plays it | Proposed |

## Lovers

| Case | Ruling | Source |
|---|---|---|
| Lovers on the same team | They keep their team's goal and win or lose with it. They must still protect each other | Booklet |
| Lovers on opposite teams | They win only as the last two alive. If either team wins first, they lose | Booklet |
| A werewolf lover's own pack | The werewolf lover still wakes with the pack, but must not let them kill their partner | Proposed |
| Cupid makes themselves a lover | Allowed | Booklet |

## Winning, precisely

Checked after every full resolution, day or night:

```
wolves_alive   = living Werewolves (not counting a werewolf in a mixed couple)
village_alive  = living village-side players (not counting a villager in a mixed couple)
mixed_couple   = both lovers alive AND on opposite sides

if mixed_couple AND only the two lovers are alive  → Lovers win
else if wolves_alive == 0 AND village_alive >= 1   → Village wins
else if village_alive == 0 AND wolves_alive >= 1   → Werewolves win
else if nobody is alive                            → Nobody wins (draw)   [Proposed]
otherwise                                          → keep playing
```

**Decided:** while a mixed couple is alive, both lovers count as neither side, so
neither team can win while the couple survives. The game continues until the couple
dies or they are the last two alive.

## Still open

These remain **Proposed** until signed off:

- Timeouts: an unsent vote counts for nobody, and a Hunter who runs out of time loses
  the shot.
- Fake wake-ups for roles not in the deck (see [04-game-flow.md](04-game-flow.md)).
- The Thief's discarded card leaves the game unseen.
- The Witch is shown a caught Little Girl as the night's victim.
- A game where nobody is left alive is a draw.
- Every other row above marked **Proposed**.
