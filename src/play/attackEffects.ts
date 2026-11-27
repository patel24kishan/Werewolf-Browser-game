'use client';
/**
 * Attack feedback for the victim's phone: haptics, a short generated sound
 * (iPhone has no `navigator.vibrate`) and the "already seen" memory.
 * Only the victim's own event ever reaches these functions.
 */
import { useEffect } from 'react';

/** Android vibration pattern: buzz, pause, long buzz. */
export const ATTACK_VIBRATION: readonly number[] = [200, 100, 300];

let audio: AudioContext | null = null;

/** Creates / resumes the AudioContext. Must run inside a user gesture to take effect. */
export function unlockAudio(): void {
  try {
    if (!audio) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
    }
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Unlocks audio on the first tap or key press on the page. */
export function useAudioUnlock(): void {
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);
}

/** A low growl: two falling tones. Returns false (silently) when audio was never unlocked. */
export function playAttackSound(): boolean {
  try {
    if (!audio || audio.state !== 'running') return false;
    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    gain.connect(audio.destination);
    for (const [from, to] of [
      [220, 70],
      [165, 55],
    ]) {
      const osc = audio.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now + 0.6);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.75);
    }
    return true;
  } catch {
    return false;
  }
}

/** Vibrates where supported, else plays the sound. Returns true when the phone vibrated. */
export function triggerAttackFeedback(): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && navigator.vibrate([...ATTACK_VIBRATION])) return true;
  } catch {
    // fall through to the sound
  }
  playAttackSound();
  return false;
}

/** sessionStorage key for the last attack this player has seen (room code + player id only). */
export function seenKey(code: string, playerId: string): string {
  return `ww-attack-seen:${code}:${playerId}`;
}

export function readSeen(code: string, playerId: string): number | null {
  try {
    const raw = sessionStorage.getItem(seenKey(code, playerId));
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeSeen(code: string, playerId: string, killedAt: number): void {
  try {
    sessionStorage.setItem(seenKey(code, playerId), String(killedAt));
  } catch {
    // Storage blocked: the animation may replay after a reload; nothing else breaks.
  }
}
