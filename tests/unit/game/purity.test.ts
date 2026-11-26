import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// src/game must port to C#/Unity: no framework, browser, Firebase, or ambient
// randomness/time. This scans the source text for forbidden references.
const GAME_DIR = fileURLToPath(new URL('../../../src/game', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const FORBIDDEN: [string, RegExp][] = [
  ['react import', /from\s+['"]react/],
  ['next import', /from\s+['"]next/],
  ['firebase import', /from\s+['"](firebase|@firebase)/],
  ['node import', /from\s+['"]node:/],
  ['Math.random', /Math\.random/],
  ['Date.now', /Date\.now/],
  ['new Date', /new\s+Date\b/],
  ['window', /\bwindow\./],
  ['document', /\bdocument\./],
  ['storage', /\b(localStorage|sessionStorage)\b/],
  ['performance.now', /performance\.now/],
];

describe('src/game purity', () => {
  const files = sourceFiles(GAME_DIR);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`contains no ${label}`, () => {
      const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});
