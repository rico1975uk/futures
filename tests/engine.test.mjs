import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHOOLS, OUTCODES } from '../js/data/schools.js';
import { evaluate, scoreProfile, buildContext, normaliseOutcode, transitionOutlook, schoolFactors } from '../js/engine.js';
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

test('visit impressions never change the match score or appear as reasons', () => {
  const before = run('brightIndependent');
  const top = before.schools[0].school, last = before.schools.at(-1).school;
  const visits = { [top.urn]: { fit: 1, child: 1 }, [last.urn]: { fit: 5, child: 5, obs: { lessons: 'yes', corridors: 'yes' } } };
  const after = run('brightIndependent', { visits });
  assert.deepEqual(after.schools.map(e => [e.school.name, e.score]), before.schools.map(e => [e.school.name, e.score]), 'scores and order unchanged');
  const all = after.schools.flatMap(e => [...e.suits, ...e.weigh]).join(' ');
  assert.doesNotMatch(all, /You rated|Trust that|Your child liked|wasn’t keen/, 'impressions are never offered as reasons');
  assert.ok(!after.schools.some(e => e.drivers.some(d => /visit|view/i.test(d.label))), 'no visit factor in the breakdown');
});

test('disagreements between impressions and evidence are surfaced, siding with neither', () => {
  const r0 = run('anxiousSensitive');
  const strong = r0.schools[0], weak = r0.schools.at(-1); // Bristol Free School (strong), Fairfield (calm is weak on data)
  const r = run('anxiousSensitive', { visits: {
    [strong.school.urn]: { fit: 1, child: 4, obs: { lessons: 'no', corridors: 'no' } },
    [weak.school.urn]: { fit: 5, obs: { lessons: 'yes', corridors: 'yes' } },
  } });
  const s = r.schools.find(e => e.school.urn === strong.school.urn).impressions.disagreements;
  const w = r.schools.find(e => e.school.urn === weak.school.urn).impressions.disagreements;
  assert.ok(s.some(d => d.kind === 'worse' && d.factor === 'calm'), 'saw worse behaviour than the data shows');
  assert.ok(s.some(d => d.factor === 'overall' && /rated it only 1\/5/.test(d.text)), 'gut verdict below a strong evidence match');
  assert.ok(s.some(d => d.kind === 'split'), 'parent and child disagree');
  assert.ok(w.some(d => d.kind === 'better' && d.factor === 'calm' && /persistent absence 39%/.test(d.text)), 'saw better than data, citing the data');
  assert.ok(w.some(d => d.factor === 'overall' && /What was it that appealed/.test(d.text)));
  assert.equal(r.gutFavourite.urn, weak.school.urn);
  const t = text(renderReport(r));
  assert.match(t, /Where your impressions and the evidence disagree/);
  assert.match(t, /Your own impressions favour Fairfield High School/);
  assert.match(t, /not counted in the match/);
  assert.match(t, /Before the detail/);
  assert.match(t, /premortem/);
  // No visits: no disagreement section.
  assert.doesNotMatch(text(renderReport(r0)), /Where your impressions and the evidence disagree/);
});

test('premortem and challenge are in the talk-it-through prompt', () => {
  const r = run('anxiousSensitive', { visits: { '147072': { fit: 5, obs: { lessons: 'yes' } } } });
  const ctxPrompt = buildPrompts(r).find(p => p.id === 'context').text;
  assert.match(ctxPrompt, /premortem/i);
  assert.match(ctxPrompt, /Challenge my impressions/);
  assert.match(ctxPrompt, /not counted in the tool's rating/);
  assert.match(buildPrompts(r).find(p => p.id === 'visit').text, /Corridors and lunch felt manageable/);
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

test('no child details: ratings are a data comparison, not a match', () => {
  const r = evaluate({ shortlist: ['136856', '141705'], family: { prioritiesSet: false }, outcodes: OUTCODES }, SCHOOLS, ctx); // Gordano, Fairfield
  assert.equal(r.mode, 'data');
  assert.ok(r.schools.every(e => / on the data$|Not enough/.test(e.band)), 'no "match" wording');
  const t = text(renderReport(r));
  assert.match(t, /Compared on published data only/);
  assert.match(t, /standard weights/);
  assert.match(t, /Strengths on the data/);
  assert.doesNotMatch(t, /closest fit/);
  assert.match(t, /comes out ahead/, 'a clearly weaker runner-up is not paired with the leader');
  const withChild = run('anxiousSensitive');
  assert.equal(withChild.mode, 'child');
  assert.ok(withChild.schools.every(e => / match$/.test(e.band)));
});

test('persistent absence is judged against similar intakes', () => {
  // Two schools with the same raw absence: the one with the more deprived intake should look calmer.
  const base = SCHOOLS.find(s => s.urn === '141705');
  const affluent = { ...base, urn: 'x1', fsm: 8, ofstedAreas: null };
  const deprived = { ...base, urn: 'x2', fsm: 45, ofstedAreas: null };
  const fa = schoolFactors(affluent, ctx), fd = schoolFactors(deprived, ctx);
  assert.ok(fd.calm > fa.calm + 0.05, `deprived-intake school should score calmer (${fd.calm} vs ${fa.calm})`);
  assert.ok(fd.paResid < fa.paResid);
});

test('every rating explains what drove it', () => {
  for (const e of run('brightIndependent').schools) {
    const total = e.drivers.reduce((t, d) => t + d.share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, 'shares sum to 100%');
    assert.ok(e.drivers.every((d, i, a) => i === 0 || a[i - 1].share >= d.share), 'sorted by weight');
    assert.ok(e.drivers.every(d => d.label && !/^[a-z]+[A-Z]/.test(d.label)), 'human-readable labels');
  }
  assert.match(renderReport(run('brightIndependent')), /What drove this rating/);
});

test('year-group size is one net factor, and mixed signals are named as a trade-off', () => {
  // Sociable child (wants a bigger pool) in a family that prefers a smaller year group.
  const r = run('disorganisedSociable', { family: { outcode: 'BS7', priorities: { results: 3, behaviour: 3, pastoral: 3, journey: 3, sixth: 1 }, sizePref: 'small' } });
  for (const e of r.schools) {
    const sizeRows = e.drivers.filter(d => /year group/i.test(d.label));
    assert.ok(sizeRows.length <= 1, `${e.school.name}: at most one size row`);
  }
  const bccs = r.schools.find(e => e.school.urn === '135575'); // small year group
  assert.match(bccs.drivers.find(d => d.key === 'size').label, /smaller suits you/);
  assert.ok(bccs.weigh.some(w => /Size is a trade-off for you: you’d prefer a smaller year group, but your child’s sociability/.test(w)));
  // No conflict, no trade-off line.
  assert.ok(!run('anxiousSensitive').schools.some(e => e.weigh.some(w => /Size is a trade-off/.test(w))));
});
