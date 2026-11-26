import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3417; // dedicated port; 3100 is used by another local project
const HOST = '127.0.0.1';
const OUT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'out'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function isInside(p) {
  return p === OUT || p.startsWith(OUT + sep);
}

function isFile(p) {
  return existsSync(p) && statSync(p).isFile();
}

// Maps a URL path to a file inside out/, or null. /join -> join.html or join/index.html.
function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded.split('/').includes('..')) return null;
  const target = resolve(join(OUT, '.' + decoded));
  if (!isInside(target)) return null;

  const candidates = decoded.endsWith('/')
    ? [join(target, 'index.html')]
    : [target, target + '.html', join(target, 'index.html')];
  for (const c of candidates) {
    const abs = resolve(c);
    if (isInside(abs) && isFile(abs)) return abs;
  }
  return null;
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const file = resolveFile(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => console.log(`Serving out/ at http://${HOST}:${PORT}`));
