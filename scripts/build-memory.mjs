import { spawnSync } from 'node:child_process';

// Cross-platform: run `npm run build` with NEXT_PUBLIC_BACKEND=memory.
const result = spawnSync('npm run build', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_BACKEND: 'memory' },
});
process.exit(result.status ?? 1);
