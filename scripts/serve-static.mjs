/** Serves the repo over http so the built testbed is reachable at /testbed/. */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8080);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolvePath(urlPath) {
  const decoded = normalize(decodeURIComponent(urlPath));
  const target = resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(root + sep)) return undefined;
  try {
    const file = statSync(target).isDirectory() ? join(target, 'index.html') : target;
    statSync(file);
    return file;
  } catch {
    return undefined;
  }
}

const server = createServer((req, res) => {
  const path = resolvePath(new URL(req.url ?? '/', 'http://localhost').pathname);
  if (!path) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(path)
    .on('error', () => res.end())
    .pipe(res);
});

/** Takes the next free port when the preferred one is busy. */
let attempt = 0;
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE' || attempt >= 10) throw err;
  attempt += 1;
  server.listen(port + attempt);
});
server.on('listening', () => console.log(`testbed on http://localhost:${port + attempt}/testbed/`));
server.listen(port);
