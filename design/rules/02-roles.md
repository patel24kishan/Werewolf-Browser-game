# 02 · Roles

Each player is secretly dealt one role card. The Sheriff is the exception: it is a
title won by election, held on top of a player's real role. Card art for every role is
in `assets/2d assets/`.

| Role | Side | Acts | How often | Art |
|---|---|---|---|---|
| Werewolf | Werewolves | Every night | Every night | `werewolf.svg` |
| Simple Villager | Village | Never | — | `villager.svg` |
| Seer | Village | Every night | Every night | `seer.svg` |
| Witch | Village | Every night, after the wolves | Each potion once per game | `witch.svg` |
| Hunter | Village | When eliminated | Once | `hunter.svg` |
| Cupid | Village | First night only | Once | `cupid.svg` |
| Little Girl | Village | During the werewolves' turn | Every night, optional | `little-girl.svg` |
| Thief | Village, until they swap | First night only | Once | `thief.svg` |
| Sheriff (title) | Whoever is elected | During every vote | Every vote | `sheriff.svg` |

---

## Werewolf

**Power.** Every night the werewolves wake together, recognise each other, and agree
on one victim to kill.

**By day** they pretend to be ordinary villagers and steer suspicion elsewhere.

**Count.** 1, 2, 3 or 4 werewolves, set by the player count (see
[03-setup-and-card-mix.md](03-setup-and-card-mix.md)).

**If they cannot agree** on a victim, nobody is killed that night. In the app, the
player with the most wolf picks when the timer ends is the victim. A tie means no kill.

**Targets.** The wolves may choose any living player, even a fellow wolf.

**Advice.** Voting against a fellow werewolf can clear your own name, but only if the
village notices you did it.

## Simple Villager

**Power.** None. A villager has only their own judgement.

**Goal.** Read the other players' behaviour, work out who the werewolves are, and
avoid being mistaken for one and voted out.

## Seer

**Power.** Every night the Seer chooses one player and secretly learns that player's
true role.

**Goal.** Steer the village toward the werewolves without revealing they are the Seer.
Once the wolves know, the Seer becomes their next target.

**Advice.** Once you have found a werewolf, think hard before revealing yourself. It
can be worth it to expose a wolf, but doing it too early usually costs the village its
best source of information.

## Witch

**Power.** The Witch has two potions, and each can be used **once per game**:

- **Healing potion.** Brings back the player the werewolves just killed, so they
  survive the night.
- **Poison potion.** Kills any one player during the night.

Each night, after the werewolves choose, the Witch is shown their victim and decides
whether to use either potion. The Witch may use a potion on themselves, and may use
neither, one or both in the same night. Because of the Witch, a night can end with
nobody dead or with two players dead.

**Advice.** The Witch grows stronger as the game goes on. Do not spend the potions
early.

## Hunter

**Power.** When the Hunter is eliminated in any way, by the werewolves, the village
vote, the Witch's poison or a lover's grief, they immediately shoot one other player
of their choice, who is also eliminated.

**Advice.** Keep your role hidden. If the werewolves know who the Hunter is, they will
leave you alone and you will never get your shot.

## Cupid

**Power.** On the first night only, Cupid chooses two players to fall in love for the
rest of the game. Cupid may choose themselves as one of the two.

**The lovers.**

- The two lovers learn who each other is, but **not** each other's role.
- If one lover dies, the other immediately dies of grief.
- A lover may never vote to eliminate their partner, not even as a bluff.
- If the lovers are one werewolf and one villager, their goal changes: they must be
  the last two players alive, which means eliminating everyone else on both sides.
  While such a couple lives, neither team can win.

**Advice.** If you pick yourself as a lover, do not pick a loudmouth as your partner.

## Little Girl

**Power.** During the werewolves' turn, the Little Girl may secretly peek to see who
the werewolves are. She never has to.

**Risk.** If the werewolves catch her peeking, she dies of fright at once, silently,
**instead of** the victim they chose.

**Table rule.** While she is in the game, nobody may hide their face at night, so that
peeking is possible and can be caught.

**Advice.** She is powerful but nerve-wracking. Peek early. If you wait too long, you
may be killed before you learn anything useful.

> Peeking is a physical act at a table. The digital version needs its own mechanic for
> it. See [07-digital-adaptation.md](07-digital-adaptation.md).

## Thief

**Setup.** When the Thief is used, two extra Simple Villager cards go into the deck.
After dealing one card to each player, the two leftover cards are placed face-down in
the middle.

**Power.** On the first night the Thief looks at the two leftover cards and may swap
their own card for one of them. If **both** leftover cards are Werewolves, the Thief
**must** swap for one.

**After swapping,** the Thief becomes that role for the rest of the game, with its
side, powers and goal.

## Sheriff (title)

**How it is given.** The Sheriff card is not dealt. The players elect a Sheriff by a
village vote, and the player with the most votes wins the title. The moderator may hold
the election at any point on the first day, which gives players time to size each other
up. The elected player cannot refuse.

**Power.** The Sheriff's vote counts as **two votes**, always cast together on one
player. It cannot be split.

**Succession.** When the Sheriff is eliminated, they name a successor with their last
breath, and that player becomes the new Sheriff.

**Advice.** Run for Sheriff. If you are a werewolf, do not campaign too openly for it.

---

## Who knows what at the start

| Player | Knows |
|---|---|
| Every player | Their own role |
| Werewolves | Each other, from the first night |
| Lovers | Each other's identity from the first night, but not each other's role |
| Thief | The two leftover cards, on the first night |
| Seer | One more player's role each night |
