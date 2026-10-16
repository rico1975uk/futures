// Matching engine: child profile + family priorities + school data -> structured, qualitative evaluation.
// Pure functions only (no DOM) so it can be unit-tested in Node and reused by the AI layer.
import { DIMENSIONS, ATTAINMENT_LEVELS, SUBJECTS, MOTIVATORS, INTERESTS } from './questions.js';

// ---------- helpers ----------
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (x, d = 0) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;
export function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function normaliseOutcode(s) {
  if (!s) return null;
  const m = String(s).toUpperCase().replace(/\s+/g, ' ').trim().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  return m ? m[1] : null;
}
function percentileFn(values) {
  const v = values.filter(x => x != null).sort((a, b) => a - b);
  return x => {
    if (x == null || !v.length) return null;
    let below = 0, equal = 0;
    for (const y of v) { if (y < x) below++; else if (y === x) equal++; }
    return (below + equal / 2) / v.length;
  };
}
const OFSTED_VALUE = {
  Exceptional: 1, Outstanding: 1, Strong: 0.8, Good: 0.7, Expected: 0.55,
  'Requires improvement': 0.3, 'Needs attention': 0.25, Inadequate: 0.05, 'Urgent improvement': 0.05,
};
const areaOf = (s, ...names) => { if (!s.ofstedAreas) return null; for (const n of names) if (s.ofstedAreas[n]) return { name: n, grade: s.ofstedAreas[n] }; return null; };

// ---------- 1. child profile ----------
export function scoreProfile(answers = {}) {
  const out = {};
  for (const d of DIMENSIONS) {
    const vals = d.items.map(it => {
      const raw = Number(answers[it.id]);
      if (!raw) return null;
      return it.r ? 6 - raw : raw;
    }).filter(x => x != null);
    const answered = vals.length;
    // Need at least half the items to say anything about a dimension.
    if (answered < Math.ceil(d.items.length / 2)) { out[d.id] = { score: null, band: null, answered }; continue; }
    const score = ((mean(vals) - 1) / 4) * 100;
    const band = score >= 65 ? 'high' : score <= 35 ? 'low' : 'mid';
    out[d.id] = { score: round(score), band, answered };
  }
  return out;
}

export function scoreAttainment(att = {}) {
  const scores = SUBJECTS.map(([id]) => ATTAINMENT_LEVELS.find(l => l.v === att[id])?.score).filter(x => x != null);
  if (!scores.length) return { overall: null, band: null, bySubject: att };
  const overall = mean(scores);
  return { overall, band: overall >= 0.75 ? 'above' : overall <= -0.75 ? 'below' : 'expected', bySubject: att, max: Math.max(...scores), min: Math.min(...scores) };
}

export function transitionOutlook(t = {}, profile = {}) {
  const risks = [], protective = [];
  if (t.newSituations === 'slow') risks.push('Takes a long time to settle into new situations');
  if (t.newSituations === 'dive') protective.push('Usually dives into new situations');
  if (t.feelings === 'very') risks.push('Very worried about starting secondary');
  else if (t.feelings === 'worried') risks.push('Mostly worried about starting secondary');
  else if (t.feelings === 'excited') protective.push('Mostly excited about secondary');
  if (t.friendships === 'hard') risks.push('Finding friendships hard at the moment');
  else if (t.friendships === 'changeable') risks.push('Friendships have ups and downs');
  else if (t.friendships === 'settled' || t.friendships === 'few') protective.push(t.friendships === 'settled' ? 'Has a settled friendship group' : 'Has one or two close friends');
  if (t.bullying === 'yes') risks.push('Has recently been picked on or left out in a way that upset them');
  else if (t.bullying === 'some') risks.push('Has occasionally been picked on or left out');
  const h = Number(t.happiness);
  if (h && h <= 2) risks.push('Often unhappy at primary school right now');
  else if (h >= 4) protective.push('Happy at primary school');
  if (profile.worry?.band === 'high') risks.push('Tends to feel worries strongly');
  if (profile.worry?.band === 'low') protective.push('Usually takes change in their stride');

  // Weighted: bullying and existing anxiety are the strongest predictors in the transition literature.
  const weight = { 'Has recently been picked on or left out in a way that upset them': 2, 'Very worried about starting secondary': 2, 'Finding friendships hard at the moment': 1.5 };
  const riskScore = risks.reduce((s, r) => s + (weight[r] || 1), 0);
  const answered = ['newSituations', 'feelings', 'friendships', 'bullying', 'happiness'].filter(k => t[k]).length;
  const level = answered === 0 && !profile.worry?.band ? null : riskScore >= 4 ? 'extra' : riskScore >= 2 ? 'some' : 'smooth';
  return { level, riskScore, risks, protective, worries: t.worries || [], answered };
}

// ---------- 2. what this child is likely to need ----------
// Each need carries a strength (0-1) used to weight school factors, plus plain-language explanation.
export function deriveNeeds(child) {
  const p = child.profile, a = child.attainment, tr = child.transition;
  const hi = id => p[id]?.band === 'high', lo = id => p[id]?.band === 'low';
  const s = id => p[id]?.score == null ? null : p[id].score / 100;
  const needs = [];
  const add = (id, strength, title, why, evidence) => { if (strength > 0.15) needs.push({ id, strength: round(clamp(strength), 2), title, why, evidence }); };

  // Gentle transition / strong pastoral care
  let past = 0; const pastWhy = [];
  if (hi('worry')) { past += 0.45; pastWhy.push('feels worries strongly'); }
  if (tr.level === 'extra') { past += 0.5; pastWhy.push('several signs the move to Year 7 could be bumpy'); }
  else if (tr.level === 'some') { past += 0.25; pastWhy.push('a few signs the move to Year 7 could be bumpy'); }
  if (child.transitionRaw?.bullying === 'yes') { past += 0.3; pastWhy.push('has recently been picked on or left out'); }
  add('pastoral', past, 'Strong pastoral care and a well-planned transition',
    `Your answers suggest ${pastWhy.join(', ')}. Children like this do markedly better when a named adult knows them early, friendship-building is planned, and worries are picked up quickly.`, 'transition');

  // Calm environment
  let calm = 0; const calmWhy = [];
  if (hi('sensitivity')) { calm += 0.55; calmWhy.push('finds noise and crowds draining'); }
  if (hi('worry')) { calm += 0.2; calmWhy.push('feels worries strongly'); }
  if (lo('selforg')) { calm += 0.15; calmWhy.push('is still building self-organisation'); }
  add('calm', calm, 'A calm, orderly environment',
    `Because they ${calmWhy.join(' and ')}, the day-to-day climate matters more than average for them: settled lessons, manageable corridors and lunchtimes, and somewhere quieter to go.`, 'sensitivity');

  // Structure & organisational scaffolding
  let struct = 0; const structWhy = [];
  if (lo('selforg')) { struct += 0.55; structWhy.push('needs reminders to stay organised'); }
  if (hi('structure')) { struct += 0.45; structWhy.push('does best with clear expectations and routines'); }
  add('structure', struct, 'Clear routines and help with getting organised',
    `They ${structWhy.join(' and ')}. Secondary school suddenly asks for a lot of self-management: many teachers, a timetable, homework platforms and equipment. Explicit routines, planners, and tutors who check in make a real difference while these skills are still developing.`, 'selfcontrol');

  // Autonomy & voice
  let aut = 0;
  if (hi('autonomy')) aut += 0.6;
  if (lo('structure')) aut += 0.25;
  if ((child.motivators || []).includes('choice')) aut += 0.2;
  add('autonomy', aut, 'Room for a voice, choice and reasons',
    'They push back on rules that seem pointless and do best with some choice. Research on early adolescence finds motivation dips when schools tighten control just as children want more say. Look for clear rules that are explained, applied fairly, and leave room for student voice.', 'fit');

  // Stretch
  let stretch = 0; const strWhy = [];
  if (hi('curiosity')) { stretch += 0.45; strWhy.push('is hungry for ideas and challenge'); }
  if (a.band === 'above') { stretch += 0.45; strWhy.push('is working above expected levels'); }
  else if (a.max === 2) { stretch += 0.25; strWhy.push('is well above expected in at least one subject'); }
  add('stretch', stretch, 'Genuine stretch and depth',
    `They ${strWhy.join(' and ')}. Look for evidence that high attainers are pushed, not just kept busy: setting or extension work, enrichment, and a strong record at the top grades.`, 'personality');

  // Support to catch up
  let sup = 0;
  if (a.band === 'below') sup += 0.6; else if (a.min != null && a.min <= -1) sup += 0.35;
  if (lo('selforg') && a.band !== 'above') sup += 0.1;
  add('support', sup, 'Effective catch-up support',
    'They are working below expected levels in at least one core area. What matters most is how quickly the school identifies gaps in Year 7 and how good its catch-up teaching is (for example reading programmes and small-group maths), not its headline results.', 'schoolEffects');

  // Social breadth vs intimacy
  if (hi('sociability')) add('breadth', 0.45, 'Plenty of people and activities to find their tribe',
    'They get energy from people. A larger year group and a busy clubs programme give more chances to find friends and interests.', 'personality');
  if (lo('sociability') || (hi('sensitivity') && !hi('sociability'))) add('belonging', 0.45, 'A smaller-feeling community where they can be known',
    'They prefer a few close friends and quieter settings. A smaller year group, or a school that makes a big one feel small (stable tutor groups, house systems, a Year 7 base), helps them feel they belong quickly.', 'transition');

  return needs.sort((x, y) => y.strength - x.strength);
}

// ---------- 3. school factors ----------
export function buildContext(schools) {
  const pool = schools.filter(s => s.entryYear === 7 && s.gcse.a8 != null);
  // Crude "results given intake": residual of Attainment 8 after allowing for % FSM.
  const pts = pool.filter(s => s.fsm != null).map(s => [s.fsm, s.gcse.a8]);
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  const slope = pts.reduce((t, [x, y]) => t + (x - mx) * (y - my), 0) / pts.reduce((t, [x]) => t + (x - mx) ** 2, 0);
  const resid = s => (s.fsm == null || s.gcse.a8 == null) ? null : s.gcse.a8 - (my + slope * (s.fsm - mx));
  const all7 = schools.filter(s => s.entryYear === 7);
  return {
    slope, intercept: my - slope * mx, resid,
    pA8: percentileFn(pool.map(s => s.gcse.a8)), pG5: percentileFn(pool.map(s => s.gcse.g5)), pG7: percentileFn(pool.map(s => s.gcse.g7)),
    pResid: percentileFn(pool.map(resid)),
    pPA: percentileFn(all7.map(s => s.persistentAbsence)),
    pCohort: percentileFn(all7.map(s => yearGroupSize(s))),
    pPTR: percentileFn(all7.map(s => s.ptr)),
    medians: {
      a8: median(pool.map(s => s.gcse.a8)), g7: median(pool.map(s => s.gcse.g7)), g5: median(pool.map(s => s.gcse.g5)),
      pa: median(all7.filter(s => s.persistentAbsence != null).map(s => s.persistentAbsence)),
      cohort: median(all7.map(yearGroupSize).filter(Boolean)),
    },
  };
}
export function yearGroupSize(s) {
  if (s.gcse.cohort) return s.gcse.cohort;
  if (s.capacity) return Math.round(s.capacity / (s.sixthForm ? 6 : 5)); // new schools: estimate from capacity
  return null;
}

export function schoolFactors(s, ctx, home) {
  const f = {};
  const a8 = ctx.pA8(s.gcse.a8), g5 = ctx.pG5(s.gcse.g5);
  f.results = a8 == null ? null : (a8 + (g5 ?? a8)) / 2;
  f.stretch = ctx.pG7(s.gcse.g7);
  f.valueAdded = ctx.pResid(ctx.resid(s));
  const beh = areaOf(s, 'Attendance & behaviour', 'Behaviour & attitudes');
  const paInv = s.persistentAbsence == null ? null : 1 - ctx.pPA(s.persistentAbsence);
  const behV = beh ? OFSTED_VALUE[beh.grade] : null;
  const ov = OFSTED_VALUE[s.ofsted] ?? null;
  f.calm = behV != null && paInv != null ? 0.55 * behV + 0.45 * paInv
    : paInv != null && ov != null ? 0.35 * ov + 0.65 * paInv : (behV ?? paInv ?? ov);
  const pd = areaOf(s, 'Personal development & wellbeing', 'Personal development');
  const inc = areaOf(s, 'Inclusion');
  const ptrInv = s.ptr == null ? null : 1 - ctx.pPTR(s.ptr);
  const pastParts = [pd && OFSTED_VALUE[pd.grade], inc && OFSTED_VALUE[inc.grade]].filter(x => x != null);
  f.pastoral = pastParts.length ? 0.8 * mean(pastParts) + 0.2 * (ptrInv ?? mean(pastParts)) : ov != null ? 0.75 * ov + 0.25 * (ptrInv ?? ov) : null;
  f.pastoralEvidence = pastParts.length ? 'ofsted' : 'weak';
  if (ov != null && ov < 0.2) { f.calm = Math.min(f.calm ?? 1, 0.25); f.pastoral = Math.min(f.pastoral ?? 1, 0.25); }
  const ach = areaOf(s, 'Achievement', 'Quality of education');
  f.support = inc || ach ? mean([inc && OFSTED_VALUE[inc.grade], ach && OFSTED_VALUE[ach.grade]].filter(x => x != null)) : (f.valueAdded ?? null);
  const yg = yearGroupSize(s);
  f.small = yg == null ? null : 1 - ctx.pCohort(yg);
  f.overall = OFSTED_VALUE[s.ofsted] ?? null;
  f.distanceKm = home && s.lat ? round(haversineKm(home, [s.lat, s.lng]), 1) : null;
  f.proximity = f.distanceKm == null ? null : clamp(1 - (f.distanceKm - 2) / 10);
  f.sixth = s.sixthForm == null ? null : s.sixthForm ? 1 : 0;
  f.yearGroup = yg;
  f.areas = { beh, pd, inc, ach };
  return f;
}

// ---------- 4. evaluation ----------
const DEFAULT_PRIORITIES = { results: 3, behaviour: 3, pastoral: 3, journey: 3, sixth: 1 };

function weightsFor(input, needs) {
  const pr = { ...DEFAULT_PRIORITIES, ...(input.family?.priorities || {}) };
  const n = id => needs.find(x => x.id === id)?.strength || 0;
  const fam = input.family || {};
  const w = {
    results: pr.results * 0.8,
    stretch: pr.results * 0.4 + n('stretch') * 4,
    valueAdded: pr.results * 0.4 + n('support') * 2,
    calm: pr.behaviour + n('calm') * 4 + n('structure') * 1.5 + (fam.discipline === 'structured' ? 1.5 : 0),
    pastoral: pr.pastoral + n('pastoral') * 4 + n('belonging') * 1,
    support: n('support') * 4,
    small: (fam.sizePref === 'small' ? 3 : 0) + n('belonging') * 2 + n('calm') * 1,
    large: (fam.sizePref === 'large' ? 3 : 0) + n('breadth') * 2,
    proximity: pr.journey,
    sixth: pr.sixth,
    overall: 1.5 + n('pastoral') + n('calm'),
  };
  w.intended = Object.values(w).reduce((t, x) => t + x, 0);
  return w;
}

const BAND = [[0.75, 'Strong match'], [0.63, 'Good match'], [0.5, 'Mixed match'], [-1, 'Weaker match']];

export function evaluate(input, schools, ctx = buildContext(schools)) {
  const profile = scoreProfile(input.child?.answers);
  const attainment = scoreAttainment(input.child?.attainment);
  const transition = transitionOutlook(input.child?.transition, profile);
  const child = { profile, attainment, transition, transitionRaw: input.child?.transition || {}, motivators: input.child?.motivators || [], interests: input.child?.interests || [] };
  const needs = deriveNeeds(child);
  const w = weightsFor(input, needs);
  const fam = input.family || {};
  const outcode = normaliseOutcode(fam.outcode);
  const home = outcode && input.outcodes?.[outcode] ? input.outcodes[outcode] : null;

  const anyVisits = Object.values(input.visits || {}).some(v => v && (v.fit || v.child || v.feel));
  const evalSchool = s => {
    const f = schoolFactors(s, ctx, home);
    const parts = [];
    const push = (key, weight, value) => { if (weight > 0 && value != null) parts.push({ key, weight, value }); };
    push('results', w.results, f.results);
    push('stretch', w.stretch, f.stretch);
    push('valueAdded', w.valueAdded, f.valueAdded);
    push('calm', w.calm, f.calm);
    push('pastoral', w.pastoral, f.pastoral);
    push('support', w.support, f.support);
    push('small', w.small, f.small);
    push('large', w.large, f.small == null ? null : 1 - f.small);
    push('proximity', w.proximity, f.proximity);
    push('sixth', w.sixth, f.sixth);
    push('overall', w.overall, f.overall);
    // Hard-ish family preferences.
    if (fam.faith === 'want') push('faith', 3, s.religion ? 1 : 0);
    if (fam.faith === 'avoid') push('faith', 3, s.religion ? 0 : 1);
    const sex = input.child?.sex;
    if (s.gender === 'Girls' && sex === 'boy' || s.gender === 'Boys' && sex === 'girl') push('eligible', 50, 0);
    if (fam.gender === 'single') push('gender', 3, s.gender !== 'Mixed' ? 1 : 0);
    if (fam.gender === 'mixed') push('gender', 3, s.gender === 'Mixed' ? 1 : 0);
    // The family's and child's own impressions from visits are first-hand evidence: together they can carry
    // as much weight as all the published data combined, however many priorities the family has turned up.
    const v = input.visits?.[s.urn] || {};
    const vw = w.intended;
    if (v.fit) push('visitFit', vw * 0.45, (v.fit - 1) / 4);
    if (v.child) push('visitChild', vw * 0.4, (v.child - 1) / 4);
    if (v.feel) push('visitFeel', vw * 0.15, (v.feel - 1) / 4);
    if (v.friends && (transition.level === 'extra' || transition.level === 'some' || needs.some(x => x.id === 'belonging')))
      push('friends', 2, v.friends === 'several' ? 1 : v.friends === 'one' ? 0.75 : 0.3);

    const tw = parts.reduce((t, p) => t + p.weight, 0);
    const raw = tw ? parts.reduce((t, p) => t + p.weight * p.value, 0) / tw : null;
    // Missing data shouldn't flatter a school: pull the score toward neutral in proportion to what we couldn't assess.
    const dataKeys = ['results', 'stretch', 'valueAdded', 'calm', 'pastoral', 'support', 'small', 'large', 'proximity', 'sixth', 'overall'];
    // Once a family has started visiting, an unvisited school is missing evidence too.
    const visitKeys = anyVisits ? ['visitFit', 'visitChild', 'visitFeel'] : [];
    const covered = parts.filter(p => dataKeys.includes(p.key) || visitKeys.includes(p.key)).reduce((t, p) => t + p.weight, 0);
    const intended = dataKeys.reduce((t, k) => t + (k === 'proximity' && !home ? 0 : (w[k] || 0)), 0) + (anyVisits ? w.intended : 0);
    const coverage = intended ? clamp(covered / intended) : 1;
    const score = raw == null ? null : 0.5 + (raw - 0.5) * (0.4 + 0.6 * coverage);
    const evidenceWeight = tw;
    return { school: s, factors: f, parts, coverage: round(coverage, 2), score: round(score, 3), band: score == null ? 'Not enough information' : BAND.find(([t]) => score >= t)[1], evidenceWeight };
  };

  const shortlist = (input.shortlist || []).map(u => schools.find(s => s.urn === u)).filter(Boolean);
  const evaluated = shortlist.map(evalSchool);
  for (const e of evaluated) Object.assign(e, explain(e, { needs, input, ctx, child, home }));
  const ranked = [...evaluated].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  // Schools not on the shortlist that look worth a visit.
  const maxKm = fam.maxKm || 8;
  const others = schools.filter(s => s.entryYear === 7 && !shortlist.includes(s))
    .map(evalSchool)
    .filter(e => e.factors.distanceKm == null ? false : e.factors.distanceKm <= maxKm)
    .filter(e => !(fam.gender === 'single' && e.school.gender === 'Mixed'))
    .filter(e => e.school.gender === 'Mixed' || (e.school.gender === 'Girls' && input.child?.sex === 'girl') || (e.school.gender === 'Boys' && input.child?.sex === 'boy'))
    .filter(e => e.coverage >= 0.6 && !['Inadequate', 'Urgent improvement'].includes(e.school.ofsted))
    .filter(e => !(fam.faith === 'want' && !e.school.religion));
  const floor = ranked.length ? Math.min(...ranked.map(r => r.score ?? 0)) : 0;
  const suggestions = others.sort((a, b) => b.score - a.score).filter(e => e.score >= floor).slice(0, 3)
    .map(e => ({ ...e, ...explain(e, { needs, input, ctx, child, home }) }));

  return {
    child: { ...child, needs, name: input.child?.name || '' },
    family: { ...fam, outcode, located: !!home, priorities: { ...DEFAULT_PRIORITIES, ...(fam.priorities || {}) } },
    weights: w, schools: ranked, suggestions, ctx: { medians: ctx.medians },
    generalQuestions: generalQuestions(child, needs, fam),
  };
}

// ---------- 5. explanation ----------
function pct(x) { return x == null ? '–' : `${round(x)}%`; }
function explain(e, { needs, input, ctx, child }) {
  const s = e.school, f = e.factors, M = ctx.medians;
  const suits = [], weigh = [], facts = [], questions = [];
  const need = id => needs.find(n => n.id === id);
  const fam = input.family || {};

  // Results, read with intake in mind.
  if (s.gcse.a8 != null) {
    const resid = ctx.resid(s);
    const intake = resid == null ? '' : resid > 3 ? ', above what its intake would predict' : resid < -3 ? ', though below what its intake would predict' : ', roughly in line with its intake';
    facts.push(`GCSE 2026: Attainment 8 of ${s.gcse.a8} (area median ${M.a8}); ${pct(s.gcse.g5)} got grade 5+ in English and maths; ${pct(s.gcse.g7)} got grade 7+.`);
    if (f.results >= 0.7) suits.push(`Strong headline results (Attainment 8 of ${s.gcse.a8})${intake}.`);
    else if (f.results <= 0.3 && (e.parts.find(p => p.key === 'results')?.weight || 0) >= 2) weigh.push(`Headline results are below the area median (Attainment 8 ${s.gcse.a8} vs ${M.a8})${intake}. Results mostly reflect intake, so ask how pupils like yours progress.`);
    else if (resid != null && resid > 4) suits.push(`Results are above what its intake would predict (about ${round(resid)} Attainment 8 points), a tentative sign of strong teaching.`);
    if (need('stretch')) {
      if (f.stretch >= 0.7) suits.push(`Good record at the top grades: ${pct(s.gcse.g7)} achieved 7+ in English and maths (area median ${pct(M.g7)}). That matters for a child who needs stretch.`);
      else if (f.stretch <= 0.35) weigh.push(`Fewer pupils reach the top grades here (${pct(s.gcse.g7)} at 7+ vs ${pct(M.g7)} median). Ask specifically how the most able are stretched.`);
      questions.push('How do you stretch pupils who are already ahead? Is there setting in maths and science from Year 7, and what enrichment is there for the most able?');
    }
  } else {
    weigh.push('No published GCSE results yet (a newer school), so judge it on visits, leadership and Ofsted.');
  }

  // Climate and behaviour
  if (f.areas.beh) facts.push(`Ofsted ${f.areas.beh.name.toLowerCase()}: ${f.areas.beh.grade}${s.ofstedDate ? ` (${s.ofstedDate})` : ''}.`);
  if (s.persistentAbsence != null) facts.push(`Persistent absence ${pct(s.persistentAbsence)} (area median ${pct(M.pa)}).`);
  const calmW = e.parts.find(p => p.key === 'calm')?.weight || 0;
  if (f.calm != null && calmW >= 3) {
    if (f.calm >= 0.68) { const bits = [f.areas.beh && `Ofsted rated ${f.areas.beh.name.toLowerCase()} as ${f.areas.beh.grade.toLowerCase()}`, s.persistentAbsence != null && s.persistentAbsence < M.pa && `persistent absence (${pct(s.persistentAbsence)}) is below the area median (${pct(M.pa)})`].filter(Boolean); suits.push(`Signs of a settled climate${bits.length ? ': ' + bits.join(', and ') : ''}.`); }
    else if (f.calm <= 0.4) weigh.push(`Climate indicators are weaker${f.areas.beh && OFSTED_VALUE[f.areas.beh.grade] < 0.5 ? `: Ofsted judged ${f.areas.beh.name.toLowerCase()} as “${f.areas.beh.grade}”` : ''}${s.persistentAbsence != null && s.persistentAbsence > M.pa ? `${f.areas.beh && OFSTED_VALUE[f.areas.beh.grade] < 0.5 ? ', and' : ':'} persistent absence is ${pct(s.persistentAbsence)} vs ${pct(M.pa)} median` : ''}. Watch lessons and corridors closely on your visit.`);
  }
  if (f.areas.beh && OFSTED_VALUE[f.areas.beh.grade] < 0.5) questions.push(`Ofsted rated ${f.areas.beh.name.toLowerCase()} as “${f.areas.beh.grade}”. What has changed since, and what does it look like day to day?`);

  // Pastoral
  const pastW = e.parts.find(p => p.key === 'pastoral')?.weight || 0;
  if (f.areas.pd) facts.push(`Ofsted ${f.areas.pd.name.toLowerCase()}: ${f.areas.pd.grade}${f.areas.inc ? `; inclusion: ${f.areas.inc.grade}` : ''}.`);
  if (pastW >= 4) {
    if (f.pastoralEvidence === 'ofsted' && f.pastoral >= 0.7) suits.push(`Ofsted rated ${f.areas.pd?.name.toLowerCase() || 'personal development'} as ${f.areas.pd?.grade.toLowerCase()}${f.areas.inc ? ` and inclusion as ${f.areas.inc.grade.toLowerCase()}` : ''}, which is relevant for a child who needs strong pastoral care.`);
    else if (f.pastoralEvidence === 'ofsted' && f.pastoral <= 0.45) weigh.push(`Ofsted’s view of personal development / wellbeing is weaker here (“${f.areas.pd?.grade}”). Probe pastoral support carefully.`);
    else if (f.pastoralEvidence === 'weak') weigh.push('There is no recent published judgement on pastoral care or wellbeing, so your visit is the main evidence.');
  }
  if (s.ptr != null) facts.push(`Pupil:teacher ratio ${s.ptr}:1.`);

  // Size
  if (f.yearGroup) facts.push(`Year group roughly ${f.yearGroup} pupils (area median ${M.cohort})${s.gcse.cohort ? '' : ', estimated'}.`);
  const smallW = e.parts.find(p => p.key === 'small')?.weight || 0, largeW = e.parts.find(p => p.key === 'large')?.weight || 0;
  if (f.small != null) {
    if (smallW >= 2 && f.small >= 0.65) suits.push(`A smaller year group (about ${f.yearGroup}), which can make it easier to be known quickly.`);
    if (smallW >= 2 && f.small <= 0.3) weigh.push(`A large year group (about ${f.yearGroup}). Ask how they make it feel small: tutor groups, houses, a Year 7 base.`);
    if (largeW >= 2 && f.small <= 0.35) suits.push(`A large year group (about ${f.yearGroup}): more people to meet and usually more clubs and options.`);
    if (largeW >= 2 && f.small >= 0.7) weigh.push(`A smaller year group (about ${f.yearGroup}), so the friendship pool and options may be narrower.`);
  }

  // Support
  if (need('support')) {
    if (f.areas.inc && OFSTED_VALUE[f.areas.inc.grade] >= 0.75) suits.push(`Ofsted rated inclusion as ${f.areas.inc.grade.toLowerCase()}, relevant if they need catch-up support.`);
    questions.push('How do you identify gaps in reading and maths when pupils arrive, and what catch-up teaching happens in Year 7?');
  }

  // Journey
  if (f.distanceKm != null) {
    facts.push(`About ${f.distanceKm} km from the centre of ${normaliseOutcode(fam.outcode)} (straight line).`);
    const jw = e.parts.find(p => p.key === 'proximity')?.weight || 0;
    if (jw >= 3 && f.distanceKm <= 2.5) suits.push(`Close to home (about ${f.distanceKm} km), so an independent journey is realistic.`);
    if (jw >= 3 && f.distanceKm >= 7) weigh.push(`A longer journey (about ${f.distanceKm} km straight line). Try the real trip at school times before deciding.`);
  }

  // Structural facts and flags
  if (s.ofsted) facts.push(`Latest Ofsted: ${s.ofsted}${s.ofstedFramework === 'report-card' ? ' (new report-card framework)' : ''}.`);
  if (s.ofsted === 'Inadequate' || s.ofsted === 'Urgent improvement') weigh.push(`Latest Ofsted outcome is “${s.ofsted}”. Ask what has changed since the inspection and what the improvement plan is.`);
  if (s.gender && s.gender !== 'Mixed') facts.push(`${s.gender}’ school.`);
  if (s.gender === 'Girls' && input.child?.sex === 'boy' || s.gender === 'Boys' && input.child?.sex === 'girl') weigh.unshift(`This is a ${s.gender.toLowerCase()}’ school, so your child would not be eligible.`);
  if (e.coverage != null && e.coverage < 0.6) weigh.push('There is limited published data for the things that matter most for your child, so this rating is less certain. Your visit counts for more.');
  if (s.religion) facts.push(`${s.religion} school. Check whether faith criteria apply in admissions.`);
  facts.push(s.sixthForm === true ? 'Has a sixth form.' : s.sixthForm === false ? 'No sixth form (11–16).' : (s.sixthNote || 'Sixth form: check with the school.'));
  if (fam.priorities?.sixth >= 3 && s.sixthForm === false) weigh.push('No sixth form, so they would move again at 16.');
  if (fam.priorities?.sixth >= 3 && s.sixthForm === true) suits.push('Has its own sixth form, so they could stay on at 16.');
  if (s.council && s.council !== 'Bristol City') facts.push(`Run by ${s.council} for admissions purposes. You still apply through your home council.`);
  if (fam.faith === 'want' && !s.religion) weigh.push('Not a faith school, which you said you would prefer.');
  if (fam.faith === 'avoid' && s.religion) weigh.push(`A ${s.religion} school, which you said you would rather avoid.`);
  if (fam.gender === 'single' && s.gender === 'Mixed') weigh.push('Mixed school; you said you would prefer single-sex.');

  // Visits
  const v = input.visits?.[s.urn] || {};
  if (v.fit >= 4) suits.push(`You rated its fit for your child ${v.fit}/5 after visiting.`);
  if (v.fit && v.fit <= 2) weigh.push(`You rated its fit for your child only ${v.fit}/5 after visiting. Trust that.`);
  if (v.child >= 4) suits.push(`Your child liked it (${v.child}/5).`);
  if (v.child && v.child <= 2) weigh.push(`Your child wasn’t keen (${v.child}/5). Worth talking through why.`);
  if (v.friends === 'several' && e.parts.some(p => p.key === 'friends')) suits.push('Several friends are likely to go too, which is protective for the move to Year 7.');
  if (v.friends === 'none' && e.parts.some(p => p.key === 'friends')) weigh.push('No friends are likely to go. Ask how they help pupils who arrive alone make friends.');

  if (!v.fit && !v.child && !v.feel) questions.push('Not visited or rated yet: your own impressions will matter more than anything in this report.');

  return { suits, weigh, facts, questions, visit: v };
}

function generalQuestions(child, needs, fam) {
  const q = [];
  const has = id => needs.some(n => n.id === id);
  if (has('pastoral')) q.push(
    'Who will be my child’s first point of contact, and how quickly will they get to know them?',
    'What happens in the summer term before Year 7 and the first weeks: extra induction days, summer school, buddy schemes?',
    'How do you notice a child who is quietly struggling, and how do you tell parents?');
  if (child.transitionRaw?.bullying === 'yes' || child.transition.worries.includes('bullying'))
    q.push('How do you deal with bullying and friendship fallouts, including online? Can you give a recent example of how a case was handled?');
  if (has('calm')) q.push('Where can a child go at break and lunch if they want somewhere quieter?', 'How busy are corridors at changeover? (Walk them at a lesson change if you can.)');
  if (has('structure')) q.push('How do you help Year 7s get organised: planners, homework apps, equipment checks, tutor check-ins?', 'How are homework and deadlines communicated to parents?');
  if (has('autonomy') || fam.discipline === 'flexible') q.push('How are rules explained to pupils, and how much say do students have (school council, student voice)?', 'What is the sanctions system, and roughly how many detentions does a typical Year 7 get?');
  if (fam.discipline === 'structured') q.push('How consistent is behaviour management across different teachers?');
  if (has('breadth')) q.push('What clubs and activities run for Year 7, and how many pupils take part?');
  if (has('belonging')) q.push('How big are tutor groups, and do Year 7s have their own space or base?');
  const iq = {
    music: 'What instrumental lessons, ensembles and choirs are there, and does GCSE Music run every year?',
    drama: 'Are there school productions open to Year 7, and is Drama taught as its own subject?',
    computing: 'Is Computer Science offered at GCSE, and are there coding or robotics clubs?',
    languages: 'Which languages are taught from Year 7, and can pupils take two?',
    science: 'Is triple science available at GCSE, and how is it decided who takes it?',
    maths: 'Are there maths challenge or extension groups?',
    sport: 'Which sports are played competitively, and do Year 7s get fixtures?',
    active: 'How much outdoor space is there for break and lunch?',
    arts: 'How much art and design is on the timetable in Key Stage 3?',
    making: 'Are DT and food taught in Key Stage 3, and what facilities are there?',
    reading: 'Is there a library with a librarian, and reading clubs?',
    humanities: 'Can pupils take both history and geography at GCSE?',
  };
  for (const i of child.interests || []) if (iq[i]) q.push(iq[i]);
  return [...new Set(q)];
}

export { MOTIVATORS, INTERESTS };
