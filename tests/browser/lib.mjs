// Shared browser-test harness: static server over dist/ + playwright-core on @sparticuz/chromium (SwiftShader WebGL2).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium as pw } from 'playwright-core';
import sparticuz from '@sparticuz/chromium';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function serve(root, { onRequest } = {}) {
  const server = http.createServer((req, res) => {
    onRequest?.(req);
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

export async function launch(extra = {}) {
  const executablePath = await sparticuz.executablePath();
  return pw.launch({
    executablePath,
    args: [...sparticuz.args.filter((a) => !a.startsWith('--single-process')), '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
    headless: true,
    ...extra,
  });
}
