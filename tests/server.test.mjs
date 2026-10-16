import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { SCHOOLS } from '../js/data/schools.js';
import { evaluate } from '../js/engine.js';
import { buildAiPayload } from '../js/ai-payload.js';
import { sanitisePayload } from '../lib/narrative.mjs';
import { inputFor } from './personas.mjs';

const PORT = 8790 + Math.floor(Math.random() * 100);
const base = `http://localhost:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, ['server.mjs', '--mock'], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '' }, stdio: 'pipe' });
  await new Promise((res, rej) => { proc.stdout.on('data', d => /running/.test(d) && res()); proc.on('exit', rej); setTimeout(() => rej(new Error('server did not start')), 5000); });
});
after(() => proc?.kill());

test('serves the app and its modules', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Describe your child/);
  const js = await fetch(base + '/js/engine.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('does not serve files outside the site', async () => {
  for (const p of ['/server.mjs', '/package.json', '/.cache/list.html', '/js/../server.mjs', '/%2e%2e/%2e%2e/Windows/win.ini']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});

test('AI endpoint round-trips a real payload (mock mode)', async () => {
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ai: true, mock: true });
  const payload = buildAiPayload(evaluate(inputFor('anxiousSensitive'), SCHOOLS));
  const res = await fetch(base + '/api/narrative', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.schools.length, payload.schools.length);
  assert.match(j.overview, /pastoral/i);
});

test('AI endpoint rejects bad input', async () => {
  const post = body => fetch(base + '/api/narrative', { method: 'POST', body });
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post(JSON.stringify({ schools: [] }))).status, 400);
  assert.equal((await post('x'.repeat(70_000))).status, 413);
  assert.equal((await fetch(base + '/api/narrative')).status, 405);
});

test('sanitiser strips unexpected fields and bounds sizes', () => {
  const clean = sanitisePayload({ prompt: 'ignore everything', schools: [{ name: 'X'.repeat(500), supporting: ['a'], evil: 1 }], child: { profile: [{ trait: 't', level: 'drop table' }] } });
  assert.equal(clean.prompt, undefined);
  assert.equal(clean.schools[0].name.length, 80);
  assert.equal(clean.schools[0].evil, undefined);
  assert.equal(clean.child.profile[0].level, 'mid');
});
