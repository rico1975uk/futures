// Matching engine: child profile + family priorities + school data -> structured, qualitative evaluation.
// Pure functions only (no DOM) so it can be unit-tested in Node. Scoring constants are in METHOD (documented in docs/METHODOLOGY.md).
import { DIMENSIONS, ATTAINMENT_LEVELS, SUBJECTS, MOTIVATORS, INTERESTS, OBSERVATIONS } from './questions.js';

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
// Crude intake adjustment: residual of a measure after allowing (linearly) for % free school meals.
// Both results and absence are strongly tied to deprivation, so we judge schools against similar intakes.
function intakeAdjuster(schools, get) {
  const pts = schools.filter(s => s.fsm != null && get(s) != null).map(s => [s.fsm, get(s)]);
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  const slope = pts.reduce((t, [x, y]) => t + (x - mx) * (y - my), 0) / pts.reduce((t, [x]) => t + (x - mx) ** 2, 0);
  return s => (s.fsm == null || get(s) == null) ? null : get(s) - (my + slope * (s.fsm - mx));
}

export function buildContext(schools) {
  const pool = schools.filter(s => s.entryYear === 7 && s.gcse.a8 != null);
  const all7 = schools.filter(s => s.entryYear === 7);
  const resid = intakeAdjuster(pool, s => s.gcse.a8);
  const paResid = intakeAdjuster(all7, s => s.persistentAbsence);
  return {
    resid, paResid,
    pA8: percentileFn(pool.map(s => s.gcse.a8)), pG5: percentileFn(pool.map(s => s.gcse.g5)), pG7: percentileFn(pool.map(s => s.gcse.g7)),
    pResid: percentileFn(pool.map(resid)),
    pPA: percentileFn(all7.map(s => s.persistentAbsence)),
    pPAResid: percentileFn(all7.map(paResid)),
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
  // Absence relative to schools with a similar intake (falls back to raw absence if FSM is unknown).
  const paR = ctx.paResid(s);
  const paInv = s.persistentAbsence == null ? null : 1 - (paR != null ? ctx.pPAResid(paR) : ctx.pPA(s.persistentAbsence));
  f.paResid = paR;
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
// All scoring constants live here so docs/METHODOLOGY.md can be checked against them (tests/docs.test.mjs).
// They are judgement calls chosen to make the logic sensible, not values calibrated against outcomes.
export const METHOD = {
  defaultPriorities: { results: 3, behaviour: 3, pastoral: 3, journey: 3, sixth: 1 },
  // weight = base + Σ(slider × k) + Σ(need strength × k) + conditional extras
  weights: {
    results: { sliders: { results: 0.8 } },
    stretch: { sliders: { results: 0.4 }, needs: { stretch: 4 } },
    valueAdded: { sliders: { results: 0.4 }, needs: { support: 2 } },
    calm: { sliders: { behaviour: 1 }, needs: { calm: 4, structure: 1.5 }, ifStructuredDiscipline: 1.5 },
    pastoral: { sliders: { pastoral: 1 }, needs: { pastoral: 4, belonging: 1 } },
    support: { needs: { support: 4 } },
    proximity: { sliders: { journey: 1 } },
    sixth: { sliders: { sixth: 1 } },
    overall: { base: 1.5, needs: { pastoral: 1, calm: 1 } },
  },
  // Year-group size is one net factor: |smaller pull − larger pull|.
  size: { smaller: { ifPreferred: 3, needs: { belonging: 2, calm: 1 } }, larger: { ifPreferred: 3, needs: { breadth: 2 } } },
  fixed: { faith: 3, singleSex: 3, ineligible: 50, friends: 2 },
  bands: { strong: 0.75, good: 0.63, mixed: 0.5 },
  // Score kept = 0.4 + 0.6 × coverage of its distance from 0.5 (missing data pulls towards "mixed").
  coverageFloor: 0.4,
};
const DEFAULT_PRIORITIES = METHOD.defaultPriorities;

function weightsFor(input, needs) {
  const pr = { ...DEFAULT_PRIORITIES, ...(input.family?.priorities || {}) };
  const n = id => needs.find(x => x.id === id)?.strength || 0;
  const fam = input.family || {};
  const sum = (obj, get) => Object.entries(obj || {}).reduce((t, [k, x]) => t + get(k) * x, 0);
  const w = {};
  for (const [key, r] of Object.entries(METHOD.weights)) {
    w[key] = (r.base || 0) + sum(r.sliders, k => pr[k]) + sum(r.needs, n) + (r.ifStructuredDiscipline && fam.discipline === 'structured' ? r.ifStructuredDiscipline : 0);
  }
  // Year-group size: signals can pull both ways (e.g. family prefers small, child is very sociable).
  // Net them into one factor so the breakdown never shows a school as both "strong" and "weak" on size.
  const smallWhy = [fam.sizePref === 'small' && 'you’d prefer a smaller year group',
    n('belonging') && 'your child’s answers suggest they’ll settle best where they can be known quickly',
    n('calm') && 'your child finds busy places draining'].filter(Boolean);
  const largeWhy = [fam.sizePref === 'large' && 'you’d prefer a larger year group',
    n('breadth') && 'your child’s sociability suggests a bigger year group, with more people and clubs, could suit them'].filter(Boolean);
  const S = METHOD.size;
  const smallPull = (fam.sizePref === 'small' ? S.smaller.ifPreferred : 0) + sum(S.smaller.needs, n);
  const largePull = (fam.sizePref === 'large' ? S.larger.ifPreferred : 0) + sum(S.larger.needs, n);
  w.size = Math.abs(smallPull - largePull);
  w.intended = Object.values(w).reduce((t, x) => t + x, 0);
  w.sizeMeta = { dir: smallPull >= largePull ? 'smaller' : 'larger', conflict: smallPull > 0 && largePull > 0, smallWhy, largeWhy };
  return w;
}

const BAND = [[METHOD.bands.strong, 'strong'], [METHOD.bands.good, 'good'], [METHOD.bands.mixed, 'mixed'], [-1, 'weaker']];
const BAND_LABEL = {
  child: { strong: 'Strong match', good: 'Good match', mixed: 'Mixed match', weaker: 'Weaker match', none: 'Not enough information' },
  // With no child details there is nothing to "match": describe it as a comparison on the data instead.
  data: { strong: 'Strong on the data', good: 'Good on the data', mixed: 'Mixed on the data', weaker: 'Weaker on the data', none: 'Not enough information' },
};
const DRIVER_LABEL = {
  results: 'Headline GCSE results', stretch: 'Top grades (7+ in English and maths)', valueAdded: 'Results allowing for intake',
  calm: 'Behaviour and attendance (allowing for intake)', pastoral: 'Pastoral care and wellbeing', support: 'Catch-up support and inclusion',
  proximity: 'Distance from home', sixth: 'Has a sixth form',
  overall: 'Overall Ofsted outcome', faith: 'Your faith-school preference', gender: 'Your mixed/single-sex preference',
  eligible: 'Eligibility (single-sex school)',
  friends: 'Friends likely to go',
};
function drivers(parts, f) {
  const tw = parts.reduce((t, p) => t + p.weight, 0);
  return parts.map(p => ({
    key: p.key, label: p.label || DRIVER_LABEL[p.key] || p.key, share: tw ? p.weight / tw : 0, value: p.value,
    weak: p.key === 'pastoral' && f.pastoralEvidence === 'weak',
  })).sort((a, b) => b.share - a.share);
}

export function evaluate(input, schools, ctx = buildContext(schools)) {
  const profile = scoreProfile(input.child?.answers);
  const attainment = scoreAttainment(input.child?.attainment);
  const transition = transitionOutlook(input.child?.transition, profile);
  const child = { profile, attainment, transition, transitionRaw: input.child?.transition || {}, motivators: input.child?.motivators || [], interests: input.child?.interests || [] };
  const needs = deriveNeeds(child);
  const hasChild = Object.values(profile).some(p => p.band) || !!attainment.band || !!transition.level || child.motivators.length > 0 || child.interests.length > 0;
  const mode = hasChild ? 'child' : 'data';
  const w = weightsFor(input, needs);
  const fam = input.family || {};
  const outcode = normaliseOutcode(fam.outcode);
  const home = outcode && input.outcodes?.[outcode] ? input.outcodes[outcode] : null;

  const evalSchool = s => {
    const f = schoolFactors(s, ctx, home);
    const parts = [];
    const push = (key, weight, value, label) => { if (weight > 0 && value != null) parts.push({ key, weight, value, label }); };
    push('results', w.results, f.results);
    push('stretch', w.stretch, f.stretch);
    push('valueAdded', w.valueAdded, f.valueAdded);
    push('calm', w.calm, f.calm);
    push('pastoral', w.pastoral, f.pastoral);
    push('support', w.support, f.support);
    const sm = w.sizeMeta;
    push('size', w.size, f.small == null ? null : sm.dir === 'smaller' ? f.small : 1 - f.small, `Year group size (on balance, ${sm.dir} suits you)`);
    push('proximity', w.proximity, f.proximity);
    push('sixth', w.sixth, f.sixth);
    push('overall', w.overall, f.overall);
    // Hard-ish family preferences.
    if (fam.faith === 'want') push('faith', METHOD.fixed.faith, s.religion ? 1 : 0);
    if (fam.faith === 'avoid') push('faith', METHOD.fixed.faith, s.religion ? 0 : 1);
    const sex = input.child?.sex;
    if (s.gender === 'Girls' && sex === 'boy' || s.gender === 'Boys' && sex === 'girl') push('eligible', METHOD.fixed.ineligible, 0);
    if (fam.gender === 'single') push('gender', METHOD.fixed.singleSex, s.gender !== 'Mixed' ? 1 : 0);
    if (fam.gender === 'mixed') push('gender', METHOD.fixed.singleSex, s.gender === 'Mixed' ? 1 : 0);
    // Visit impressions deliberately do NOT enter the score: the match is the tool's independent view of the
    // evidence, and impressions are compared against it instead (see compareImpressions). Whether friends are
    // going is a fact, not an impression, and is a well-evidenced protective factor for the move to Year 7.
    const v = input.visits?.[s.urn] || {};
    if (v.friends && (transition.level === 'extra' || transition.level === 'some' || needs.some(x => x.id === 'belonging')))
      push('friends', METHOD.fixed.friends, v.friends === 'several' ? 1 : v.friends === 'one' ? 0.75 : 0.3);

    const tw = parts.reduce((t, p) => t + p.weight, 0);
    const raw = tw ? parts.reduce((t, p) => t + p.weight * p.value, 0) / tw : null;
    // Missing data shouldn't flatter a school: pull the score toward neutral in proportion to what we couldn't assess.
    const dataKeys = ['results', 'stretch', 'valueAdded', 'calm', 'pastoral', 'support', 'size', 'proximity', 'sixth', 'overall'];
    const covered = parts.filter(p => dataKeys.includes(p.key)).reduce((t, p) => t + p.weight, 0);
    const intended = dataKeys.reduce((t, k) => t + (k === 'proximity' && !home ? 0 : (w[k] || 0)), 0);
    const coverage = intended ? clamp(covered / intended) : 1;
    const score = raw == null ? null : 0.5 + (raw - 0.5) * (METHOD.coverageFloor + (1 - METHOD.coverageFloor) * coverage);
    const evidenceWeight = tw;
    const bandKey = score == null ? 'none' : BAND.find(([t]) => score >= t)[1];
    return { school: s, factors: f, parts, sizeMeta: w.sizeMeta, drivers: drivers(parts, f), coverage: round(coverage, 2), score: round(score, 3), bandKey, band: BAND_LABEL[mode][bandKey], evidenceWeight };
  };

  const shortlist = (input.shortlist || []).map(u => schools.find(s => s.urn === u)).filter(Boolean);
  const evaluated = shortlist.map(evalSchool);
  for (const e of evaluated) Object.assign(e, explain(e, { needs, input, ctx, child, home }));
  for (const e of evaluated) e.impressions = compareImpressions(e, needs, mode);
  const ranked = [...evaluated].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  // Which school the family's own overall verdict favours, so the report can say when it differs from the evidence.
  const byGut = evaluated.filter(e => e.impressions.fit).sort((a, b) => b.impressions.fit - a.impressions.fit || (b.score ?? 0) - (a.score ?? 0));
  const gutFavourite = byGut.length && byGut[0].impressions.fit >= 4 && (byGut.length < 2 || byGut[0].impressions.fit > byGut[1].impressions.fit) ? byGut[0].school : null;

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
    mode, prioritiesSet: input.family?.prioritiesSet ?? true, gutFavourite,
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
    weigh.push('No published GCSE results yet (a newer school), so judge it on Ofsted, leadership and the specific things you observe on a visit.');
  }

  // Climate and behaviour
  if (f.areas.beh) facts.push(`Ofsted ${f.areas.beh.name.toLowerCase()}: ${f.areas.beh.grade}${s.ofstedDate ? ` (${s.ofstedDate})` : ''}.`);
  const paVs = f.paResid == null ? '' : Math.abs(f.paResid) < 3 ? '; about typical for its intake' : f.paResid < 0 ? `; about ${round(-f.paResid)} points lower than schools with similar intakes` : `; about ${round(f.paResid)} points higher than schools with similar intakes`;
  if (s.persistentAbsence != null) facts.push(`Persistent absence ${pct(s.persistentAbsence)} (area median ${pct(M.pa)}${paVs}).`);
  const calmW = e.parts.find(p => p.key === 'calm')?.weight || 0;
  if (f.calm != null && calmW >= 3) {
    if (f.calm >= 0.68) { const bits = [f.areas.beh && `Ofsted rated ${f.areas.beh.name.toLowerCase()} as ${f.areas.beh.grade.toLowerCase()}`, f.paResid != null && f.paResid <= -3 && `persistent absence (${pct(s.persistentAbsence)}) is lower than at schools with similar intakes`].filter(Boolean); suits.push(`Signs of a settled climate${bits.length ? ': ' + bits.join(', and ') : ''}.`); }
    else if (f.calm <= 0.4) { const bits = [f.areas.beh && OFSTED_VALUE[f.areas.beh.grade] < 0.5 && `Ofsted judged ${f.areas.beh.name.toLowerCase()} as “${f.areas.beh.grade}”`, f.paResid != null && f.paResid >= 3 && `persistent absence (${pct(s.persistentAbsence)}) is higher than at schools with similar intakes`].filter(Boolean); weigh.push(`Climate indicators are weaker${bits.length ? ': ' + bits.join(', and ') : ''}. Watch lessons and corridors closely on your visit.`); }
  }
  if (f.areas.beh && OFSTED_VALUE[f.areas.beh.grade] < 0.5) questions.push(`Ofsted rated ${f.areas.beh.name.toLowerCase()} as “${f.areas.beh.grade}”. What has changed since, and what does it look like day to day?`);

  // Pastoral
  const pastW = e.parts.find(p => p.key === 'pastoral')?.weight || 0;
  if (f.areas.pd) facts.push(`Ofsted ${f.areas.pd.name.toLowerCase()}: ${f.areas.pd.grade}${f.areas.inc ? `; inclusion: ${f.areas.inc.grade}` : ''}.`);
  if (pastW >= 4) {
    if (f.pastoralEvidence === 'ofsted' && f.pastoral >= 0.7) suits.push(`Ofsted rated ${f.areas.pd?.name.toLowerCase() || 'personal development'} as ${f.areas.pd?.grade.toLowerCase()}${f.areas.inc ? ` and inclusion as ${f.areas.inc.grade.toLowerCase()}` : ''}, which is relevant for a child who needs strong pastoral care.`);
    else if (f.pastoralEvidence === 'ofsted' && f.pastoral <= 0.45) weigh.push(`Ofsted’s view of personal development / wellbeing is weaker here (“${f.areas.pd?.grade}”). Probe pastoral support carefully.`);
    else if (f.pastoralEvidence === 'weak') weigh.push('There is no recent published judgement on pastoral care or wellbeing, so check it specifically on your visit (see the observation checklist in Step 6).');
  }
  if (s.ptr != null) facts.push(`Pupil:teacher ratio ${s.ptr}:1.`);

  // Size
  if (f.yearGroup) facts.push(`Year group roughly ${f.yearGroup} pupils (area median ${M.cohort})${s.gcse.cohort ? '' : ', estimated'}.`);
  const sizeW = e.parts.find(p => p.key === 'size')?.weight || 0, sm = e.sizeMeta;
  if (f.small != null && sm) {
    const smallish = f.small >= 0.65, largish = f.small <= 0.35;
    if (sm.dir === 'smaller' && sizeW >= 1.5) {
      if (smallish) suits.push(`A smaller year group (about ${f.yearGroup}), which can make it easier to be known quickly.`);
      if (largish) weigh.push(`A large year group (about ${f.yearGroup}). Ask how they make it feel small: tutor groups, houses, a Year 7 base.`);
    }
    if (sm.dir === 'larger' && sizeW >= 1.5) {
      if (largish) suits.push(`A large year group (about ${f.yearGroup}): more people to meet and usually more clubs and options.`);
      if (smallish) weigh.push(`A smaller year group (about ${f.yearGroup}), so the friendship pool and options may be narrower.`);
    }
    // Mixed signals on size are a genuine trade-off: say so where this school sits at one end.
    if (sm.conflict && (smallish || largish)) weigh.push(`Size is a trade-off for you: ${sm.smallWhy.join(' and ')}, but ${sm.largeWhy.join(' and ')}. With a year group of about ${f.yearGroup}, this school is on the ${smallish ? 'small' : 'large'} side, so it’s worth deciding which matters more.`);
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
  if (e.coverage != null && e.coverage < 0.6) weigh.push('There is limited published data for the things that matter most for your child, so this rating is less certain. Use your visit to check the gaps.');
  if (s.religion) facts.push(`${s.religion} school. Check whether faith criteria apply in admissions.`);
  facts.push(s.sixthForm === true ? 'Has a sixth form.' : s.sixthForm === false ? 'No sixth form (11–16).' : (s.sixthNote || 'Sixth form: check with the school.'));
  if (fam.priorities?.sixth >= 3 && s.sixthForm === false) weigh.push('No sixth form, so they would move again at 16.');
  if (fam.priorities?.sixth >= 3 && s.sixthForm === true) suits.push('Has its own sixth form, so they could stay on at 16.');
  if (s.council && s.council !== 'Bristol City') facts.push(`Run by ${s.council} for admissions purposes. You still apply through your home council.`);
  if (fam.faith === 'want' && !s.religion) weigh.push('Not a faith school, which you said you would prefer.');
  if (fam.faith === 'avoid' && s.religion) weigh.push(`A ${s.religion} school, which you said you would rather avoid.`);
  if (fam.gender === 'single' && s.gender === 'Mixed') weigh.push('Mixed school; you said you would prefer single-sex.');

  // Visits: impressions are never offered as reasons a school suits (that would hand the family's own view
  // back to them with the tool's authority). Only the factual friends question is used here.
  const v = input.visits?.[s.urn] || {};
  if (v.friends === 'several' && e.parts.some(p => p.key === 'friends')) suits.push('Several friends are likely to go too, which is protective for the move to Year 7.');
  if (v.friends === 'none' && e.parts.some(p => p.key === 'friends')) weigh.push('No friends are likely to go. Ask how they help pupils who arrive alone make friends.');
  if (!hasImpressions(v)) questions.push('Not visited yet: use the observation checklist in Step 6 when you do, and ask your child for their view before you share yours.');

  return { suits, weigh, facts, questions, visit: v };
}

// ---------- 6. impressions vs evidence ----------
const hasImpressions = v => !!(v && (v.fit || v.child || Object.values(v.obs || {}).some(Boolean)));
const FACTOR_NAME = { calm: 'behaviour and calm', pastoral: 'pastoral care', stretch: 'stretch for able pupils', support: 'support for pupils who are behind' };

function evidenceDescription(key, e) {
  const s = e.school, f = e.factors;
  if (key === 'calm') return [f.areas.beh && `Ofsted: ${f.areas.beh.name.toLowerCase()} “${f.areas.beh.grade}”`, s.persistentAbsence != null && `persistent absence ${Math.round(s.persistentAbsence)}%${f.paResid != null ? (f.paResid >= 3 ? ', high for its intake' : f.paResid <= -3 ? ', low for its intake' : ', typical for its intake') : ''}`].filter(Boolean).join('; ');
  if (key === 'pastoral') return f.areas.pd ? `Ofsted: ${f.areas.pd.name.toLowerCase()} “${f.areas.pd.grade}”${f.areas.inc ? `, inclusion “${f.areas.inc.grade}”` : ''}` : 'limited published evidence';
  if (key === 'stretch') return s.gcse.g7 != null ? `${Math.round(s.gcse.g7)}% got grade 7+ in English and maths` : 'no published results';
  if (key === 'support') return f.areas.inc ? `Ofsted inclusion “${f.areas.inc.grade}”` : 'limited published evidence';
  return '';
}

// Compare what the family saw with what the evidence says. Disagreements are framed as questions to resolve,
// siding with neither: a visit is a staged snapshot, but data averages over pupils who aren't your child.
export function compareImpressions(e, needs, mode) {
  const v = e.visit || {};
  const out = { fit: v.fit || null, child: v.child || null, notes: v.notes || '', childNote: v.childNote || '', observed: [], disagreements: [] };
  if (!hasImpressions(v)) return out;
  const scale = { yes: 1, partly: 0.5, no: 0 };
  const byFactor = {};
  for (const o of OBSERVATIONS) {
    const val = v.obs?.[o.id];
    if (!val) continue;
    out.observed.push({ text: o.text, answer: val, matters: !!(o.need && needs.some(n => n.id === o.need)) });
    (byFactor[o.factor] ||= []).push(scale[val]);
  }
  const share = key => e.drivers.find(d => d.key === key)?.share || 0;
  for (const [key, vals] of Object.entries(byFactor)) {
    if (!FACTOR_NAME[key]) continue;
    const seen = vals.reduce((t, x) => t + x, 0) / vals.length;
    const data = e.factors[key];
    if (data == null || (key === 'pastoral' && e.factors.pastoralEvidence === 'weak')) continue;
    const matters = share(key) >= 0.08 || needs.some(n => n.id === key);
    if (!matters) continue;
    const desc = evidenceDescription(key, e);
    if (seen >= 0.75 && data <= 0.4) out.disagreements.push({ kind: 'better', factor: key,
      text: `On ${FACTOR_NAME[key]}, what you saw was more positive than the published evidence (${desc}). A visit is a prepared snapshot; the data covers every pupil across a whole year. Worth testing on an ordinary school day: ask what a normal Tuesday looks like, and what they are doing about it.` });
    if (seen <= 0.25 && data >= 0.65) out.disagreements.push({ kind: 'worse', factor: key,
      text: `On ${FACTOR_NAME[key]}, what you saw was less positive than the published evidence (${desc}). The data averages over every pupil; your visit may have picked up something it misses, or caught a bad moment. Worth pinning down exactly what concerned you, and asking about it directly.` });
  }
  const gut = v.fit;
  if (gut && mode === 'child') {
    if (gut >= 4 && (e.bandKey === 'mixed' || e.bandKey === 'weaker')) out.disagreements.push({ kind: 'better', factor: 'overall',
      text: `You rated it ${gut}/5 for your child, but on the evidence it’s a ${e.band.toLowerCase()} for their needs. What was it that appealed? Check whether it will still matter on an ordinary day in Year 8, not just on an open evening.` });
    if (gut <= 2 && (e.bandKey === 'strong' || e.bandKey === 'good')) out.disagreements.push({ kind: 'worse', factor: 'overall',
      text: `On the evidence it’s a ${e.band.toLowerCase()} for your child, but you rated it only ${gut}/5. Try to name why. If it’s something specific to your child, that matters; if it was the event itself, a second look on a normal day may help.` });
  }
  if (v.fit && v.child && Math.abs(v.fit - v.child) >= 2) out.disagreements.push({ kind: 'split', factor: 'family',
    text: `You and your child see this one differently (you ${v.fit}/5, your child ${v.child}/5). Worth a conversation about what each of you noticed.` });
  return out;
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
