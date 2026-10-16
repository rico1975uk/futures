// Generates copy-and-paste prompts so parents can use their own AI assistant (Claude, Gemini, ChatGPT…)
// to research what our data can't tell them. Pure functions: no DOM, so they're testable.
import { DIMENSIONS, MOTIVATORS, INTERESTS } from './questions.js';

const GROUND_RULES = `Ground rules for your answer:
- Search the web where you can, and give me a link for every fact about a school.
- Prefer official sources: the school's own website, Ofsted reports, the council's admissions pages, DfE data.
- If you can't find something, say so plainly. Don't guess or fill gaps from general knowledge.
- Flag anything that may be out of date (policies and staff change; note the year of what you find).
- Use plain UK English.`;

function childSummary(r, { includeName, includeWellbeing }) {
  const who = includeName && r.child.name ? r.child.name : 'my child';
  const lines = [];
  const prof = DIMENSIONS.filter(d => r.child.profile[d.id]?.band && r.child.profile[d.id].band !== 'mid')
    .map(d => `${r.child.profile[d.id].band === 'high' ? d.high : d.low} (${d.title.toLowerCase()})`);
  if (prof.length) lines.push(`Temperament (my own ratings): ${prof.join('; ')}.`);
  if (r.child.attainment.band) lines.push(`Academically: ${({ above: 'working above expected levels', expected: 'working at about expected levels', below: 'working below expected levels in at least one core subject' })[r.child.attainment.band]}.`);
  const ints = r.child.interests.map(id => INTERESTS.find(i => i[0] === id)?.[1].toLowerCase()).filter(Boolean);
  if (ints.length) lines.push(`Interests: ${ints.join(', ')}.`);
  const mot = r.child.motivators.map(id => MOTIVATORS.find(m => m.id === id)?.label.toLowerCase()).filter(Boolean);
  if (mot.length) lines.push(`Motivated by: ${mot.join('; ')}.`);
  if (r.child.transition.level) lines.push(`Move to Year 7: ${({ smooth: 'likely to settle well', some: 'may need a little extra support', extra: 'likely to need extra support' })[r.child.transition.level]}${includeWellbeing && r.child.transition.risks.length ? ` (${r.child.transition.risks.join('; ').toLowerCase()})` : ''}.`);
  if (r.child.needs.length) lines.push(`What seems to matter most for them: ${r.child.needs.map(n => n.title.toLowerCase()).join('; ')}.`);
  return { who, text: lines.length ? lines.map(l => `- ${l}`).join('\n') : '- (No profile details given.)' };
}

function prioritiesText(r) {
  const p = r.family.priorities || {};
  const names = { results: 'strong results and stretch', behaviour: 'calm, orderly behaviour', pastoral: 'pastoral care and wellbeing', journey: 'an easy journey', sixth: 'a sixth form' };
  const top = Object.entries(p).filter(([, v]) => v >= 4).map(([k]) => names[k]).filter(Boolean);
  const extra = [
    r.family.sizePref === 'small' && 'a smaller year group', r.family.sizePref === 'large' && 'a larger year group',
    r.family.discipline === 'structured' && 'very explicit, tightly enforced rules', r.family.discipline === 'flexible' && 'a more flexible, informal approach to behaviour',
    r.family.faith === 'want' && 'a faith school', r.family.faith === 'avoid' && 'a non-faith school',
    r.family.gender === 'single' && 'single-sex', r.family.gender === 'mixed' && 'mixed',
  ].filter(Boolean);
  return [...top, ...extra].join('; ') || 'no strong preferences';
}

const schoolLabel = s => `${s.name} (${[s.postcode, s.council && s.council !== 'Bristol City' ? s.council : null].filter(Boolean).join(', ')})`;

// What to dig for, tailored to this child's needs and interests.
function researchAsks(r) {
  const has = id => r.child.needs.some(n => n.id === id);
  const asks = [
    'How Year 7 transition works: induction days, summer school, buddy or mentor schemes, and who a new Year 7 pupil’s main contact is.',
    'The behaviour policy in practice: how strict it is, how sanctions and detentions work, the phone policy, and anything recent parents or Ofsted have said about it.',
  ];
  if (has('pastoral') || r.child.transition.level === 'extra') asks.push('Pastoral support: the tutor or house system, any wellbeing or counselling provision, and how they handle bullying.');
  if (has('calm')) asks.push('Anything about the physical environment: site size, crowding at lesson changes and lunch, and quieter spaces for pupils who need them.');
  if (has('structure')) asks.push('How they help Year 7s get organised: planners, homework platforms and how homework is set and checked.');
  if (has('stretch')) asks.push('How they stretch high attainers: setting, triple science, extension or scholars programmes, enrichment.');
  if (has('support')) asks.push('Catch-up support: reading and maths intervention in Year 7, and how they identify gaps on entry.');
  if (has('autonomy')) asks.push('Student voice: school council, pupil leadership, and how rules are explained to students.');
  const ints = r.child.interests.map(id => INTERESTS.find(i => i[0] === id)?.[1].toLowerCase()).filter(Boolean);
  if (ints.length) asks.push(`Clubs, enrichment and GCSE options relevant to these interests: ${ints.join(', ')}.`);
  asks.push('Open evening / open morning dates for this year, and whether you can visit on a normal school day.');
  return asks;
}

export function buildPrompts(r, { includeArea = true, includeName = false, includeNotes = true, includeWellbeing = false } = {}) {
  const { who, text: child } = childSummary(r, { includeName, includeWellbeing });
  // Research prompts only need what shapes the search, not the child's personal details.
  const ints = r.child.interests.map(id => INTERESTS.find(i => i[0] === id)?.[1].toLowerCase()).filter(Boolean);
  const brief = [
    r.child.needs.length && `What matters most for them: ${r.child.needs.map(n => n.title.toLowerCase()).join('; ')}.`,
    r.child.attainment.band && `Academically: ${({ above: 'working above expected levels', expected: 'working at about expected levels', below: 'working below expected levels in at least one core subject' })[r.child.attainment.band]}.`,
    ints.length && `Interests: ${ints.join(', ')}.`,
  ].filter(Boolean).join(' ') || 'No particular needs given.';
  const area = includeArea && r.family.outcode ? r.family.outcode : null;
  const schools = r.schools;
  const prompts = [];
  if (!schools.length) return prompts;
  const where = area ? `We live in the ${area} postcode district of Bristol.` : 'We live in the Bristol area.';

  // 1. Full context: the report as a starting point for a conversation.
  const shortlist = schools.map(e => {
    const v = e.visit || {};
    const visit = [v.fit && `my rating of fit ${v.fit}/5`, v.child && `${who}'s rating ${v.child}/5`, includeNotes && v.notes && `my notes: "${v.notes.trim()}"`].filter(Boolean).join('; ');
    return `### ${schoolLabel(e.school)}: ${e.band}
Why it may suit: ${e.suits.join(' ') || 'nothing stands out on the published data.'}
To weigh: ${e.weigh.join(' ') || 'no particular concerns on the published data.'}
Key facts: ${e.facts.join(' ')}${visit ? `\nOur visit: ${visit}.` : ''}`;
  }).join('\n\n');
  prompts.push({
    id: 'context', title: 'Talk it through', when: 'Start here. Gives your AI the whole picture so you can ask follow-up questions in your own words.',
    text: `I'm a parent choosing a state secondary school (Year 7 entry) for ${who}. ${where} I've used a decision tool that combined my description of ${who} with published school data. Its summary is below. I'd like your help thinking it through.

About ${who}:
${child}

Our family's priorities: ${prioritiesText(r)}.

The schools we're considering, with the tool's assessment:

${shortlist}

Please:
1. In a few paragraphs, tell me what stands out to you, including anything the tool may have missed or overweighted.
2. Name the real trade-offs between the leading options.
3. Ask me up to five questions that would most help sharpen the decision.

Treat the tool's ratings as a starting point, not the truth. My own visit impressions should count for a lot. Don't label or diagnose my child.

${GROUND_RULES}`,
  });

  // 2. Admissions realism: the biggest gap in our data.
  const councils = [...new Set(schools.map(e => e.school.council).filter(Boolean))];
  prompts.push({
    id: 'admissions', title: 'Could we actually get a place?', when: 'Our tool can’t tell you this. Councils publish how places were offered last year.',
    text: `I'm applying for a Year 7 place at a state secondary school. ${where}

For each school below, please find the most recent published admissions information:
- the published admission number (Year 7 places)
- whether it was oversubscribed, and how many applications it had
- its oversubscription criteria in order (e.g. looked-after children, siblings, ${schools.some(e => e.school.religion) ? 'faith, ' : ''}catchment or feeder schools, distance)
- the "last distance offered" or equivalent for the last 2–3 years, and any catchment or priority area${area ? `\n- whether a family living in ${area} has realistically been offered places` : ''}

Schools:
${schools.map(e => `- ${schoolLabel(e.school)}`).join('\n')}

Look on the council admissions pages (${councils.map(c => c === 'Bristol City' ? 'Bristol City Council' : c + ' Council').join(', ')}) and the schools' own admissions policies. Note that we apply through our home council even for schools run by a neighbouring council. Present the answer as a table, then a short plain-English summary of which schools look realistic.

${GROUND_RULES}`,
  });

  // 3. Deep-dive research on each school.
  const asks = researchAsks(r);
  for (const e of schools) {
    prompts.push({
      id: `research-${e.school.urn}`, title: `Research ${e.school.name}`, school: e.school.name,
      when: 'Finds what published data doesn’t show, tailored to your child.',
      text: `Please research ${schoolLabel(e.school)}${e.school.website ? `, website ${e.school.website}` : ''}, for a parent considering it for Year 7.

About the child: ${brief}

Please find out:
${asks.map((a, i) => `${i + 1}. ${a}`).join('\n')}
${asks.length + 1}. A summary of its most recent Ofsted report${e.school.ofstedDate ? ` (inspected ${e.school.ofstedDate})` : ''}: strengths and areas to improve, in plain English.
${asks.length + 2}. Any significant recent news (leadership changes, building work, changes to the trust).

Finish with three questions I should ask on my visit, based on what you found and what you couldn't find.

${GROUND_RULES}`,
    });
  }

  // 4. Head to head between the top two.
  if (schools.length >= 2) {
    const [a, b] = schools;
    prompts.push({
      id: 'compare', title: `${a.school.name} vs ${b.school.name}`, when: 'Your two closest fits, compared side by side for your child specifically.',
      text: `I'm choosing between two secondary schools for ${who}: ${schoolLabel(a.school)} and ${schoolLabel(b.school)}. ${where}

About ${who}:
${child}

Our priorities: ${prioritiesText(r)}.

What I know so far:
- ${a.school.name}: ${[...a.suits, ...a.weigh].join(' ')}
- ${b.school.name}: ${[...b.suits, ...b.weigh].join(' ')}

Research both schools, then compare them side by side on what matters for this child (not generally). Present it as a table followed by "The case for each" in a short paragraph each. Don't pick a winner for me. Help me see the trade-off clearly.

${GROUND_RULES}`,
    });
  }

  // 5. Visit preparation and the conversation with the child.
  prompts.push({
    id: 'visit', title: 'Plan our visits', when: 'Turns the report into a one-page checklist, and questions your child can ask.',
    text: `I'm visiting secondary schools with ${who} (age 10–11) and want to get the most out of each visit.

About ${who}:
${child}

Here are the questions I want answered at every school:
${r.generalQuestions.map(q => `- ${q}`).join('\n') || '- (none yet)'}

Please:
1. Turn these into a one-page visit checklist I can print and use at each school: the most important questions first, plus things to look out for (lessons, corridors at changeover, lunch, how staff and pupils speak to each other).
2. Suggest 5 questions ${who} could ask pupils or teachers themselves, in their own words.
3. Suggest a few gentle questions I can ask ${who} afterwards to find out how they really felt, without leading them.`,
  });

  // Final safety net: honour the privacy switches even where the district or name appears inside
  // engine facts ("2 km from the centre of BS7") or the parent's own notes.
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scrubs = [];
  if (!area && r.family.outcode) scrubs.push([new RegExp(`\\b${escRe(r.family.outcode)}\\b(?! \\d)`, 'g'), 'our home area']);
  if (!includeName && r.child.name?.length > 1) scrubs.push([new RegExp(`\\b${escRe(r.child.name)}\\b`, 'gi'), 'my child']);
  for (const p of prompts) for (const [re, to] of scrubs) p.text = p.text.replace(re, to);
  return prompts;
}

export function allPromptsText(prompts) {
  return prompts.map(p => `=== ${p.title} ===\n\n${p.text}`).join('\n\n\n');
}
