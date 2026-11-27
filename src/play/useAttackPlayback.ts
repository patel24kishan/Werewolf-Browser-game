'use client';
import { useEffect, useState } from 'react';
import { readSeen, triggerAttackFeedback, writeSeen } from './attackEffects';

/** How long the claw slashes and the flash last. */
export const ATTACK_MS = 1200;

export interface AttackPlayback {
  /** True for ~1.2 s when this attack has not been seen before. */
  playing: boolean;
  /** True when the phone could not vibrate: the flash is stronger instead. */
  strong: boolean;
}

/**
 * Plays the attack once per `killedAt`. The seen timestamp lives in sessionStorage
 * so a reload shows the dead state directly. Haptics fire only here.
 */
export function useAttackPlayback(code: string, playerId: string, killedAt: number | undefined): AttackPlayback {
  const [state, setState] = useState<AttackPlayback>({
    playing: false,
    strong: false,
  });

  useEffect(() => {
    if (killedAt === undefined || readSeen(code, playerId) === killedAt) return;
    writeSeen(code, playerId, killedAt);
    const vibrated = triggerAttackFeedback();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off reaction to the attack event arriving
    setState({ playing: true, strong: !vibrated });
  }, [code, playerId, killedAt]);

  const { playing } = state;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setState((s) => ({ ...s, playing: false })), ATTACK_MS);
    return () => clearTimeout(timer);
  }, [playing]);

  return state;
}
