import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 8790 + Math.floor(Math.random() * 100);
const base = `http://localhost:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((res, rej) => { proc.stdout.on('data', d => /running/.test(d) && res()); proc.on('exit', rej); setTimeout(() => rej(new Error('server did not start')), 5000); });
});
after(() => proc?.kill());

test('serves the app and its modules', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Describe your child/);
  assert.match(html, /Dig deeper with your own AI/);
  for (const m of ['engine', 'prompts', 'report', 'app', 'questions', 'data/schools']) {
    const js = await fetch(`${base}/js/${m}.js`);
    assert.equal(js.status, 200, m);
    assert.match(js.headers.get('content-type'), /javascript/);
  }
});

test('does not serve files outside the site', async () => {
  for (const p of ['/server.mjs', '/package.json', '/.cache/list.html', '/js/../server.mjs', '/%2e%2e/%2e%2e/Windows/win.ini', '/api/narrative']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});
