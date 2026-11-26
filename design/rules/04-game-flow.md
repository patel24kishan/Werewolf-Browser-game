# 04 · Game Flow

The game alternates **night** and **day** until one side wins. The first night has
extra setup steps. After that, every night and day follows the same standard turn.

```
Deal roles ──► FIRST NIGHT ──► DAY ──► NIGHT ──► DAY ──► ...  until a side wins
               (setup steps          (standard turn, repeated)
                + standard night)
```

## The first night only: setup steps

These run once, before the standard night, and only for roles that are in the deck.

| Step | Who wakes | What happens |
|---|---|---|
| A | **Thief** | Looks at the two leftover cards and may swap for one. Must swap if both are Werewolves. Goes back to sleep |
| B | **Cupid** | Chooses two lovers, possibly including themselves. The moderator secretly lets those two players know they have been chosen. Cupid goes back to sleep |
| C | **The lovers** | Wake together, see who their partner is, and go back to sleep. They do not see each other's cards |

## Every night: the standard night

| Step | Who wakes | What happens |
|---|---|---|
| 1 | **Seer** | Chooses one player and secretly sees their role. Goes back to sleep |
| 2 | **Werewolves** | Wake together, recognise each other and silently agree on one victim. While they are awake the **Little Girl** may peek. If the wolves catch her, she becomes the victim instead. Go back to sleep |
| 3 | **Witch** | Is shown the wolves' victim. May use the healing potion on that victim, the poison potion on any player, both, or neither. Goes back to sleep |

Nothing is announced during the night. All results are revealed at dawn.

## Every day

| Step | What happens |
|---|---|
| 4 · **Dawn** | Everyone wakes except whoever died in the night. Each dead player's card is turned face up and they leave the game. From now on they may not speak or signal. Death powers trigger now: a dead **Hunter** shoots, a dead **lover** takes their partner, a dead **Sheriff** names a successor. Check for a winner |
| *First day only* | Elect the **Sheriff**, at any point the moderator chooses before the vote |
| 5 · **Debate** | The survivors argue, accuse, defend and bluff. Anyone may claim any role, true or false. Noises in the night, odd behaviour and voting patterns are all evidence |
| 6 · **Vote** | On a signal, every living player points at the one player they want eliminated, all at the same time. The Sheriff's vote counts twice. The player with the most votes is eliminated, their card is revealed and they fall silent. **A tie eliminates nobody.** Death powers trigger. Check for a winner |
| 7 · **Night falls** | Everyone still alive closes their eyes. Return to step 1 |

## What each player is trying to do in the debate

- **Villagers** try to unmask a werewolf and vote them out.
- **Werewolves** try to pass as ordinary villagers.
- **The Seer and the Little Girl** try to guide the village without exposing
  themselves and handing the wolves a target.
- **The lovers** protect each other.

Everyone gives themselves away somehow. Every player has a tell.

## Complete call order, for reference

```
First night:   Thief → Cupid → Lovers → Seer → Werewolves (+ Little Girl) → Witch
Every night:   Seer → Werewolves (+ Little Girl) → Witch
Every day:     Dawn reveals → (Day 1: Sheriff election) → Debate → Vote → Night
```

Roles not in the deck are skipped. **Proposed** for the digital version: the app still
plays a short, fake wake-up for absent roles, so the length of the night does not give
away which roles are in the game.
