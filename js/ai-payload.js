// Builds the de-identified summary sent to the AI write-up endpoint.
// Deliberately excludes: the child's name, the postcode, and raw questionnaire answers.
// The parent can preview exactly this object before sending.
import { DIMENSIONS, MOTIVATORS, INTERESTS } from './questions.js';

const clip = (s, n) => String(s ?? '').slice(0, n);

export function buildAiPayload(r, { includeNotes = true } = {}) {
  // Belt and braces: scrub the home district and the child's name from every string we send.
  const scrubbers = [];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (r.family.outcode) scrubbers.push([new RegExp(`\\b${escRe(r.family.outcode)}\\b`, 'gi'), 'your home area']);
  if (r.child.name && r.child.name.length > 1) scrubbers.push([new RegExp(`\\b${escRe(r.child.name)}\\b`, 'gi'), 'your child']);
  const scrub = x => typeof x === 'string' ? scrubbers.reduce((s, [re, to]) => s.replace(re, to), x)
    : Array.isArray(x) ? x.map(scrub) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, scrub(v)])) : x;
  return scrub({
    child: {
      profile: DIMENSIONS.filter(d => r.child.profile[d.id]?.band).map(d => ({
        trait: d.title, level: r.child.profile[d.id].band,
        meaning: r.child.profile[d.id].band === 'high' ? d.high : r.child.profile[d.id].band === 'low' ? d.low : 'in between',
      })),
      attainment: r.child.attainment.band,
      motivators: r.child.motivators.map(id => MOTIVATORS.find(m => m.id === id)?.label).filter(Boolean),
      interests: r.child.interests.map(id => INTERESTS.find(i => i[0] === id)?.[1]).filter(Boolean),
      transition: r.child.transition.level ? { outlook: r.child.transition.level, risks: r.child.transition.risks, strengths: r.child.transition.protective } : null,
      needs: r.child.needs.map(n => ({ need: n.title, strength: n.strength })),
    },
    family: {
      priorities: r.family.priorities, sizePreference: r.family.sizePref || 'none',
      discipline: r.family.discipline || 'balanced', faith: r.family.faith || 'none', singleSex: r.family.gender || 'none',
    },
    schools: r.schools.slice(0, 8).map(e => ({
      name: e.school.name, match: e.band, supporting: e.suits, concerns: e.weigh, facts: e.facts,
      visit: e.visit && (e.visit.fit || e.visit.child || e.visit.feel || e.visit.notes) ? {
        parentFit: e.visit.fit || null, childView: e.visit.child || null, feel: e.visit.feel || null,
        notes: includeNotes ? clip(e.visit.notes, 600) : undefined,
      } : null,
    })),
  });
}
