import type { RoomError } from '@/net';

/** Plain-words text for a failed `join` dispatch. */
export function joinErrorMessage(error: Pick<RoomError, 'code' | 'message'>, code: string): string {
  switch (error.code) {
    case 'name-taken':
      return 'That name is taken. Try another.';
    case 'invalid-name':
      return 'Names need 1 to 12 characters.';
    case 'wrong-status':
      return 'That game has already started.';
    case 'room-full':
      return 'That game is full.';
    case 'room-missing':
      return `No game with code ${code}`;
    default:
      return "Couldn't join. Try again.";
  }
}
