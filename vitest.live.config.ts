import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Live rules check against the real Firebase project in `.env.local`
// (`npm run test:live`). Never part of `npm test`. Only NEXT_PUBLIC_ values are
// passed to the test, and they are never printed.
const envFile = fileURLToPath(new URL('./.env.local', import.meta.url));
const env: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    if (key.startsWith('NEXT_PUBLIC_') && typeof value === 'string') env[key] = value;
  }
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    env,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
