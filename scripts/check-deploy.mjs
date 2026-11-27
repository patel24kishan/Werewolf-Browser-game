// Pre-deploy safety check for Firebase Hosting (`npm run deploy:check`, run by
// `npm run deploy`). Refuses to publish `out/` unless it is a fresh, Firebase-backed
// build for the project in .firebaserc. In particular it blocks the test-only memory
// build (`npm run build:memory`, also produced by the Playwright suite), which has no
// security rules behind it. Prints no config values.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
const MEMORY_MARKER = 'werewolf-companion-memory'; // MemoryBackend's channel name; absent from Firebase builds
const PAGES = ['index.html', 'join.html', 'play.html', 'host.html', '404.html'];

const problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else files.push({ path: p, mtimeMs: st.mtimeMs });
  }
  return files;
}

// 1. The static export exists and has every page.
if (!existsSync(out)) {
  fail('out/ does not exist. Run `npm run build` first.');
} else {
  for (const page of PAGES) if (!existsSync(join(out, page))) fail(`out/${page} is missing.`);
}

// 2. Firebase config for this project, and .firebaserc agrees with it.
const envFile = join(root, '.env.local');
let env = {};
if (!existsSync(envFile)) fail('.env.local is missing, so the build has no Firebase config.');
else env = parseEnv(readFileSync(envFile, 'utf8'));
const databaseUrl = (env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '').trim();
const projectId = (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim();
if (existsSync(envFile) && (!databaseUrl || !projectId)) fail('.env.local lacks NEXT_PUBLIC_FIREBASE_DATABASE_URL or _PROJECT_ID.');
if ((env.NEXT_PUBLIC_BACKEND ?? '').trim() === 'memory') fail('.env.local sets NEXT_PUBLIC_BACKEND=memory; live builds must leave it empty.');
const rcFile = join(root, '.firebaserc');
const rcProject = existsSync(rcFile) ? JSON.parse(readFileSync(rcFile, 'utf8'))?.projects?.default : undefined;
if (!rcProject) fail('.firebaserc has no default project.');
else if (projectId && rcProject !== projectId) fail('.firebaserc project does not match NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local.');

// 3. The bundle is a Firebase build of this project, not the memory test build.
if (existsSync(out)) {
  const files = walk(out);
  const scripts = files.filter((f) => f.path.endsWith('.js'));
  let hasMemory = false;
  let hasDatabaseUrl = false;
  for (const f of scripts) {
    const text = readFileSync(f.path, 'utf8');
    if (text.includes(MEMORY_MARKER)) hasMemory = true;
    if (databaseUrl && text.includes(databaseUrl)) hasDatabaseUrl = true;
  }
  if (scripts.length === 0) fail('out/ has no JavaScript bundle.');
  if (hasMemory) fail('out/ is the test-only memory build (no security rules behind it). Run `npm run build`.');
  if (databaseUrl && !hasDatabaseUrl) fail("out/ was not built with this project's database URL. Run `npm run build`.");

  // 4. The build is not older than the source it should contain.
  const built = statSync(join(out, 'index.html')).mtimeMs;
  const sources = ['src', 'public'].filter((d) => existsSync(join(root, d))).flatMap((d) => walk(join(root, d)));
  const newer = sources.filter((f) => f.mtimeMs > built);
  if (newer.length > 0) fail(`out/ is older than ${newer.length} source file(s), e.g. ${newer[0].path.slice(root.length + 1)}. Run \`npm run build\`.`);
}

if (problems.length > 0) {
  console.error('Deploy check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Deploy check passed: fresh Firebase build for project "${rcProject}", no test backend.`);
