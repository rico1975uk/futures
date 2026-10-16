// UI wiring: renders the questionnaire, persists answers locally, runs the engine and shows the report.
import { SCHOOLS, OUTCODES, DATA_META } from './data/schools.js';
import { DIMENSIONS, LIKERT, MOTIVATORS, INTERESTS, ATTAINMENT_LEVELS, SUBJECTS, TRANSITION, EVIDENCE } from './questions.js';
import { evaluate, buildContext, haversineKm, normaliseOutcode, yearGroupSize } from './engine.js';
import { renderReport, esc } from './report.js';
import { buildPrompts, allPromptsText } from './prompts.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const MAX_SHORTLIST = 8;
const STORE = 'futures:v1';
const CTX = buildContext(SCHOOLS);
const PRIORITIES = [
  ['results', 'Strong academic results and stretch'],
  ['behaviour', 'Calm, orderly behaviour'],
  ['pastoral', 'Pastoral care and wellbeing'],
  ['journey', 'An easy journey'],
  ['sixth', 'A sixth form to stay on for'],
];

// ---------- state ----------
let state = load() || { shortlist: [], answers: {}, motivators: [], interests: [], attainment: {}, transition: { worries: [] }, priorities: {}, visits: {}, fields: {} };
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage unavailable: fine */ } updateProgress(); }

// ---------- 1. school selector ----------
const home = () => { const oc = normaliseOutcode($('#outcode').value); return oc && OUTCODES[oc] ? OUTCODES[oc] : null; };
function distance(s) { const h = home(); return h && s.lat ? haversineKm(h, [s.lat, s.lng]) : null; }

function renderSchoolList() {
  const q = $('#search').value.trim().toLowerCase();
  const h = home();
  const km = +$('#f-km').value;
  let list = SCHOOLS.map(s => ({ s, d: distance(s) }));
  if (q) list = list.filter(({ s }) => [s.name, s.street, s.postcode, s.ward, s.council].join(' ').toLowerCase().includes(q));
  if ($('#f-near').checked && h) list = list.filter(x => x.d != null && x.d <= km);
  if ($('#f-sixth').checked) list = list.filter(x => x.s.sixthForm);
  if ($('#f-faith').checked) list = list.filter(x => x.s.religion);
  if ($('#f-bristol').checked) list = list.filter(x => x.s.council === 'Bristol City');
  const sort = $('#sort').value;
  list.sort((a, b) => sort === 'name' ? a.s.name.localeCompare(b.s.name)
    : sort === 'a8' ? (b.s.gcse.a8 ?? -1) - (a.s.gcse.a8 ?? -1)
    : (a.d ?? 1e9) - (b.d ?? 1e9) || a.s.name.localeCompare(b.s.name));
  $('#school-list').innerHTML = list.length ? list.map(({ s, d }) => schoolCard(s, d)).join('') : '<p class="muted">No schools match those filters.</p>';
  $('#outcode-status').textContent = $('#outcode').value && !h ? 'We don’t recognise that district. Try e.g. BS6.' : h ? `✓ ${normaliseOutcode($('#outcode').value)} found` : '';
}

function schoolCard(s, d) {
  const on = state.shortlist.includes(s.urn);
  const yg = yearGroupSize(s);
  const flags = [
    s.entryYear !== 7 && '<span class="flag warn">Joins at Year 10</span>',
    s.gender !== 'Mixed' && `<span class="flag">${esc(s.gender)}</span>`,
    s.religion && `<span class="flag">${esc(s.religion)}</span>`,
    s.sixthForm ? '<span class="flag">Sixth form</span>' : s.sixthForm === false ? '<span class="flag subtle">11–16</span>' : '',
    s.council !== 'Bristol City' && `<span class="flag subtle">${esc(s.council)}</span>`,
    ['Inadequate', 'Urgent improvement', 'Needs attention'].includes(s.ofsted) && `<span class="flag warn">Ofsted: ${esc(s.ofsted)}</span>`,
    s.gcse.a8 == null && '<span class="flag subtle">New: no GCSE results yet</span>',
  ].filter(Boolean).join('');
  return `<article class="school-card${on ? ' on' : ''}">
  <div class="sc-main"><h3>${esc(s.name)}</h3>
    <p class="muted">${esc(s.ward || '')}${s.ward ? ', ' : ''}${esc(s.postcode || '')}${d != null ? ` · <strong>${d.toFixed(1)} km</strong>` : ''}</p>
    <div class="flags">${flags}</div></div>
  <dl class="sc-stats">
    <div><dt>Attainment 8</dt><dd>${s.gcse.a8 ?? '–'}</dd></div>
    <div><dt>Eng+maths 5+</dt><dd>${s.gcse.g5 != null ? Math.round(s.gcse.g5) + '%' : '–'}</dd></div>
    <div><dt>Year group</dt><dd>${yg ?? '–'}</dd></div>
    <div><dt>Ofsted</dt><dd>${esc(s.ofsted || '–')}</dd></div>
  </dl>
  <button class="btn ${on ? 'secondary' : ''} sc-btn" data-urn="${s.urn}" ${!on && (state.shortlist.length >= MAX_SHORTLIST || s.entryYear !== 7) ? 'disabled' : ''} aria-pressed="${on}">${on ? 'Remove' : s.entryYear !== 7 ? 'Year 10 entry' : 'Add to shortlist'}</button>
</article>`;
}

function renderShortlist() {
  const items = state.shortlist.map(u => SCHOOLS.find(s => s.urn === u)).filter(Boolean);
  $('#shortlist').innerHTML = items.length
    ? `<strong>Your shortlist (${items.length}/${MAX_SHORTLIST}):</strong> ${items.map(s => `<span class="chip on">${esc(s.name)} <button data-urn="${s.urn}" aria-label="Remove ${esc(s.name)}">×</button></span>`).join('')}`
    : '<span class="muted">No schools shortlisted yet.</span>';
  $('#nav-count').textContent = items.length ? `(${items.length})` : '';
  renderVisits();
}
function toggleSchool(urn) {
  const i = state.shortlist.indexOf(urn);
  if (i >= 0) state.shortlist.splice(i, 1); else if (state.shortlist.length < MAX_SHORTLIST) state.shortlist.push(urn);
  save(); renderShortlist(); renderSchoolList();
}

// ---------- 2. child ----------
function renderDims() {
  $('#dims').innerHTML = DIMENSIONS.map(d => `<fieldset class="dimset"><legend>${esc(d.title)}</legend>
    ${d.items.map(it => `<div class="likert" role="radiogroup" aria-label="${esc(it.text)}"><p>${esc(it.text)}</p><div class="scale">
      ${LIKERT.map(l => `<label><input type="radio" name="${it.id}" value="${l.v}" ${state.answers[it.id] == l.v ? 'checked' : ''}><span>${l.label}</span></label>`).join('')}
    </div></div>`).join('')}</fieldset>`).join('');
  $('#motivators').innerHTML = MOTIVATORS.map(m => `<label class="choice"><input type="checkbox" value="${m.id}" ${state.motivators.includes(m.id) ? 'checked' : ''}> ${esc(m.label)}</label>`).join('');
  $('#why-child').innerHTML = ['personality', 'sensitivity', 'selfcontrol', 'sdt'].map(k => evidenceHtml(EVIDENCE[k])).join('') + '<p class="fine">These are everyday versions of research-based dimensions, not a validated test or diagnosis.</p>';
  $('#why-transition').innerHTML = evidenceHtml(EVIDENCE.transition);
}
const evidenceHtml = e => `<p>${esc(e.short)}<br><span class="fine">${e.refs.map(esc).join(' · ')}</span></p>`;

function renderTransition() {
  $('#transition-qs').innerHTML = Object.entries(TRANSITION).map(([key, t]) => key === 'worries'
    ? `<div class="field"><label>${esc(t.q)}</label><div class="choice-grid three" id="worries">${t.options.map(([v, l]) => `<label class="choice"><input type="checkbox" value="${v}" ${state.transition.worries?.includes(v) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>`
    : `<fieldset class="field radios"><legend>${esc(t.q)}</legend>${t.options.map(([v, l]) => `<label class="choice"><input type="radio" name="t_${key}" value="${v}" ${state.transition[key] === v ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</fieldset>`).join('');
}

function renderLearning() {
  $('#attainment').innerHTML = SUBJECTS.map(([id, label]) => `<div class="field"><label for="att_${id}">${esc(label)}</label><select id="att_${id}">${ATTAINMENT_LEVELS.map(l => `<option value="${l.v}" ${state.attainment[id] === l.v ? 'selected' : ''}>${l.label}</option>`).join('')}</select></div>`).join('');
  $('#interests').innerHTML = INTERESTS.map(([v, l]) => `<label class="choice"><input type="checkbox" value="${v}" ${state.interests.includes(v) ? 'checked' : ''}> ${esc(l)}</label>`).join('');
}

function renderPriorities() {
  $('#prioritylist').innerHTML = PRIORITIES.map(([id, label]) => {
    const v = state.priorities[id] ?? (id === 'sixth' ? 1 : 3);
    return `<div class="priority"><label for="p_${id}">${label}</label><input type="range" min="0" max="5" value="${v}" id="p_${id}"><output id="o_${id}">${v}</output></div>`;
  }).join('');
}

// ---------- 6. visits ----------
function rating(urn, key, label) {
  const cur = state.visits[urn]?.[key];
  return `<div class="field"><label>${label}</label><div class="scale five">${['Very poor', 'Poor', 'Mixed', 'Good', 'Excellent'].map((l, i) => `<label><input type="radio" name="v_${urn}_${key}" value="${i + 1}" ${cur == i + 1 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>`;
}
function renderVisits() {
  const items = state.shortlist.map(u => SCHOOLS.find(s => s.urn === u)).filter(Boolean);
  if (!items.length) { $('#visit-inputs').innerHTML = '<p class="muted">Add schools to your shortlist in Step 1 first.</p>'; return; }
  $('#visit-inputs').innerHTML = items.map(s => {
    const v = state.visits[s.urn] || {};
    return `<section class="school"><h3>${esc(s.name)}</h3>
    <div class="twocol">${rating(s.urn, 'fit', 'Your view: fit for your child')}${rating(s.urn, 'child', 'Your child’s view')}</div>
    ${rating(s.urn, 'feel', 'Overall feel of the school')}
    <div class="twocol"><div class="field"><label for="vn_${s.urn}">What stood out?</label><textarea id="vn_${s.urn}" data-urn="${s.urn}" maxlength="600" placeholder="Positives, concerns, uncertainties. Your words appear in your report.">${esc(v.notes || '')}</textarea></div>
    <div class="field"><label for="vf_${s.urn}">Friends likely to go there?</label><select id="vf_${s.urn}" data-urn="${s.urn}"><option value="">Don’t know</option><option value="none" ${v.friends === 'none' ? 'selected' : ''}>None</option><option value="one" ${v.friends === 'one' ? 'selected' : ''}>One</option><option value="several" ${v.friends === 'several' ? 'selected' : ''}>Several</option></select></div></div>
    </section>`;
  }).join('');
}

// ---------- collect & progress ----------
function collect() {
  return {
    child: { name: $('#name').value.trim(), sex: $('#sex').value, answers: state.answers, motivators: state.motivators, interests: state.interests, attainment: state.attainment, transition: state.transition },
    family: { outcode: $('#outcode').value, priorities: Object.fromEntries(PRIORITIES.map(([id]) => [id, +$('#p_' + id).value])), sizePref: $('#sizePref').value, discipline: $('#discipline').value, faith: $('#faith').value, gender: $('#gender').value, prioritiesSet: Object.keys(state.priorities).length > 0 },
    shortlist: state.shortlist, visits: state.visits, outcodes: OUTCODES,
  };
}
function updateProgress() {
  const items = DIMENSIONS.flatMap(d => d.items).length;
  const done = [state.shortlist.length > 0, Object.keys(state.answers).length >= items * 0.6, ['feelings', 'friendships', 'newSituations'].some(k => state.transition[k]), Object.values(state.attainment).some(Boolean), Object.keys(state.visits).length > 0];
  const n = done.filter(Boolean).length;
  $('#progress-bar').style.width = `${(n / done.length) * 100}%`;
  $('#progress-text').textContent = `${n} of ${done.length} sections started`;
}

// ---------- report ----------
let lastResult = null;
function generate() {
  lastResult = evaluate(collect(), SCHOOLS, CTX);
  $('#output').innerHTML = renderReport(lastResult, { dataMeta: DATA_META });
  $('#output').classList.add('visible');
  $('#print').disabled = $('#save').disabled = false;
  renderPrompts();
  $('#output').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- prompts for the parent's own AI ----------
let lastPrompts = [];
function renderPrompts() {
  const box = $('#own-ai');
  if (!lastResult?.schools.length) { box.hidden = true; return; }
  lastPrompts = buildPrompts(lastResult, { includeArea: $('#pa-area').checked, includeName: $('#pa-name').checked, includeNotes: $('#pa-notes').checked, includeWellbeing: $('#pa-wellbeing').checked });
  $('#prompt-list').innerHTML = lastPrompts.map((p, i) => `<article class="prompt-card">
    <div class="prompt-head"><div><h3>${esc(p.title)}</h3><p class="muted">${esc(p.when)}</p></div>
    <button class="btn" data-copy="${i}">Copy prompt</button></div>
    <details><summary>Show prompt</summary><pre class="prompt-text">${esc(p.text)}</pre></details></article>`).join('');
  box.hidden = false;
}
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  const old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = old; }, 1800);
}

// ---------- events ----------
function bind() {
  $('#search').addEventListener('input', renderSchoolList);
  ['#f-near', '#f-km', '#f-sixth', '#f-faith', '#f-bristol', '#sort'].forEach(s => $(s).addEventListener('change', renderSchoolList));
  $('#outcode').addEventListener('input', () => { renderSchoolList(); if (home() && !$('#f-near').dataset.touched) { $('#f-near').checked = true; renderSchoolList(); } });
  $('#f-near').addEventListener('change', e => { e.target.dataset.touched = 1; });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-urn]');
    if (b && (b.matches('.sc-btn') || b.closest('#shortlist'))) toggleSchool(b.dataset.urn);
  });
  $('#dims').addEventListener('change', e => { if (e.target.type === 'radio') { state.answers[e.target.name] = +e.target.value; save(); } });
  $('#motivators').addEventListener('change', e => {
    const picked = $$('#motivators input:checked');
    if (picked.length > 2) e.target.checked = false;
    state.motivators = $$('#motivators input:checked').map(x => x.value); save();
  });
  $('#transition-qs').addEventListener('change', e => {
    if (e.target.name?.startsWith('t_')) state.transition[e.target.name.slice(2)] = e.target.value;
    else state.transition.worries = $$('#worries input:checked').map(x => x.value);
    save();
  });
  $('#attainment').addEventListener('change', e => { state.attainment[e.target.id.slice(4)] = e.target.value; save(); });
  $('#interests').addEventListener('change', () => { state.interests = $$('#interests input:checked').map(x => x.value); save(); });
  $('#prioritylist').addEventListener('input', e => { const id = e.target.id.slice(2); $('#o_' + id).textContent = e.target.value; state.priorities[id] = +e.target.value; save(); });
  $('#visit-inputs').addEventListener('change', e => {
    const t = e.target, m = t.name?.match(/^v_(\d+)_(\w+)$/);
    if (m) (state.visits[m[1]] ||= {})[m[2]] = +t.value;
    else if (t.id?.startsWith('vf_')) (state.visits[t.dataset.urn] ||= {}).friends = t.value;
    save();
  });
  $('#visit-inputs').addEventListener('input', e => { if (e.target.id?.startsWith('vn_')) { (state.visits[e.target.dataset.urn] ||= {}).notes = e.target.value; save(); } });
  $$('[data-save]').forEach(el => {
    if (state.fields[el.id] != null) el.value = state.fields[el.id];
    el.addEventListener('input', () => { state.fields[el.id] = el.value; save(); });
    el.addEventListener('change', () => { state.fields[el.id] = el.value; save(); });
  });
  $('#generate').addEventListener('click', generate);
  $('#print').addEventListener('click', () => window.print());
  $('#reset').addEventListener('click', () => { if (!confirm('Clear all your answers from this browser?')) return; try { localStorage.removeItem(STORE); } catch {} location.reload(); });
  $('#save').addEventListener('click', downloadHtml);
  ['#pa-area', '#pa-name', '#pa-notes', '#pa-wellbeing'].forEach(id => $(id).addEventListener('change', renderPrompts));
  $('#prompt-list').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyText(lastPrompts[+b.dataset.copy].text, b); });
  $('#copy-all').addEventListener('click', e => copyText(allPromptsText(lastPrompts), e.target));
}

async function downloadHtml() {
  let css = '';
  try { css = await (await fetch('css/styles.css')).text(); } catch {}
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>School report</title><style>${css}</style></head><body><main class="standalone"><section class="panel report visible">${$('#output').innerHTML}</section></main></body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  a.download = 'secondary-school-report.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- init ----------
window.addEventListener('beforeprint', () => $$('#output details').forEach(d => { d.open = true; }));
renderDims(); renderTransition(); renderLearning(); renderPriorities();
bind();
renderShortlist(); renderSchoolList(); updateProgress();
if (home()) { $('#f-near').checked = true; renderSchoolList(); }
window.__futures = { collect, evaluate: () => evaluate(collect(), SCHOOLS, CTX), state: () => state };
