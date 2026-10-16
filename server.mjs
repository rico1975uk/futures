// Local server: serves the static site and the AI write-up endpoint.
//   ANTHROPIC_API_KEY=... node server.mjs      (real AI write-ups)
//   AI_MOCK=1 node server.mjs                  (deterministic stand-in, no key needed)
//   node server.mjs                            (AI button reports "not available"; everything else works)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MOCK = process.env.AI_MOCK === '1' || process.argv.includes('--mock');
const HAS_KEY = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const STATIC = new Set(['index.html', 'css', 'js']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Small in-memory rate limit so a hosted copy can't be used to run up a bill.
const hits = new Map();
function limited(ip, max = Number(process.env.AI_RATE_LIMIT || 10), windowMs = 3600_000) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

const narrative = (HAS_KEY || MOCK) ? await import('./lib/narrative.mjs') : null;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/health') return send(res, 200, { ai: !!narrative, mock: MOCK });

  if (url.pathname === '/api/narrative') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    if (!narrative) return send(res, 503, { error: 'AI write-ups are not configured on this server.' });
    if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many AI write-ups from this device. Please try again later.' });
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 60_000) return send(res, 413, { error: 'Request too large' }); }
    try {
      const payload = JSON.parse(body);
      const out = MOCK ? narrative.mockNarrative(payload) : await narrative.generateNarrative(payload);
      return send(res, 200, out);
    } catch (err) {
      console.error('[narrative]', err.status || '', err.message);
      const status = err.status && err.status < 500 ? err.status : (err instanceof SyntaxError ? 400 : 502);
      return send(res, status, { error: status === 502 ? 'The AI service had a problem. Your main report is unaffected.' : err.message });
    }
  }

  // Static files (whitelisted top-level entries only).
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const top = rel.split('/')[0];
  const file = path.join(ROOT, rel);
  if (!STATIC.has(top) || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, () => console.log(`futures running at http://localhost:${PORT}  (AI: ${MOCK ? 'mock' : narrative ? 'on' : 'off'})`));
