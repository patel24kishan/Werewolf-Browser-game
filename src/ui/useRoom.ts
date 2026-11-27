'use client';
/**
 * `useRoom(code)`: signs in once, opens the room through `src/net`, exposes its
 * live view with `useSyncExternalStore`, and closes it on unmount.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BackendNotConfiguredError, getBackend, isRoomCode, openRoom, type Room, type RoomView } from '@/net';

export const NOT_CONFIGURED_MESSAGE = "This copy of the app isn't connected to a game server yet.";

/** Plain-language text for a failure to reach the backend. */
export function backendErrorMessage(error: unknown): string {
  if (error instanceof BackendNotConfiguredError) return NOT_CONFIGURED_MESSAGE;
  return "Couldn't reach the game server. Check your connection and try again.";
}

export interface UseRoomResult {
  /** The open room, once signed in; null before that or for an invalid code. */
  room: Room | null;
  /** The current view, or null until the room is open. */
  view: RoomView | null;
  /** Set when sign-in or opening failed. */
  error: string | null;
}

/** Opens `code` (must match the room-code pattern, else nothing is opened). */
export function useRoom(code: string | null): UseRoomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code === null || !isRoomCode(code)) return;
    let cancelled = false;
    let opened: Room | null = null;
    void (async () => {
      try {
        const backend = getBackend();
        const myId = await backend.signIn();
        if (cancelled) return;
        opened = openRoom(backend, code, myId);
        setRoom(opened);
      } catch (e) {
        if (!cancelled) setError(backendErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      opened?.close();
      setRoom(null);
      setError(null);
    };
  }, [code]);

  const subscribe = useCallback((onChange: () => void) => (room ? room.subscribe(onChange) : () => undefined), [room]);
  const getSnapshot = useCallback(() => (room ? room.getView() : null), [room]);
  const view = useSyncExternalStore(subscribe, getSnapshot, () => null);

  return { room, view, error };
}
