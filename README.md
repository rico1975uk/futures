# Futures: choosing a Bristol secondary school

A free, private decision aid for parents in the Bristol area. A parent describes their child in everyday terms, sets their family's priorities, shortlists schools and records what they see on visits. They get a personalised, evidence-based qualitative report, plus ready-made prompts to research further with their own AI assistant. Everything runs in the browser and nothing is sent anywhere.

**Live:** https://rico1975uk.github.io/futures/ · **Sample reports:** https://rico1975uk.github.io/futures/samples/

## Run it locally

```bash
npm start          # http://localhost:8787 (no install needed: zero dependencies)
npm test           # engine, privacy, docs and server tests
npm run samples    # regenerates samples/*.html for six contrasting test children
```

The site is plain static files (`index.html`, `css/`, `js/`) hosted on GitHub Pages from `main`. Pushing to `main` republishes in about a minute, and browsers may keep old files for up to 10 minutes.

## How it works

| Layer | File | Notes |
|---|---|---|
| School data | `js/data/schools.js` | 47 state secondaries in and around Bristol: GCSE 2025-26, Ofsted (including new report-card areas), size, absence, faith, sixth form, council, location. Independent schools are out of scope. **The current source needs replacing; see [docs/DATA.md](docs/DATA.md).** |
| Questions | `js/questions.js` | "Describe your child": 19 everyday statements across 7 dimensions (social energy, worry, self-organisation, curiosity, environmental sensitivity, need for structure, need for autonomy), plus motivation, transition and wellbeing factors, parent-reported attainment, and the visit observation checklist. Evidence notes and references sit alongside. |
| Engine | `js/engine.js` | Pure functions: profile → needs → per-factor weights → match band. Every rating comes with reasons, concerns, a "what drove this rating" breakdown and tailored visit questions. All scoring constants are in one `METHOD` object. |
| Report | `js/report.js` | Printable HTML report. |
| Own-AI prompts | `js/prompts.js` | Copy-and-paste prompts for Claude, Gemini or ChatGPT: talk it through (including a premortem), could we get a place?, research each school, head-to-head, plan our visits. Includes privacy switches. |
| App | `js/app.js`, `index.html` | The form. Answers are saved only in the browser's local storage. |

Key behaviours:
- **Visit impressions are not in the score.** The report sets them beside the evidence and shows where they disagree.
- **Results and absence are judged against similar intakes.**
- **With no child details, ratings are a data comparison, not a "match".**

**Full scoring method:** [docs/METHODOLOGY.md](docs/METHODOLOGY.md) (kept in sync with the code by `tests/docs.test.mjs`). **Why it's designed this way:** [docs/DECISIONS.md](docs/DECISIONS.md).

## Evidence base (summary)

- Temperament/personality in childhood: Shiner & Caspi (2003); Rothbart (2007); Poropat (2014).
- Stability of child personality: Roberts & DelVecchio (2000); Soto et al. (2011); Soto & Tackett (2015).
- Stage-environment fit: Eccles et al. (1993).
- Self-determination theory: Ryan & Deci (2000).
- Self-control: Moffitt et al. (2011).
- Environmental sensitivity: Pluess (2015).
- Transition to secondary: Evangelou et al. (2008, DCSF RR019); Rice et al. (2011, 2021).
- Limits of league tables for choice: Leckie & Goldstein (2009); Burgess et al. (2015).
- Structured judgement, halo effect, noise: Kahneman (2011); Kahneman, Sibony & Sunstein (2021); Dawes (1979).

## Known limitations

- **The weights are judgement, not calibrated.** The research decides *what* is weighed and in which direction; the precise multipliers and thresholds were set by hand and have not been tested against real outcomes. See [docs/METHODOLOGY.md](docs/METHODOLOGY.md).
- **The child profile is the parent's view alone.** The statements are adapted from research dimensions, not a validated scale, and nothing in the tool checks the profile against another rater such as a teacher.
- "Year group size" uses the Year 11 GCSE cohort as a proxy; new schools use capacity.
- "Results given intake" is a crude linear adjustment for % free school meals, not Progress 8.
- Pastoral and behaviour signals depend on Ofsted. About 60% of schools were last inspected under the old framework and have only an overall grade.
- Distances are straight-line from the postcode-district centre. There is no catchment or admissions-likelihood modelling; the "could we get a place?" prompt covers this instead.
- Nothing is known about clubs, specialisms or curriculum, so the report turns these into visit and research questions.

## Maintenance

- **School data:** refresh once a year after GCSE results, or after a big Ofsted round. The source must first be moved to the official DfE and Ofsted downloads. The process and the build's safety checks are in [docs/DATA.md](docs/DATA.md).
- **Changing the scoring:** edit `METHOD` in `js/engine.js` *and* the machine-checked block in `docs/METHODOLOGY.md`, then run `npm test` and `npm run samples`, and read the sample reports.
- **Samples** (`samples/`) are generated; don't edit them by hand.

## Licence

Code, text, questions and method: [CC BY-NC 4.0](LICENSE). Free to share and adapt for non-commercial use, with credit. School data: Open Government Licence v3.0 (see [docs/DATA.md](docs/DATA.md)).
