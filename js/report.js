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

export function renderReport(r, { dataMeta = {}, preparedDate = new Date() } = {}) {
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
  const dataOnly = r.mode === 'data';
  if (dataOnly && r.schools.length) h += `<div class="notice warn"><p><strong>Compared on published data only.</strong> You haven’t told us about your child yet, so these ratings are not a personal match. They compare the schools on results, behaviour and attendance, pastoral evidence${r.family.located ? ', distance' : ''} and sixth form${r.prioritiesSet ? ', weighted by your priorities' : ', using standard weights because you haven’t adjusted the priorities in Step 5'}. Fill in Steps 2–4 for a report about your child.</p></div>`;
  h += `<section class="r-summary"><h2>In short</h2>`;
  if (!r.schools.length) h += `<p>You haven’t shortlisted any schools yet. Pick some in the school selector to get school-by-school guidance.</p>`;
  else {
    // Only pair the runner-up with the leader when it is genuinely close.
    const close = top[1] && (top[1].bandKey === top[0].bandKey || top[0].score - top[1].score < 0.05);
    if (dataOnly) h += `<p>${top.length ? `On the published data, <strong>${esc(top[0].school.name)}</strong> ${close ? `and <strong>${esc(top[1].school.name)}</strong> come out strongest` : r.schools.length > 1 ? 'comes out ahead' : `is rated “${esc(top[0].band.toLowerCase())}”`}. That says nothing yet about which would suit your child.` : ''}</p>`;
    else h += `<p>${top.length ? `On the evidence available, <strong>${esc(top[0].school.name)}</strong>${close ? ` and <strong>${esc(top[1].school.name)}</strong> look like the closest fits` : ' looks like the closest fit'} for ${name} and your family’s priorities.` : ''}</p>`;
    if (r.child.needs.length) h += `<p>What seems to matter most for ${name}: ${r.child.needs.slice(0, 3).map(n => `<strong>${esc(n.title.toLowerCase())}</strong>`).join('; ')}.</p>`;
    if (r.gutFavourite && r.gutFavourite.urn !== top[0].school.urn) h += `<p>Your own impressions favour <strong>${esc(r.gutFavourite.name)}</strong>. That’s worth taking seriously, and worth testing: see <a href="#r-impressions">where your impressions and the evidence disagree</a>.</p>`;
    h += `<p class="fine">This is a decision aid, not a ranking of school quality. ${dataOnly ? 'Ratings here use published data only.' : 'Match ratings are the tool’s independent view: published data seen through your child’s needs and your priorities. Your visit impressions are shown alongside, not counted in, so the two can be compared.'}</p>`;
  }
  h += `</section>`;

  // The outside view first: base rates before the detail (Kahneman), and some perspective.
  if (r.schools.length) h += `<div class="outside-view"><h3>Before the detail</h3><ul>
<li><strong>Most children settle.</strong> Even children who are anxious in July are usually settled by October half-term. The move is a bigger deal in prospect than in practice for most families.</li>
<li><strong>Differences between schools are smaller than they look.</strong> Headline results mostly reflect who a school admits, and one year’s figures often drift back towards average the next. Your child’s own effort, friendships and support at home matter more to how they do.</li>
<li><strong>No choice is irreversible.</strong> Children who are unhappy can and do move, and sixth form is another fresh start.</li>
<li>As Daniel Kahneman put it, “Nothing in life is as important as you think it is while you are thinking about it.”</li></ul></div>`;


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
    h += `<p class="notice"><strong>This is a snapshot, not a fixed picture.</strong> Traits are still settling at this age, and the years from about 10 to 14 bring predictable, usually temporary, shifts. Many children become less organised and more prone to worry in Years 7–9 before levelling out again. Use this profile for the move to secondary, which is where it matters most, rather than as a forecast of who ${name} will be at 16.</p>`;
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
    h += `<h2>4. Your shortlist side by side</h2><div class="table-wrap"><table class="compare"><thead><tr><th>School</th><th>${dataOnly ? "Rating" : "Match"}</th><th>Attainment 8</th><th>Eng &amp; maths 5+</th><th>Eng &amp; maths 7+</th><th>Year group</th><th>Persistent absence</th><th>Ofsted</th>${r.family.located ? '<th>Distance</th>' : ''}</tr></thead><tbody>`;
    for (const e of r.schools) {
      const s = e.school;
      h += `<tr><td>${esc(s.name)}</td><td><span class="band ${e.bandKey}">${esc(e.band)}</span></td><td>${s.gcse.a8 ?? '–'}</td><td>${pct(s.gcse.g5)}</td><td>${pct(s.gcse.g7)}</td><td>${e.factors.yearGroup ?? '–'}</td><td>${pct(s.persistentAbsence)}</td><td>${esc(s.ofsted || '–')}</td>${r.family.located ? `<td>${e.factors.distanceKm ?? '–'} km</td>` : ''}</tr>`;
    }
    h += `</tbody></table></div><p class="fine">Area medians across ${esc('Bristol-area')} state schools: Attainment 8 ${r.ctx.medians.a8}; grade 5+ ${pct(r.ctx.medians.g5)}; grade 7+ ${pct(r.ctx.medians.g7)}; persistent absence ${pct(r.ctx.medians.pa)}. Year group = Year 11 GCSE cohort as a proxy. Distance is straight-line from the centre of your postcode district.</p>`;

    // Impressions vs evidence
    const visited = r.schools.filter(e => e.impressions?.fit || e.impressions?.child || e.impressions?.observed.length);
    if (visited.length) {
      const dis = visited.flatMap(e => e.impressions.disagreements.map(d => ({ ...d, school: e.school.name })));
      h += `<h2 id="r-impressions">5. Where your impressions and the evidence disagree</h2>
<p>Your visits and the published data are two different kinds of evidence. The data covers every pupil over a whole year but knows nothing about your child; a visit is about your child but is one prepared afternoon. Where they agree, you can be more confident. Where they don’t, neither automatically wins, and that’s where the useful questions are.</p>`;
      h += dis.length
        ? `<ul class="disagree">${dis.map(d => `<li class="${d.kind}"><strong>${esc(d.school)}.</strong> ${esc(d.text)}</li>`).join('')}</ul>`
        : `<p><strong>No major disagreements.</strong> What you recorded broadly lines up with the published evidence for ${visited.map(e => esc(e.school.name)).join(', ')}.</p>`;
      const unvisited = r.schools.filter(e => !visited.includes(e));
      if (unvisited.length) h += `<p class="fine">Not yet visited: ${unvisited.map(e => esc(e.school.name)).join(', ')}.</p>`;
    }

    // School by school
    h += `<h2>6. School by school</h2>`;
    for (const e of r.schools) h += schoolBlock(e, name, dataOnly);
  }

  if (r.suggestions.length) {
    h += `<h2>7. Schools you might also look at</h2><p>Not on your shortlist, but within ${r.family.maxKm || 8} km and scoring at least as well on your child’s needs and your priorities as your lowest-rated shortlisted school.</p>`;
    for (const e of r.suggestions) h += `<div class="suggest"><strong>${esc(e.school.name)}</strong> <span class="band ${e.bandKey}">${esc(e.band)}</span> <span class="muted">· ${e.factors.distanceKm} km · ${esc(e.school.council || '')}</span>${list(e.suits.slice(0, 3), '')}</div>`;
  }

  // Questions
  if (r.generalQuestions.length) {
    h += `<h2>8. Questions to ask on every visit</h2><p>Tailored to ${name}. Ask the same questions everywhere so you can compare like with like.</p><ul class="questions">${r.generalQuestions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`;
  }

  h += `<h2>9. Talking it through with ${name}</h2>
<ul><li>Ask for their view of each school <strong>before</strong> you share yours. Once they know what you think, you’re hearing your own opinion back.</li>
<li>Ask what they noticed at each school (the people, the feel, the lunch queue), not just which they liked best.</li>
<li>Try a premortem together: “Imagine it’s Year 8 and it hasn’t gone well. What went wrong?” Do it for each of your top choices. It surfaces worries that “which did you like?” never does.</li>
<li>Ask: “Where could you see yourself having a good day? Where would a bad day be easier to handle?”</li>
<li>Their view matters even if you weigh things differently. Children who feel they had a say tend to settle better.</li>
<li>Whatever the outcome in March, children adapt. Most children who are anxious in July are settled by October half-term.</li></ul>`;

  // Evidence & caveats
  h += `<h2>How this report works</h2>
<p>The “describe your child” statements are everyday versions of well-researched temperament and personality dimensions. They are <strong>not</strong> a psychological assessment and have not been validated as a scale; they are a structured way to think about fit. Each school’s match combines those needs with your priorities and the published data, weighting the things that matter most for your child. Where data is missing the match is pulled towards “mixed” rather than guessed.</p>
<p>Your visit impressions are deliberately <strong>not</strong> part of the match. Counting them would hand your own view back to you with the tool’s authority. Instead they are set beside the evidence so you can see where the two agree and where they don’t. The visit checklist asks for specific observations before an overall verdict, because one striking feature on an open evening can colour everything else (the “halo effect”).</p>
<details class="evidence"><summary>The research behind it</summary><dl>${Object.values(EVIDENCE).map(e => `<dt>${esc(e.short)}</dt><dd>${e.refs.map(esc).join(' · ')}</dd>`).join('')}</dl></details>
<p class="fine">School data: ${esc(dataMeta.gcseYear || '')} GCSE results, Ofsted and pupil data compiled by <a href="https://findgreatschools.co.uk/gcse-results/bristol">FindGreatSchools</a> from DfE and Ofsted sources (retrieved ${esc(dataMeta.retrieved || '')}). Verify against <a href="https://www.compare-school-performance.service.gov.uk/">DfE Compare School Performance</a> and <a href="https://reports.ofsted.gov.uk/">Ofsted</a>. Admissions: you apply through your <a href="https://www.gov.uk/apply-for-secondary-school-place">home council</a>, even for schools in a neighbouring council area. This tool does not assess eligibility or catchment.</p>`;
  return h;
}

const WORRY = { friends: 'making new friends', losing: 'losing current friends', lost: 'getting lost', work: 'harder work', homework: 'homework', older: 'older students', teachers: 'strict teachers / getting into trouble', bullying: 'being picked on', journey: 'the journey' };
const pct = x => x == null ? '–' : `${Math.round(x)}%`;
const list = (a, empty) => a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : (empty ? `<p class="muted">${esc(empty)}</p>` : '');
const rateWord = v => v >= 0.7 ? 'Strong' : v >= 0.55 ? 'Above average' : v >= 0.45 ? 'Average' : v >= 0.3 ? 'Below average' : 'Weak';
function driversTable(e) {
  if (!e.drivers?.length) return '';
  return `<details class="drivers"><summary>What drove this rating</summary>
<p class="fine">Each row is one thing we weighed. “Weight” is its share of the overall rating, set by your child’s needs and your priorities. “This school” is how it compares with other Bristol-area schools.</p>
<table><thead><tr><th>Factor</th><th>Weight</th><th>This school</th></tr></thead><tbody>${e.drivers.map(d => `<tr><td>${esc(d.label)}${d.weak ? ' <span class="muted">(limited evidence)</span>' : ''}</td><td><span class="share"><span style="width:${Math.round(d.share * 100)}%"></span></span> ${Math.round(d.share * 100)}%</td><td><span class="rate r${Math.round(d.value * 4)}">${rateWord(d.value)}</span></td></tr>`).join('')}</tbody></table>
${e.coverage != null && e.coverage < 0.8 ? '<p class="fine">Some factors had no data for this school, so its rating has been pulled towards “mixed”.</p>' : ''}</details>`;
}

function motivationNote(m) {
  const needs = new Set(m.map(id => MOTIVATORS.find(x => x.id === id)?.need));
  if (needs.has('competence') && needs.has('autonomy')) return 'Mastery and choice are the most durable motivators. Look for teaching that offers challenge with some control over how they tackle it.';
  if (needs.has('competence')) return 'Wanting to get good at hard things is one of the most durable motivators. Look for well-pitched challenge and clear feedback.';
  if (needs.has('relatedness')) return 'Relationships drive their effort, so their relationships with teachers and a good tutor will matter a lot.';
  if (needs.has('autonomy')) return 'Having a say drives their effort. Look for teaching that offers some choice.';
  return 'Praise and rewards work in the short term. Over time it helps if the school also builds interest and pride in the work itself.';
}

const OBS_WORD = { yes: 'Yes', partly: 'Partly', no: 'No' };
// The family's own impressions, shown as theirs: alongside the evidence, never as reasons.
function visitBox(im) {
  if (!im || !(im.fit || im.child || im.observed.length || im.notes || im.childNote)) return '';
  const rows = [
    im.child && `Your child’s view: ${im.child}/5${im.childNote ? `: “${esc(im.childNote)}”` : ''}`,
    ...im.observed.map(o => `${esc(o.text)}: <strong>${OBS_WORD[o.answer]}</strong>${o.matters ? ' <span class="muted">(matters for your child)</span>' : ''}`),
    im.fit && `Your overall verdict: ${im.fit}/5`,
  ].filter(Boolean);
  return `<div class="visit-box"><h4>Your visit <span class="muted">(your impressions; not counted in the match)</span></h4>${rows.length ? `<ul>${rows.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}${im.notes ? `<p><strong>Your notes:</strong> ${esc(im.notes)}</p>` : ''}</div>`;
}

function schoolBlock(e, name, dataOnly) {
  const s = e.school;
  return `<div class="schoolprint">
<div class="school-head"><h3>${esc(s.name)}</h3><span class="band ${e.bandKey}">${esc(e.band)}</span></div>
<p class="muted">${esc([s.street, s.postcode].filter(Boolean).join(', '))} · ${esc(s.ageRange)} · ${esc(s.type || '')}${s.trust ? ` · ${esc(titleCase(s.trust))}` : ''}${s.website ? ` · <a href="${esc(s.website)}">website</a>` : ''}</p>
<div class="twocol"><div><h4>${dataOnly ? 'Strengths on the data' : `Why it may suit ${name}`}</h4>${list(e.suits, 'Nothing stands out strongly either way on the published evidence.')}</div>
<div><h4>Things to weigh</h4>${list(e.weigh, 'No particular concerns on the published evidence.')}</div></div>
${visitBox(e.impressions)}
${e.questions.length ? `<h4>Ask on your visit</h4>${list(e.questions, '')}` : ''}
${driversTable(e)}
<details><summary>Key facts</summary>${list(e.facts, '')}<p class="fine"><a href="${esc(s.profileUrl)}">Full data profile</a></p></details>
</div>`;
}
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
