// Server-side AI write-up. The prompt is composed here from a validated, de-identified payload,
// so the endpoint can't be used as a general-purpose Claude proxy.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.FUTURES_MODEL || 'claude-opus-5-5';

const SYSTEM = `You are helping a parent in the Bristol area choose a state secondary school for their child (entry at Year 7, age 11).
You receive a structured, de-identified summary: a parent-reported temperament profile (everyday versions of research-based dimensions, not a clinical assessment), the needs a rules-based engine derived from it, the family's priorities, and evidence for each shortlisted school (published data and the family's own visit impressions).

Write a warm, plain-English, evidence-led write-up that helps the parent think, not one that tells them what to do.
- Use only the evidence provided. Never invent facts about a school (clubs, policies, staff, reputations). If something important is unknown, say it needs checking on a visit.
- Treat the family's visit ratings and notes as first-hand evidence that can outweigh published data.
- Headline results mostly reflect intake; don't equate high results with good teaching for this child.
- Name genuine trade-offs between schools rather than declaring a winner. You may say which look like the closest fits, and why.
- No diagnostic or clinical language. Never label the child. Refer to them as "your child".
- UK spelling. Short paragraphs. No markdown headings, bullet characters or bold inside strings.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'schools', 'tradeoffs', 'next_steps'],
  properties: {
    overview: { type: 'string', description: '2-3 short paragraphs (separated by blank lines) on what this child needs from a school and how the shortlist looks overall.' },
    schools: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'narrative'],
        properties: { name: { type: 'string' }, narrative: { type: 'string', description: 'One paragraph on how this school fits this particular child, citing the evidence.' } },
      },
    },
    tradeoffs: { type: 'string', description: 'One paragraph naming the real choices between the leading options.' },
    next_steps: { type: 'array', items: { type: 'string' }, description: '3-5 concrete next steps for the family.' },
  },
};

// ---- validation: accept only the shape js/ai-payload.js produces, with bounded sizes ----
const str = (x, n = 400) => typeof x === 'string' ? x.slice(0, n) : '';
const strs = (a, k = 12, n = 400) => Array.isArray(a) ? a.slice(0, k).map(x => str(x, n)).filter(Boolean) : [];
const num = (x, lo, hi) => (typeof x === 'number' && x >= lo && x <= hi) ? x : null;

export function sanitisePayload(p) {
  if (!p || typeof p !== 'object') throw Object.assign(new Error('Invalid payload'), { status: 400 });
  const c = p.child || {}, f = p.family || {};
  const out = {
    child: {
      profile: (Array.isArray(c.profile) ? c.profile.slice(0, 10) : []).map(d => ({ trait: str(d.trait, 60), level: ['high', 'mid', 'low'].includes(d.level) ? d.level : 'mid', meaning: str(d.meaning, 120) })),
      attainment: ['above', 'expected', 'below'].includes(c.attainment) ? c.attainment : null,
      motivators: strs(c.motivators, 5, 80), interests: strs(c.interests, 12, 60),
      transition: c.transition ? { outlook: str(c.transition.outlook, 20), risks: strs(c.transition.risks, 8, 120), strengths: strs(c.transition.strengths, 8, 120) } : null,
      needs: (Array.isArray(c.needs) ? c.needs.slice(0, 10) : []).map(n => ({ need: str(n.need, 120), strength: num(n.strength, 0, 1) })),
    },
    family: {
      priorities: Object.fromEntries(Object.entries(f.priorities || {}).slice(0, 10).map(([k, v]) => [str(k, 20), num(v, 0, 5)])),
      sizePreference: str(f.sizePreference, 10), discipline: str(f.discipline, 12), faith: str(f.faith, 8), singleSex: str(f.singleSex, 8),
    },
    schools: (Array.isArray(p.schools) ? p.schools.slice(0, 8) : []).map(s => ({
      name: str(s.name, 80), match: str(s.match, 30), supporting: strs(s.supporting), concerns: strs(s.concerns), facts: strs(s.facts, 16, 240),
      visit: s.visit ? { parentFit: num(s.visit.parentFit, 1, 5), childView: num(s.visit.childView, 1, 5), feel: num(s.visit.feel, 1, 5), notes: str(s.visit.notes, 600) || undefined } : null,
    })),
  };
  if (!out.schools.length) throw Object.assign(new Error('Add at least one school to your shortlist first.'), { status: 400 });
  return out;
}

export async function generateNarrative(payload, { client = new Anthropic() } = {}) {
  const clean = sanitisePayload(payload);
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Here is the family's summary as JSON:\n\n${JSON.stringify(clean, null, 1)}\n\nWrite the write-up.` }],
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('The AI declined to write this report.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('The AI write-up was cut short. Please try again.'), { status: 502 });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { ...JSON.parse(text), model: response.model, usage: response.usage };
}

// Deterministic stand-in used by tests and by AI_MOCK=1, so the whole flow can be exercised without a key.
export function mockNarrative(payload) {
  const clean = sanitisePayload(payload);
  const needs = clean.child.needs.map(n => n.need.toLowerCase());
  return {
    overview: `[Mock write-up] Your child’s profile points to ${needs.slice(0, 2).join(' and ') || 'no strong specific needs'}.\n\nYou have shortlisted ${clean.schools.length} school(s).`,
    schools: clean.schools.map(s => ({ name: s.name, narrative: `[Mock] ${s.name}: ${s.match}. ${s.supporting[0] || ''} ${s.concerns[0] || ''}`.trim() })),
    tradeoffs: '[Mock] Trade-offs would be described here.',
    next_steps: ['Visit each school on a normal school day', 'Ask the tailored questions', 'Talk it through with your child'],
    model: 'mock',
  };
}
