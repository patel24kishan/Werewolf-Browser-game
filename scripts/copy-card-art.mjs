import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', '2d assets');
const dest = join(root, 'public', 'cards');

mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.svg') || f === 'card-back.png');
for (const f of files) cpSync(join(src, f), join(dest, f), { force: true });
console.log(`copy-card-art: copied ${files.length} files to public/cards/`);
