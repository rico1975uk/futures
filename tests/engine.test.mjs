import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHOOLS, OUTCODES } from '../js/data/schools.js';
import { evaluate, scoreProfile, buildContext, normaliseOutcode, transitionOutlook } from '../js/engine.js';
import { renderReport } from '../js/report.js';
import { buildPrompts, allPromptsText } from '../js/prompts.js';
import { PERSONAS, inputFor } from './personas.mjs';

const ctx = buildContext(SCHOOLS);
const run = (key, o) => evaluate(inputFor(key, o), SCHOOLS, ctx);
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const order = r => r.schools.map(e => e.school.name);

test('school data looks sane', () => {
  assert.equal(SCHOOLS.length, 47);
  assert.ok(SCHOOLS.every(s => s.urn && s.name && s.lat && s.lng), 'every school has id, name, location');
  assert.ok(SCHOOLS.filter(s => s.gcse.a8 != null).length >= 44);
  assert.ok(OUTCODES.BS7 && OUTCODES.BS13);
});

test('profile scoring handles reverse items, bands and missing answers', () => {
  const p = scoreProfile({ soc1: 5, soc2: 1, soc3: 5, wor1: 1 });
  assert.equal(p.sociability.score, 100);
  assert.equal(p.sociability.band, 'high');
  assert.equal(p.worry.score, null, 'one of three items is not enough');
  assert.equal(scoreProfile({ soc1: 1, soc2: 5, soc3: 1 }).sociability.band, 'low');
  assert.equal(normaliseOutcode(' bs7 9by'), 'BS7');
  assert.equal(normaliseOutcode('nonsense'), null);
});

test('transition outlook weights the strongest risk factors', () => {
  assert.equal(transitionOutlook({ newSituations: 'dive', feelings: 'excited', friendships: 'settled', bullying: 'no', happiness: '5' }, {}).level, 'smooth');
  assert.equal(transitionOutlook({ bullying: 'yes', feelings: 'very' }, {}).level, 'extra');
  assert.equal(transitionOutlook({}, {}).level, null);
});

test('each persona gets a distinct set of needs', () => {
  const sigs = Object.keys(PERSONAS).map(k => run(k).child.needs.map(n => n.id).sort().join(','));
  console.log(Object.keys(PERSONAS).map((k, i) => `   ${k}: ${sigs[i] || '(none)'}`).join('\n'));
  assert.equal(new Set(sigs).size, sigs.length, 'no two personas share an identical needs profile');
  assert.ok(run('anxiousSensitive').child.needs.some(n => n.id === 'pastoral'));
  assert.ok(run('brightIndependent').child.needs.some(n => n.id === 'stretch'));
  assert.ok(run('brightIndependent').child.needs.some(n => n.id === 'autonomy'));
  assert.ok(run('disorganisedSociable').child.needs.some(n => n.id === 'structure'));
  assert.ok(run('disorganisedSociable').child.needs.some(n => n.id === 'support'));
  assert.ok(run('quietCreative').child.needs.some(n => n.id === 'calm'));
  assert.equal(run('easygoingAverage').child.needs.length, 0, 'an all-middle child has no strong specific needs');
});

test('different children produce different rankings on the same shortlist', () => {
  const keys = ['anxiousSensitive', 'brightIndependent', 'disorganisedSociable', 'quietCreative', 'easygoingAverage'];
  const orders = keys.map(k => order(run(k)).join(' > '));
  keys.forEach((k, i) => console.log(`   ${k}: ${orders[i]}`));
  assert.ok(new Set(orders).size >= 4, `expected at least 4 distinct orderings, got ${new Set(orders).size}`);
});

test('reports read differently, not just reorder', () => {
  const keys = Object.keys(PERSONAS);
  const docs = keys.map(k => new Set(text(renderReport(run(k))).split(/(?<=[.!?])\s+/)));
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const shared = [...docs[i]].filter(x => docs[j].has(x)).length;
    const jaccard = shared / (docs[i].size + docs[j].size - shared);
    assert.ok(jaccard < 0.7, `${keys[i]} vs ${keys[j]} reports are ${Math.round(jaccard * 100)}% identical`);
  }
});

test('family priorities alone change the outcome', () => {
  const base = run('easygoingAverage');
  const results = run('easygoingAverage', { family: { outcode: 'BS7', priorities: { results: 5, behaviour: 2, pastoral: 2, journey: 0, sixth: 5 } } });
  assert.notDeepEqual(order(base), order(results));
  assert.equal(order(results)[0], 'Bristol Free School', 'results-and-sixth-form family should top out on the highest-attaining school');
});

test('visit impressions are weighted heavily', () => {
  const before = run('brightIndependent');
  const mid = before.schools[3].school;
  const after = run('brightIndependent', { visits: { [mid.urn]: { fit: 5, child: 5, feel: 5 } } });
  assert.equal(order(after)[0], mid.name, 'a school parent and child both loved rises to the top of an unvisited shortlist');
  const last = before.schools.at(-1);
  const lastAfter = run('brightIndependent', { visits: { [last.school.urn]: { fit: 5, child: 5, feel: 5 } } }).schools.find(e => e.school.urn === last.school.urn);
  assert.ok(lastAfter.score - last.score >= 0.1, 'even a weak-on-paper school gains substantially');
  const top = before.schools[0].school;
  const after2 = run('brightIndependent', { visits: { [top.urn]: { fit: 1, child: 1 } } });
  assert.notEqual(order(after2)[0], top.name, 'disliked-on-visit school drops from top');
  assert.ok(after2.schools.find(e => e.school.urn === top.urn).weigh.some(w => /only 1\/5/.test(w)));
});

test('single-sex eligibility and faith preferences', () => {
  const r = run('anxiousSensitive', { shortlist: ['151303', '138855'] }); // Montpelier (girls) for a boy
  const m = r.schools.find(e => e.school.urn === '151303');
  assert.equal(m.band, 'Weaker match');
  assert.match(m.weigh[0], /would not be eligible/);
  const boySuggest = run('anxiousSensitive').suggestions.map(e => e.school.gender);
  assert.ok(boySuggest.every(g => g === 'Mixed'));
  const faith = run('southBristolFaith');
  assert.ok(faith.schools.slice(0, 3).every(e => e.school.religion), 'faith schools rank top for a family that wants one');
  assert.ok(faith.suggestions.every(e => e.school.religion));
});

test('missing data is not rewarded', () => {
  const r = run('brightIndependent', { shortlist: ['149784', '136822'] }); // Temple Quarter (new, no results) vs Bristol Free School
  const tq = r.schools.find(e => e.school.urn === '149784');
  assert.ok(tq.coverage < 0.8);
  assert.notEqual(tq.band, 'Strong match');
  assert.ok(tq.weigh.some(w => /No published GCSE results/.test(w)));
});

test('distance depends on postcode district', () => {
  // Cotham (BS6) and Ashton Park (BS3) have similar results; which is nearer depends on where you live.
  const north = run('easygoingAverage', { shortlist: ['137440', '145398'] });
  const south = run('easygoingAverage', { shortlist: ['137440', '145398'], family: { outcode: 'BS13', priorities: { results: 1, behaviour: 2, pastoral: 2, journey: 5, sixth: 0 } } });
  assert.notEqual(order(north)[0], order(south)[0], 'journey-focused family prefers the nearer school in each case');
});

test('empty and partial input never crashes', () => {
  for (const input of [{}, { shortlist: ['138855'] }, { child: { answers: {} }, family: {}, shortlist: SCHOOLS.map(s => s.urn).slice(0, 8) }]) {
    const r = evaluate(input, SCHOOLS, ctx);
    const html = renderReport(r);
    assert.ok(html.includes('Choosing a secondary school'));
  }
  assert.match(text(renderReport(evaluate({}, SCHOOLS, ctx))), /haven’t shortlisted/);
});

test('prompts are tailored to the child and shortlist', () => {
  const anx = buildPrompts(run('anxiousSensitive'));
  const bright = buildPrompts(run('brightIndependent'));
  // one research prompt per shortlisted school, plus context, admissions, compare and visit
  assert.equal(anx.length, 6 + 4);
  assert.deepEqual(anx.map(p => p.id).slice(0, 2), ['context', 'admissions']);
  const research = (ps, urn) => ps.find(p => p.id === 'research-' + urn).text;
  assert.match(research(anx, '147072'), /Pastoral support/);
  assert.match(research(anx, '147072'), /quieter spaces/);
  assert.doesNotMatch(research(anx, '147072'), /stretch high attainers/);
  assert.match(research(bright, '147072'), /stretch high attainers/);
  assert.match(research(bright, '147072'), /maths and puzzles, science and how things work, music/);
  assert.match(anx.find(p => p.id === 'compare').title, / vs /);
  assert.notEqual(allPromptsText(anx), allPromptsText(bright));
  assert.match(buildPrompts(run('southBristolFaith')).find(p => p.id === 'admissions').text, /faith, /);
});

test('prompt privacy options are respected', () => {
  const r = run('anxiousSensitive', { visits: { '147072': { fit: 4, notes: 'Loved the art room' } } });
  const def = allPromptsText(buildPrompts(r));
  assert.ok(!/\bRobin\b/.test(def), 'name is off by default');
  assert.match(def, /BS7 postcode district/, 'area is on by default');
  assert.match(def, /Loved the art room/);
  const strict = allPromptsText(buildPrompts(r, { includeArea: false, includeNotes: false }));
  // School postcodes (e.g. "BS7 9BY") legitimately remain; the family's own district must not.
  assert.ok(!/\bBS7\b(?! \d)/.test(strict), 'home district removed');
  assert.ok(!strict.includes('Loved the art room'));
  assert.match(allPromptsText(buildPrompts(r, { includeName: true })), /\bRobin\b/);
  assert.ok(!def.includes('soc1') && !def.includes('"answers"'), 'raw answers never included');
  assert.ok(!/picked on/i.test(def), 'wellbeing details are off by default');
  const wb = buildPrompts(r, { includeWellbeing: true });
  assert.match(wb.find(p => p.id === 'context').text, /picked on/i);
  assert.ok(!/picked on/i.test(wb.find(p => p.id === 'research-147072').text), 'research prompts never carry wellbeing details');
  assert.equal(buildPrompts(evaluate({}, SCHOOLS, ctx)).length, 0, 'no shortlist, no prompts');
});
