# Futures: choosing a Bristol secondary school

A free, private decision aid for parents in the Bristol area. A parent describes their child in everyday terms, sets their family's priorities, shortlists schools and records visit impressions. They get a personalised, evidence-based qualitative report, plus ready-made prompts to research further with their own AI assistant. Everything runs in the browser and nothing is sent anywhere.

## Run it locally

```bash
npm start        # http://localhost:8787 (no install needed: zero dependencies)
npm test         # engine, prompt-privacy and server tests
npm run samples  # writes samples/*.html for six contrasting test children
```

The site is plain static files (`index.html`, `css/`, `js/`), so it can be hosted anywhere, e.g. GitHub Pages.

## How it works

| Layer | File | Notes |
|---|---|---|
| School data | `js/data/schools.js` | 47 state secondaries from [FindGreatSchools' Bristol list](https://findgreatschools.co.uk/gcse-results/bristol) (DfE/Ofsted-derived): GCSE 2025-26, Ofsted (including new report-card areas), size, absence, faith, sixth form, council, location. Rebuild with `npm run build-data` (cached in `.cache/`; `--refresh` to re-download). Independent schools are excluded by design. |
| Questions | `js/questions.js` | "Describe your child": 19 everyday statements across 7 dimensions (social energy, worry, self-organisation, curiosity, environmental sensitivity, need for structure, need for autonomy), plus motivation (self-determination theory), transition/wellbeing factors and parent-reported attainment. Evidence notes and references sit alongside. |
| Engine | `js/engine.js` | Pure functions. Profile → needs (e.g. *strong pastoral care*, *stretch*, *calm environment*) → per-school factor weights → a match band with plain-English reasons, concerns and tailored visit questions. Missing data pulls a school toward "mixed" rather than flattering it. Visit ratings can carry as much weight as all the published data. |
| Report | `js/report.js` | Printable HTML report. |
| Own-AI prompts | `js/prompts.js` | After the report, parents get copy-and-paste prompts for Claude, Gemini or ChatGPT: *talk it through*, *could we get a place?* (admissions distances, which is our biggest data gap), one *research this school* prompt per shortlisted school tailored to the child's needs and interests, a head-to-head of the top two, and *plan our visits*. Privacy switches: postcode district (on), visit notes (on), wellbeing details (off), child's name (off). Research prompts only ever carry needs, interests and attainment level. |

## Evidence base (summary)

- Temperament/personality in childhood: Shiner & Caspi (2003); Rothbart (2007); Poropat (2014).
- Stage-environment fit: Eccles et al. (1993).
- Self-determination theory: Ryan & Deci (2000).
- Self-control: Moffitt et al. (2011).
- Environmental sensitivity: Pluess (2015).
- Transition to secondary: Evangelou et al. (2008, DCSF RR019); Rice et al. (2011, 2021).
- Limits of league tables for choice: Leckie & Goldstein (2009); Burgess et al. (2015).

The child questions are adapted, not a validated psychometric instrument, and the tool says so to parents.

## Known limitations

- "Year group size" uses the Year 11 GCSE cohort as a proxy; new schools use capacity.
- "Results given intake" is a crude adjustment for % free school meals, not Progress 8.
- Pastoral and behaviour signals depend on Ofsted. Schools last inspected under the old framework have only an overall grade.
- Distances are straight-line from the postcode-district centroid. No catchment or admissions-likelihood modelling.
- Nothing is known about clubs, specialisms or curriculum, so the report turns these into visit questions instead.
