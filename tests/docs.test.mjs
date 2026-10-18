// Keeps the documentation honest: fails if docs drift from the code they describe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { METHOD } from '../js/engine.js';
import { DIMENSIONS, OBSERVATIONS } from '../js/questions.js';
import { SCHOOLS } from '../js/data/schools.js';
import { buildGuide } from '../scripts/build-guide.mjs';

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('METHODOLOGY.md constants match the engine', () => {
  const block = read('docs/METHODOLOGY.md').match(/```json method\n([\s\S]*?)```/);
  assert.ok(block, 'machine-checked block present');
  assert.deepEqual(JSON.parse(block[1]), METHOD);
});

test('documented counts match the code and data', () => {
  const method = read('docs/METHODOLOGY.md');
  const readme = read('README.md');
  const items = DIMENSIONS.flatMap(d => d.items).length;
  assert.match(method, new RegExp(`${items} parent-rated statements on a 1–5 scale across ${DIMENSIONS.length} traits`));
  assert.match(method, new RegExp(`then ${OBSERVATIONS.length} \\*\\*specific observations\\*\\*`));
  assert.match(method, new RegExp(`among the ${SCHOOLS.filter(s => s.entryYear === 7).length} Bristol-area schools`));
  assert.match(readme, new RegExp(`${SCHOOLS.length} state secondaries`));
  assert.match(readme, new RegExp(`${items} everyday statements across ${DIMENSIONS.length} dimensions`));
});

test('docs link only to files that exist', () => {
  for (const f of ['README.md', 'parent_readme.md', 'docs/METHODOLOGY.md', 'docs/DECISIONS.md', 'docs/DATA.md']) {
    const dir = new URL(`../${f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : ''}`, import.meta.url);
    for (const [, href] of read(f).matchAll(/\]\(((?!https?:|#)[^)#\s]+)/g)) {
      assert.ok(fs.existsSync(new URL(href, dir)), `${f} links to missing ${href}`);
    }
  }
});

test('guide.html is built from the current parent_readme.md', () => {
  const normalise = s => s.replace(/\r\n/g, '\n');
  assert.equal(normalise(read('guide.html')), buildGuide(read('parent_readme.md')), 'run: npm run guide');
  assert.match(read('index.html'), /href="guide.html"/, 'the tool links to the guide');
});
