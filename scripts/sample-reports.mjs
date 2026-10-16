// Writes one standalone report per test persona to samples/, plus an index comparing them.
// Usage: node scripts/sample-reports.mjs
import fs from 'node:fs';
import { SCHOOLS, DATA_META } from '../js/data/schools.js';
import { evaluate } from '../js/engine.js';
import { renderReport, esc } from '../js/report.js';
import { PERSONAS, inputFor } from '../tests/personas.mjs';

const css = fs.readFileSync('css/styles.css', 'utf8');
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><main class="standalone"><section class="panel report visible">${body}</section></main></body></html>`;
fs.mkdirSync('samples', { recursive: true });

const rows = [];
for (const [key, p] of Object.entries(PERSONAS)) {
  const r = evaluate(inputFor(key), SCHOOLS);
  fs.writeFileSync(`samples/${key}.html`, page(`Sample: ${p.label}`, renderReport(r, { dataMeta: DATA_META, preparedDate: new Date('2026-10-16') })));
  rows.push({ key, label: p.label, needs: r.child.needs.map(n => n.title), transition: r.child.transition.level, schools: r.schools.map(e => [e.school.name, e.band, e.score]), suggestions: r.suggestions.map(e => e.school.name) });
}

const idx = `<div class="tag">Test personas</div><h1 class="report-title">Same tool, different children</h1>
<p>Each persona below is run against the same six north-Bristol schools (except the last, a south-Bristol family who want a faith school). Open a report to see the full output.</p>
${rows.map(r => `<div class="schoolprint"><div class="school-head"><h3><a href="${r.key}.html">${esc(r.label)}</a></h3><span class="muted">transition: ${esc(r.transition || 'n/a')}</span></div>
<p><strong>Needs identified:</strong> ${r.needs.length ? esc(r.needs.join('; ')) : '<span class="muted">none strongly indicated</span>'}</p>
<table><tbody>${r.schools.map(([n, b, s]) => `<tr><td>${esc(n)}</td><td><span class="band ${b.split(' ')[0].toLowerCase()}">${esc(b)}</span></td><td>${s}</td></tr>`).join('')}</tbody></table>
<p class="fine">Also suggested: ${esc(r.suggestions.join(', ') || 'none')}</p></div>`).join('')}`;
fs.writeFileSync('samples/index.html', page('Sample reports', idx));
for (const r of rows) console.log(`\n${r.label}\n  needs: ${r.needs.join('; ') || '-'}\n  ${r.schools.map(([n, b]) => `${n} [${b}]`).join('\n  ')}\n  + ${r.suggestions.join(', ')}`);
