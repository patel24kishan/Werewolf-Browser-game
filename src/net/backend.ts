/**
 * Picks the backend for the running app. Safe in a static-export client bundle:
 * no Node-only imports, and `process.env.NEXT_PUBLIC_BACKEND` is inlined by
 * Next.js at build time. Call it from the browser (an effect or event handler),
 * not during prerendering.
 */
import { MemoryBackend } from './MemoryBackend';
import type { RoomBackend } from './RoomBackend';

let instance: RoomBackend | null = null;

/**
 * The app's single `RoomBackend` (created on first call, then reused).
 *
 * - `NEXT_PUBLIC_BACKEND=memory`: a `MemoryBackend` synced across this
 *   browser's tabs; the guest id is per tab.
 * - Otherwise: throws until feature 4 adds the Firebase backend.
 */
export function getBackend(): RoomBackend {
  if (instance) return instance;
  if (process.env.NEXT_PUBLIC_BACKEND === 'memory') {
    instance = new MemoryBackend();
    return instance;
  }
  throw new Error(
    'Firebase backend not configured yet. Set NEXT_PUBLIC_BACKEND=memory to use the in-memory backend.',
  );
}
