// Renders an engine evaluation as a readable, printable report (HTML string). No DOM access.
import { DIMENSIONS, EVIDENCE, MOTIVATORS, INTERESTS, ATTAINMENT_LEVELS, SUBJECTS } from './questions.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Plain-language reading of each dimension and what it tends to mean at secondary school.
const READING = {
  sociability: {
    high: ['gets energy from being with lots of people', 'They are likely to enjoy the bigger social world of secondary school. The risk is distraction, not loneliness, so clubs and teams are a good outlet.'],
    low: ['prefers a few close friends and quieter settings', 'A big new year group can feel a lot at first. Keeping one or two existing friendships going, and finding a club with like-minded children, tends to matter more than size alone.'],
    mid: ['is comfortable both in groups and with a few friends', 'They are likely to adapt to most school sizes.'],
  },
  worry: {
    high: ['feels worries strongly and can take time to recover', 'This is the trait most linked to a bumpier start in Year 7. It responds well to preparation: knowing the site, the routine and a named adult before day one.'],
    low: ['usually takes knocks and changes in their stride', 'They are likely to cope well with the upheaval of Year 7. Still check in, as easy-going children sometimes keep problems to themselves.'],
    mid: ['has an ordinary mix of worry and resilience', 'Expect some nerves in September that settle by half-term.'],
  },
  selforg: {
    high: ['organises themselves and sticks at things', 'This is one of the strongest everyday predictors of doing well at secondary. They will probably manage homework and timetables with little help.'],
    low: ['still needs reminders and scaffolding to stay organised', 'Secondary asks for much more self-management. Schools with explicit routines and organisational support (planners, homework apps, tutor checks) help most while this develops, and it usually does develop.'],
    mid: ['is reasonably organised, with occasional wobbles', 'They will probably need a bit of help with the jump in organisation in the first term.'],
  },
  curiosity: {
    high: ['is hungry for ideas, depth and harder problems', 'They need real stretch. Boredom is a bigger risk to their motivation than difficulty.'],
    low: ['is happiest with familiar work at a comfortable pace', 'They may do best where teaching is clear and well sequenced, and where confidence is built before pace.'],
    mid: ['is curious about some things more than others', 'Look for good teaching in the subjects they love.'],
  },
  sensitivity: {
    high: ['finds noise and crowds draining and needs calm to recharge', 'Highly sensitive children are more affected by their surroundings, for better and for worse. A calm, well-run school can bring out the best in them. Watch corridors, canteens and lesson changeovers on your visits.'],
    low: ['is unbothered by noise and bustle', 'A busy site is unlikely to wear them down.'],
    mid: ['copes with busy places but notices them', 'Most school environments should be fine.'],
  },
  structure: {
    high: ['does best with clear expectations and routines', 'They are likely to feel safer in a school where rules and routines are explicit and consistent.'],
    low: ['copes well with loose plans and surprises', 'They should be comfortable with the variety of a secondary timetable.'],
    mid: ['likes some predictability but can flex', 'Most approaches to routine should suit them.'],
  },
  autonomy: {
    high: ['wants choice, a voice and reasons for rules', 'They may chafe at rules that are not explained. They will thrive where rules are clear and fair and students have a genuine say.'],
    low: ['is content to follow the plan they are given', 'They are unlikely to be troubled by a firmer behaviour policy.'],
    mid: ['likes some say but accepts most rules', 'Most behaviour approaches should be workable.'],
  },
};

const TRANSITION_TEXT = {
  smooth: ['Likely to settle well', 'Your answers suggest few of the known risk factors for a difficult move to Year 7. The usual preparation (visiting, practising the journey, sorting kit) should be enough.'],
  some: ['May need a little extra support', 'There are a few signs the move could be bumpy. Ordinary but deliberate preparation helps a lot: extra visits, practising the journey, keeping a friendship going over the summer, and telling the Year 7 team what you have told us.'],
  extra: ['Worth planning extra support', 'Several of the factors that research links to a harder transition are present. That does not predict how it will go, but it does mean the school’s transition and pastoral arrangements should weigh heavily in your choice. Tell the school early so they can plan, and ask about enhanced transition (extra induction days, summer schools, a named key adult).'],
};

const bandWord = { high: 'High', mid: 'Middle', low: 'Low' };

export function renderReport(r, { ai = null, dataMeta = {}, preparedDate = new Date() } = {}) {
  const name = r.child.name ? esc(r.child.name) : 'your child';
  const Name = r.child.name ? esc(r.child.name) : 'Your child';
  const P = r.child.profile;
  const dated = preparedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const answeredDims = DIMENSIONS.filter(d => P[d.id]?.band);
  const top = r.schools.filter(s => s.score != null).slice(0, 2);

  let h = `<div class="tag">Personalised family report</div>
<h1 class="report-title">Choosing a secondary school for ${name}</h1>
<p class="muted">Prepared ${dated}${r.family.outcode ? ` · Home area ${esc(r.family.outcode)}` : ''} · ${r.schools.length} school${r.schools.length === 1 ? '' : 's'} compared</p>`;

  // Summary
  h += `<section class="r-summary"><h2>In short</h2>`;
  if (!r.schools.length) h += `<p>You haven’t shortlisted any schools yet. Pick some in the school selector to get school-by-school guidance.</p>`;
  else {
    h += `<p>${top.length ? `On the evidence available, <strong>${esc(top[0].school.name)}</strong>${top[1] ? ` and <strong>${esc(top[1].school.name)}</strong> look like the closest fits` : ' looks like the closest fit'} for ${name} and your family’s priorities.` : ''}</p>`;
    if (r.child.needs.length) h += `<p>What seems to matter most for ${name}: ${r.child.needs.slice(0, 3).map(n => `<strong>${esc(n.title.toLowerCase())}</strong>`).join('; ')}.</p>`;
    h += `<p class="fine">This is a decision aid, not a ranking of school quality. Match ratings combine published data with what you told us, and your visits should count for more than any number here.</p>`;
  }
  h += `</section>`;

  if (ai) h += `<section class="r-ai"><h2>A considered view <span class="pill">AI write-up</span></h2>${ai}</section>`;

  // Child profile
  h += `<h2>1. ${Name} at a glance</h2>`;
  if (!answeredDims.length) h += `<p class="muted">You didn’t answer enough of the “describe your child” statements to build a profile. The report below relies on your priorities and published data only.</p>`;
  else {
    h += `<div class="profile-grid">`;
    for (const d of DIMENSIONS) {
      const p = P[d.id];
      if (!p?.band) continue;
      const [summary, implication] = READING[d.id][p.band];
      h += `<div class="dim"><div class="dim-head"><strong>${esc(d.title)}</strong><span class="dim-band ${p.band}">${bandWord[p.band]}</span></div>
<div class="meter" role="img" aria-label="${esc(d.title)}: ${p.score} out of 100"><span style="left:${p.score}%"></span></div>
<div class="meter-poles"><span>${esc(d.low)}</span><span>${esc(d.high)}</span></div>
<p>${Name} ${esc(summary)}. ${esc(implication)}</p></div>`;
    }
    h += `</div>`;
  }
  const mot = r.child.motivators.map(id => MOTIVATORS.find(m => m.id === id)?.label).filter(Boolean);
  if (mot.length) h += `<p><strong>What makes them try hard:</strong> ${esc(mot.join('; ').toLowerCase())}. ${motivationNote(r.child.motivators)}</p>`;
  const att = SUBJECTS.map(([id, l]) => [l, ATTAINMENT_LEVELS.find(x => x.v === r.child.attainment.bySubject?.[id])]).filter(([, x]) => x && x.v);
  if (att.length) h += `<p><strong>Where they are academically (your view):</strong> ${att.map(([l, x]) => `${esc(l)}: ${esc(x.label.toLowerCase())}`).join('; ')}.</p>`;
  const ints = r.child.interests.map(id => INTERESTS.find(i => i[0] === id)?.[1]).filter(Boolean);
  if (ints.length) h += `<p><strong>Interests:</strong> ${esc(ints.join(', '))}.</p>`;

  // Needs
  if (r.child.needs.length) {
    h += `<h2>2. What the research suggests will help ${name}</h2><ol class="needs">`;
    for (const n of r.child.needs) h += `<li><strong>${esc(n.title)}.</strong> ${esc(n.why)}</li>`;
    h += `</ol>`;
  }

  // Transition
  const t = r.child.transition;
  if (t.level) {
    const [title, body] = TRANSITION_TEXT[t.level];
    h += `<h2>3. The move to Year 7</h2><p><strong>${title}.</strong> ${body}</p>`;
    if (t.risks.length || t.protective.length) h += `<div class="twocol"><div><h4>Things to plan for</h4>${list(t.risks, 'None noted')}</div><div><h4>Things in their favour</h4>${list(t.protective, 'None noted')}</div></div>`;
    if (t.worries.length) h += `<p><strong>Worries they’ve mentioned:</strong> ${esc(t.worries.map(w => WORRY[w] || w).join(', '))}. Naming these to the school’s Year 7 team before September lets them address them directly.</p>`;
  }

  // Comparison table
  if (r.schools.length) {
    h += `<h2>4. Your shortlist side by side</h2><div class="table-wrap"><table class="compare"><thead><tr><th>School</th><th>Match</th><th>Attainment 8</th><th>Eng &amp; maths 5+</th><th>Eng &amp; maths 7+</th><th>Year group</th><th>Persistent absence</th><th>Ofsted</th>${r.family.located ? '<th>Distance</th>' : ''}</tr></thead><tbody>`;
    for (const e of r.schools) {
      const s = e.school;
      h += `<tr><td>${esc(s.name)}</td><td><span class="band ${bandClass(e.band)}">${esc(e.band)}</span></td><td>${s.gcse.a8 ?? '–'}</td><td>${pct(s.gcse.g5)}</td><td>${pct(s.gcse.g7)}</td><td>${e.factors.yearGroup ?? '–'}</td><td>${pct(s.persistentAbsence)}</td><td>${esc(s.ofsted || '–')}</td>${r.family.located ? `<td>${e.factors.distanceKm ?? '–'} km</td>` : ''}</tr>`;
    }
    h += `</tbody></table></div><p class="fine">Area medians across ${esc('Bristol-area')} state schools: Attainment 8 ${r.ctx.medians.a8}; grade 5+ ${pct(r.ctx.medians.g5)}; grade 7+ ${pct(r.ctx.medians.g7)}; persistent absence ${pct(r.ctx.medians.pa)}. Year group = Year 11 GCSE cohort as a proxy. Distance is straight-line from the centre of your postcode district.</p>`;

    // School by school
    h += `<h2>5. School by school</h2>`;
    for (const e of r.schools) h += schoolBlock(e, name);
  }

  if (r.suggestions.length) {
    h += `<h2>6. Schools you might also look at</h2><p>Not on your shortlist, but within ${r.family.maxKm || 8} km and scoring at least as well on your child’s needs and your priorities as your lowest-rated shortlisted school.</p>`;
    for (const e of r.suggestions) h += `<div class="suggest"><strong>${esc(e.school.name)}</strong> <span class="band ${bandClass(e.band)}">${esc(e.band)}</span> <span class="muted">· ${e.factors.distanceKm} km · ${esc(e.school.council || '')}</span>${list(e.suits.slice(0, 3), '')}</div>`;
  }

  // Questions
  if (r.generalQuestions.length) {
    h += `<h2>7. Questions to ask on every visit</h2><p>Tailored to ${name}. Ask the same questions everywhere so you can compare like with like.</p><ul class="questions">${r.generalQuestions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`;
  }

  h += `<h2>8. Talking it through with ${name}</h2>
<ul><li>Ask what they noticed at each school (the people, the feel, the lunch queue), not just which they liked best.</li>
<li>Ask: “Where could you see yourself having a good day? Where would a bad day be easier to handle?”</li>
<li>Their view matters even if you weigh things differently. Children who feel they had a say tend to settle better.</li>
<li>Whatever the outcome in March, children adapt. Most children who are anxious in July are settled by October half-term.</li></ul>`;

  // Evidence & caveats
  h += `<h2>How this report works</h2>
<p>The “describe your child” statements are everyday versions of well-researched temperament and personality dimensions. They are <strong>not</strong> a psychological assessment and have not been validated as a scale; they are a structured way to think about fit. Each school’s match combines those needs with your priorities, published data and your own visit ratings, weighting the things that matter most for your child. Where data is missing the match is pulled towards “mixed” rather than guessed.</p>
<details class="evidence"><summary>The research behind it</summary><dl>${Object.values(EVIDENCE).map(e => `<dt>${esc(e.short)}</dt><dd>${e.refs.map(esc).join(' · ')}</dd>`).join('')}</dl></details>
<p class="fine">School data: ${esc(dataMeta.gcseYear || '')} GCSE results, Ofsted and pupil data compiled by <a href="https://findgreatschools.co.uk/gcse-results/bristol">FindGreatSchools</a> from DfE and Ofsted sources (retrieved ${esc(dataMeta.retrieved || '')}). Verify against <a href="https://www.compare-school-performance.service.gov.uk/">DfE Compare School Performance</a> and <a href="https://reports.ofsted.gov.uk/">Ofsted</a>. Admissions: you apply through your <a href="https://www.gov.uk/apply-for-secondary-school-place">home council</a>, even for schools in a neighbouring council area. This tool does not assess eligibility or catchment.</p>`;
  return h;
}

const WORRY = { friends: 'making new friends', losing: 'losing current friends', lost: 'getting lost', work: 'harder work', homework: 'homework', older: 'older students', teachers: 'strict teachers / getting into trouble', bullying: 'being picked on', journey: 'the journey' };
const pct = x => x == null ? '–' : `${Math.round(x)}%`;
const list = (a, empty) => a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : (empty ? `<p class="muted">${esc(empty)}</p>` : '');
const bandClass = b => b.split(' ')[0].toLowerCase();

function motivationNote(m) {
  const needs = new Set(m.map(id => MOTIVATORS.find(x => x.id === id)?.need));
  if (needs.has('competence') && needs.has('autonomy')) return 'Mastery and choice are the most durable motivators. Look for teaching that offers challenge with some control over how they tackle it.';
  if (needs.has('competence')) return 'Wanting to get good at hard things is one of the most durable motivators. Look for well-pitched challenge and clear feedback.';
  if (needs.has('relatedness')) return 'Relationships drive their effort, so their relationships with teachers and a good tutor will matter a lot.';
  if (needs.has('autonomy')) return 'Having a say drives their effort. Look for teaching that offers some choice.';
  return 'Praise and rewards work in the short term. Over time it helps if the school also builds interest and pride in the work itself.';
}

function schoolBlock(e, name) {
  const s = e.school;
  return `<div class="schoolprint">
<div class="school-head"><h3>${esc(s.name)}</h3><span class="band ${bandClass(e.band)}">${esc(e.band)}</span></div>
<p class="muted">${esc([s.street, s.postcode].filter(Boolean).join(', '))} · ${esc(s.ageRange)} · ${esc(s.type || '')}${s.trust ? ` · ${esc(titleCase(s.trust))}` : ''}${s.website ? ` · <a href="${esc(s.website)}">website</a>` : ''}</p>
<div class="twocol"><div><h4>Why it may suit ${name}</h4>${list(e.suits, 'Nothing stands out strongly either way on the published evidence.')}</div>
<div><h4>Things to weigh</h4>${list(e.weigh, 'No particular concerns on the published evidence.')}</div></div>
${e.visit?.notes ? `<p><strong>Your notes:</strong> ${esc(e.visit.notes)}</p>` : ''}
${e.questions.length ? `<h4>Ask on your visit</h4>${list(e.questions, '')}` : ''}
<details><summary>Key facts</summary>${list(e.facts, '')}<p class="fine"><a href="${esc(s.profileUrl)}">Full data profile</a></p></details>
</div>`;
}
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
