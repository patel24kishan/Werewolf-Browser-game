import { getBackend, openRoom } from '@/net';
import { backendErrorMessage } from '@/ui/useRoom';
import type { RoomCheck } from './CodeStep';

const LOOKUP_TIMEOUT_MS = 10_000;

/** Plain-words message for a game that cannot be joined, or null when it can. */
export function joinBlocker(code: string, exists: boolean, status: string | undefined): string | null {
  if (!exists) return `No game with code ${code}`;
  if (status !== 'lobby') return 'That game has already started.';
  return null;
}

/** Looks a game up through `src/net`: does it exist, and is it still in the lobby? */
export async function checkRoom(code: string): Promise<RoomCheck> {
  let room: ReturnType<typeof openRoom> | null = null;
  try {
    const backend = getBackend();
    const myId = await backend.signIn();
    room = openRoom(backend, code, myId, { presence: false });
    const view = await Promise.race([
      room.whenLoaded(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)),
    ]);
    if (view === null) return { ok: false, message: "Couldn't reach the game server. Check your connection and try again." };
    const message = joinBlocker(code, view.exists, view.state?.meta.status);
    return message === null ? { ok: true } : { ok: false, message };
  } catch (e) {
    return { ok: false, message: backendErrorMessage(e) };
  } finally {
    room?.close();
  }
}
