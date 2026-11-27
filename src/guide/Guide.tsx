'use client';
/**
 * "How to play": a full-screen dialog with a sticky header, a chip bar that
 * jumps to each section, and static content from `design/rules/`. Roles and
 * the card mix are rendered from the game data JSON, never retyped.
 */
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { ROLE_IDS, ROLES, THIEF_EXTRA_VILLAGERS } from '@/game';
import cardMixData from '@/game/data/card-mix.json';

interface MixRow {
  readonly werewolves: number;
  readonly seer: number;
  readonly villagers: number;
}

const MIX_ROWS: readonly { players: number; row: MixRow }[] = Object.entries(cardMixData as Record<string, MixRow>)
  .map(([players, row]) => ({ players: Number(players), row }))
  .sort((a, b) => a.players - b.players);

/** Below this the original rules give no mix; the app's own is proposed (rules 03). */
const SMALL_LOBBY_MAX = 7;

const SECTIONS = [
  { id: 'goal', chip: 'Goal' },
  { id: 'roles', chip: 'Roles' },
  { id: 'round', chip: 'A round' },
  { id: 'rules', chip: 'Rules' },
  { id: 'mix', chip: 'Card mix' },
  { id: 'app', chip: 'Using the app' },
  { id: 'tips', chip: 'Tips' },
] as const;

export interface GuideProps {
  onClose: () => void;
}

export function Guide({ onClose }: GuideProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sid = (id: string) => `${uid}-${id}`;

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function jump(id: string) {
    const heading = document.getElementById(`${sid(id)}-h`);
    if (!heading) return;
    heading.closest('section')?.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll<HTMLElement>('button');
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const heading = (id: string, text: string) => (
    <h2 id={`${sid(id)}-h`} className="guide__h" tabIndex={-1}>
      {text}
    </h2>
  );

  return (
    <div ref={dialogRef} className="guide" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="guide__top">
        <div className="guide__bar">
          <h1 id={titleId} className="title title--md">
            How to play
          </h1>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Close guide" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav aria-label="Guide sections" className="guide__chips">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="guide__chip" onClick={() => jump(s.id)}>
              {s.chip}
            </button>
          ))}
        </nav>
      </div>
      <div className="guide__scroll">
        <div className="guide__body">
          <section className="guide__sec">
            {heading('goal', 'The goal')}
            <p>
              Werewolves are hiding among the villagers. Every night they kill someone. Every day the village votes to eliminate a suspect. Nobody&apos;s card is
              shown until they are out, so anyone can lie.
            </p>
            <p className="guide__win guide__win--village">
              <b>The village wins</b> when every werewolf is eliminated and at least one villager is alive.
            </p>
            <p className="guide__win guide__win--wolves">
              <b>The werewolves win</b> when the last villager is eliminated and at least one werewolf is alive.
            </p>
            <p className="guide__note">
              Eliminated players still win if their side wins. Lovers who are one werewolf and one villager win only if they are the last two alive.
            </p>
          </section>

          <section className="guide__sec">
            {heading('roles', 'The roles')}
            <ul className="guide__roles">
              {ROLE_IDS.map((id) => {
                const role = ROLES[id];
                return (
                  <li key={id} className="guide__role">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/cards/${role.art}`} alt="" width={64} height={64} loading="lazy" />
                    <div>
                      <p className="guide__role-name">{role.name}</p>
                      <p className="guide__role-power">{role.power}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="guide__note">
              The Sheriff is optional. The card is not dealt: the table elects one out loud after the deal, and the host hands over the title.
            </p>
          </section>

          <section className="guide__sec">
            {heading('round', 'A round')}
            <div className="guide__card">
              <h3>First night only</h3>
              <p>The Thief may swap for one of two spare cards. Cupid picks two lovers, who wake and see each other.</p>
            </div>
            <div className="guide__card">
              <h3>Every night</h3>
              <ol>
                <li>The Seer secretly learns one player&apos;s role.</li>
                <li>The werewolves silently pick a victim. The Little Girl may peek, and dies instead if caught.</li>
                <li>The Witch sees the victim and may heal them, poison someone, both, or neither.</li>
              </ol>
            </div>
            <div className="guide__card">
              <h3>Every day</h3>
              <ol>
                <li>Dawn: the night&apos;s dead are revealed and fall silent.</li>
                <li>On the first day, the village may elect a Sheriff.</li>
                <li>Debate: accuse, defend, bluff.</li>
                <li>Vote: everyone points at once. The most votes is out. A tie eliminates nobody.</li>
                <li>Night falls and it starts again.</li>
              </ol>
            </div>
          </section>

          <section className="guide__sec">
            {heading('rules', 'Rules')}
            <div className="guide__card">
              <h3>Setup</h3>
              <ul>
                <li>One person moderates. In this app that is the host.</li>
                <li>Everyone gets one card and looks at it in secret.</li>
                <li>With the Thief in play, the deck has {THIEF_EXTRA_VILLAGERS} extra Villager cards. The two left over are the spare cards.</li>
              </ul>
            </div>
            <div className="guide__card">
              <h3>At night</h3>
              <ul>
                <li>Everyone closes their eyes. Only the role being called opens them.</li>
                <li>If the werewolves cannot agree, nobody dies.</li>
                <li>The Little Girl may peek only while the werewolves are awake. While she is in play, nobody covers their face.</li>
                <li>The Witch uses each potion once per game, on anyone including herself, and may use both in one night.</li>
              </ul>
            </div>
            <div className="guide__card">
              <h3>During the day</h3>
              <ul>
                <li>Anyone who died shows their card and stays silent for the rest of the game.</li>
                <li>Anyone may claim to be any role, truthfully or not.</li>
                <li>The Sheriff&apos;s vote counts as two. When the Sheriff dies, they name the next one.</li>
              </ul>
            </div>
            <div className="guide__card">
              <h3>Special rules</h3>
              <ul>
                <li>
                  <b>Hunter:</b> when eliminated, by night or by vote, immediately shoots one other player.
                </li>
                <li>
                  <b>Lovers:</b> if one dies, the other dies too. A lover can never vote against their partner.
                </li>
                <li>
                  <b>Thief:</b> must swap if both spare cards are Werewolves.
                </li>
              </ul>
            </div>
          </section>

          <section className="guide__sec">
            {heading('mix', 'Card mix')}
            <p>The app fills this in for you.</p>
            <div className="guide__table-wrap">
              <table className="guide__table">
                <caption>Base cards for each player count</caption>
                <thead>
                  <tr>
                    <th scope="col">Players</th>
                    <th scope="col">Werewolves</th>
                    <th scope="col">Seer</th>
                    <th scope="col">Villagers</th>
                  </tr>
                </thead>
                <tbody>
                  {MIX_ROWS.map(({ players, row }) => (
                    <tr key={players}>
                      <th scope="row">
                        <span>{players}</span>
                        {players <= SMALL_LOBBY_MAX ? <span className="guide__tag">small lobby</span> : null}
                      </th>
                      <td>{row.werewolves}</td>
                      <td>{row.seer}</td>
                      <td>{row.villagers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="guide__notes">
              <li>Each special role replaces a Villager.</li>
              <li>The Thief adds {THIEF_EXTRA_VILLAGERS} extra Villagers.</li>
              <li>The small-lobby mixes (under 8 players) are this app&apos;s own suggestion, as the original rules give none.</li>
            </ul>
          </section>

          <section className="guide__sec">
            {heading('app', 'Using the app')}
            <ol className="guide__steps">
              <li>The host creates a session and shares the code or QR.</li>
              <li>Everyone joins with a name and taps Ready.</li>
              <li>The host picks the cards and deals. Your card arrives face down.</li>
              <li>Tap your card to flip it. Tap again to hide it.</li>
              <li>If the Sheriff is on, the table elects one out loud and the host gives them the title.</li>
              <li>The host narrates the night out loud, then marks the werewolves&apos; victim and taps Confirm.</li>
              <li>At dawn the host taps Reveal. The victim&apos;s phone shakes and shows the attack.</li>
              <li>When a side wins, Game over appears on every phone and the host can hand over to a new game.</li>
            </ol>
          </section>

          <section className="guide__sec">
            {heading('tips', 'Tips')}
            <ul className="guide__steps">
              <li>
                <b>Host:</b> atmosphere is everything. Build suspense and draw out the reveals.
              </li>
              <li>
                <b>Host:</b> never hint at who woke up, and do not turn toward a role when calling it.
              </li>
              <li>
                <b>New groups:</b> start with Werewolves, the Seer and Villagers, then add roles.
              </li>
              <li>
                <b>Everyone:</b> keep your phone screen to yourself.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
