import { ROOM_CODE_PATTERN } from '@/net';

/** Paths a join link may have: the exported page can be served with a slash or `.html`. */
const JOIN_PATHS = new Set(['/join', '/join/', '/join.html']);

/**
 * Reads a scanned QR text. Returns the room code only when the text is a URL on
 * the SAME origin as the app, with path `/join` and a `code` that matches the
 * room-code pattern (case-insensitive; the result is uppercase). Anything else
 * returns null. The scanned URL itself is never followed.
 */
export function parseJoinQr(text: string, origin: string): string | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(text.trim());
    base = new URL(origin);
  } catch {
    return null;
  }
  if (url.origin !== base.origin || url.origin === 'null') return null;
  if (!JOIN_PATHS.has(url.pathname)) return null;
  const code = url.searchParams.get('code')?.toUpperCase();
  if (code === undefined || !ROOM_CODE_PATTERN.test(code)) return null;
  return code;
}
