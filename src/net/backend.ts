/**
 * Picks the backend for the running app. Safe in a static-export client bundle:
 * no Node-only imports, and every `process.env.NEXT_PUBLIC_*` below is written
 * out literally so Next.js inlines it at build time. Neither backend touches
 * the network until it is used. Call it from the browser (an effect or event
 * handler), not during prerendering.
 */
import { BackendNotConfiguredError } from './errors';
import { FirebaseBackend, type FirebaseConfig } from './FirebaseBackend';
import { MemoryBackend } from './MemoryBackend';
import type { RoomBackend } from './RoomBackend';

let instance: RoomBackend | null = null;

/**
 * The Firebase web config from the build-time environment.
 *
 * @throws BackendNotConfiguredError naming every missing variable (names only, never values).
 */
export function readFirebaseConfig(): FirebaseConfig {
  // Literal references: Next.js only inlines `process.env.NEXT_PUBLIC_X` written out in full.
  const values = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([name]) => name);
  if (missing.length > 0) throw new BackendNotConfiguredError(missing);
  return {
    apiKey: values.NEXT_PUBLIC_FIREBASE_API_KEY!.trim(),
    authDomain: values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!.trim(),
    databaseURL: values.NEXT_PUBLIC_FIREBASE_DATABASE_URL!.trim(),
    projectId: values.NEXT_PUBLIC_FIREBASE_PROJECT_ID!.trim(),
    appId: values.NEXT_PUBLIC_FIREBASE_APP_ID!.trim(),
  };
}

/**
 * The app's single `RoomBackend` (created on first call, then reused).
 *
 * - `NEXT_PUBLIC_BACKEND=memory`: a `MemoryBackend` synced across this
 *   browser's tabs; the guest id is per tab.
 * - Otherwise: a `FirebaseBackend` built from the `NEXT_PUBLIC_FIREBASE_*`
 *   variables (see `.env.local.example`).
 *
 * @throws BackendNotConfiguredError when Firebase is selected but its config is
 *   incomplete (nothing is cached, so a later call can succeed).
 */
export function getBackend(): RoomBackend {
  if (instance) return instance;
  if (process.env.NEXT_PUBLIC_BACKEND === 'memory') {
    instance = new MemoryBackend();
    return instance;
  }
  instance = new FirebaseBackend(readFirebaseConfig());
  return instance;
}
