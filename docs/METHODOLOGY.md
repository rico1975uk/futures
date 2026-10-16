# How Futures scores schools

This explains exactly how the report reaches its ratings, so the method can be checked and challenged. All the code is in [`js/engine.js`](../js/engine.js).

**Be clear about what this is.** It is structured, transparent judgement, not a statistical model. The rules and multipliers below were chosen so the logic is sensible and the test cases behave. They have **not** been calibrated against real outcomes, such as how children actually got on at the schools. The [research](../README.md#evidence-base-summary) shapes *which* things are weighed and in which direction, not the precise numbers. That's defensible because simple, roughly weighted rules tend to perform about as well as finely tuned ones (Dawes 1979), but treat the precise numbers as adjustable.

## Overview

```
Child's answers ──► profile (7 traits) ──► needs (0–1 strength each) ─┐
Family priorities (sliders, preferences) ─────────────────────────────┼─► weight per factor
School data ──► factor values (0–1, relative to other schools) ───────┴─► weighted average ─► match band
Visit impressions ──► compared with the evidence (NOT in the score) ──► "where impressions and evidence disagree"
```

## 1. Child profile

- 19 parent-rated statements on a 1–5 scale across 7 traits ([`js/questions.js`](../js/questions.js)). Some are reverse-scored.
- A trait is scored only if at least half its statements are answered. Score = (mean − 1) / 4 × 100.
- Bands: **high** ≥ 65, **low** ≤ 35, otherwise **mid**. Only high and low bands generate needs.
- The statements are adapted from research dimensions (temperament / Big Five). They are not a validated psychometric scale, and the report says so.

## 2. Transition outlook

Risk factors each count 1, except: recently bullied **2**, very worried about secondary **2**, finding friendships hard **1.5**. Total ≥ 4 means **extra support**, ≥ 2 means **some**, otherwise **smooth**. The weighting reflects the UK transition studies (Rice et al.; Evangelou et al.), where prior anxiety and bullying were the strongest predictors.

## 3. Needs

Each need's strength is the sum of its triggers, capped at 1. A need is only used if its strength is above 0.15.

| Need | Triggers (strength added) |
|---|---|
| Strong pastoral care and transition | worry high +0.45; transition "extra" +0.5 or "some" +0.25; recently bullied +0.3 |
| Calm, orderly environment | sensitivity high +0.55; worry high +0.2; self-organisation low +0.15 |
| Clear routines and organisation | self-organisation low +0.55; need for structure high +0.45 |
| Room for voice and choice | autonomy high +0.6; structure low +0.25; motivated by choice +0.2 |
| Genuine stretch | curiosity high +0.45; attainment above +0.45, or well above in one subject +0.25 |
| Catch-up support | attainment below +0.6, or below in one subject +0.35; self-organisation low (and not above) +0.1 |
| Breadth (people, clubs) | sociability high: 0.45 |
| Belonging (be known) | sociability low, or sensitivity high without high sociability: 0.45 |

## 4. School factors (each 0–1)

Every value is a **percentile among the 45 Bristol-area schools with Year 7 entry** (or those of them with the relevant data), so it describes how a school compares, not an absolute standard.

| Factor | How it's measured |
|---|---|
| Headline results | Average of the Attainment 8 and English & maths grade 5+ percentiles |
| Top grades | Percentile of English & maths grade 7+ |
| Results allowing for intake | Percentile of the Attainment 8 residual after a linear adjustment for % free school meals (FSM) |
| Behaviour & attendance | 55% Ofsted behaviour judgement + 45% intake-adjusted persistent absence. With no behaviour judgement: 35% overall Ofsted + 65% absence |
| Pastoral care | 80% Ofsted personal development / wellbeing and inclusion + 20% pupil:teacher ratio. With no area judgements: 75% overall Ofsted + 25% ratio, flagged "limited evidence" |
| Catch-up support | Ofsted inclusion and achievement judgements; otherwise "results allowing for intake" |
| Year group size | Percentile of Year 11 GCSE cohort (a proxy). New schools: capacity ÷ 5 or 6 |
| Distance | Full marks up to 2 km, falling linearly to 0 at 12 km (straight line from postcode-district centre) |
| Sixth form | 1 if it has one, 0 if not |
| Overall Ofsted | Grade mapped to a score (below) |

Ofsted grades map to: Exceptional / Outstanding 1, Strong 0.8, Good 0.7, Expected 0.55, Requires improvement 0.3, Needs attention 0.25, Inadequate / Urgent improvement 0.05. An Inadequate or Urgent improvement outcome caps behaviour and pastoral at 0.25.

**Intake adjustment.** Results and persistent absence are both strongly linked to deprivation. Each is regressed on % FSM across the schools, and the residual (better or worse than schools with a similar intake) is used. This is crude, not Progress 8.

## 5. Weights

`weight = base + Σ(slider × k) + Σ(need strength × k) + extras`. Sliders run 0–5 and start at results 3, behaviour 3, pastoral 3, journey 3, sixth form 1.

| Factor | From sliders | From child's needs | Base / extras |
|---|---|---|---|
| Headline results | results × 0.8 | | |
| Top grades | results × 0.4 | stretch × 4 | |
| Results allowing for intake | results × 0.4 | support × 2 | |
| Behaviour & attendance | behaviour × 1 | calm × 4, structure × 1.5 | +1.5 if "tightly enforced rules" |
| Pastoral care | pastoral × 1 | pastoral × 4, belonging × 1 | |
| Catch-up support | | support × 4 | |
| Distance | journey × 1 | | only if a postcode is given |
| Sixth form | sixth × 1 | | |
| Overall Ofsted | | pastoral × 1, calm × 1 | base 1.5 |
| Year group size | | net of: smaller (prefer smaller 3, belonging × 2, calm × 1) minus larger (prefer larger 3, breadth × 2) | one row, direction shown |
| Faith / single-sex preference | | | 3 each, only if set |
| Single-sex eligibility | | | 50: effectively a veto |
| Friends going | | | 2, only if the move looks bumpy or belonging is a need |

## 6. Score and band

- **Score** = weighted average of the factor values.
- **Missing data:** if a school lacks data for factors that should count, the score is pulled towards 0.5. Kept distance from 0.5 = 0.4 + 0.6 × (weight with data ÷ weight intended).
- **Bands:** Strong ≥ 0.75, Good ≥ 0.63, Mixed ≥ 0.5, otherwise Weaker.
- **No child details:** bands are relabelled "… on the data" and the report says it is a data comparison, not a personal match.
- **"What drove this rating"** shows each factor's share of the total weight and how the school compares on it (Strong ≥ 0.7, Above average ≥ 0.55, Average ≥ 0.45, Below average ≥ 0.3, otherwise Weak).

## 7. Visit impressions (not scored)

Visit impressions are deliberately excluded from the score. Counting them would hand the parent's own view back with the tool's authority. Instead:

- The form asks for the **child's view first**, then 7 **specific observations** (yes / partly / no), then the **overall verdict last**. This follows Kahneman's "mediating assessments": specific judgements before a holistic one, made independently.
- The report flags a **disagreement** when:
  - the observations average ≥ 0.75 but the evidence is ≤ 0.4 (or ≤ 0.25 against ≥ 0.65), on a factor carrying ≥ 8% of the weight or matching a need. Pastoral is skipped where the evidence is weak.
  - the overall verdict is ≥ 4 but the band is Mixed or Weaker, or ≤ 2 but the band is Strong or Good.
  - parent and child differ by 2 or more.
- Disagreements are written as questions to resolve. Neither side automatically wins.
- **Friends going** is a fact, not an impression, so it is scored (see weights).

## 8. Suggestions

Schools not shortlisted are suggested if they:
- take children at Year 7
- are within 8 km
- are eligible for the child (single-sex schools)
- fit the family's faith and single-sex preferences
- have at least 60% data coverage
- aren't rated Inadequate or Urgent improvement by Ofsted
- score at least as well as the lowest-scoring shortlisted school.

Up to 3 are shown.

## Machine-checked constants

`tests/docs.test.mjs` fails if this block and `METHOD` in `js/engine.js` disagree. Update both together.

```json method
{
  "defaultPriorities": { "results": 3, "behaviour": 3, "pastoral": 3, "journey": 3, "sixth": 1 },
  "weights": {
    "results": { "sliders": { "results": 0.8 } },
    "stretch": { "sliders": { "results": 0.4 }, "needs": { "stretch": 4 } },
    "valueAdded": { "sliders": { "results": 0.4 }, "needs": { "support": 2 } },
    "calm": { "sliders": { "behaviour": 1 }, "needs": { "calm": 4, "structure": 1.5 }, "ifStructuredDiscipline": 1.5 },
    "pastoral": { "sliders": { "pastoral": 1 }, "needs": { "pastoral": 4, "belonging": 1 } },
    "support": { "needs": { "support": 4 } },
    "proximity": { "sliders": { "journey": 1 } },
    "sixth": { "sliders": { "sixth": 1 } },
    "overall": { "base": 1.5, "needs": { "pastoral": 1, "calm": 1 } }
  },
  "size": { "smaller": { "ifPreferred": 3, "needs": { "belonging": 2, "calm": 1 } }, "larger": { "ifPreferred": 3, "needs": { "breadth": 2 } } },
  "fixed": { "faith": 3, "singleSex": 3, "ineligible": 50, "friends": 2 },
  "bands": { "strong": 0.75, "good": 0.63, "mixed": 0.5 },
  "coverageFloor": 0.4
}
```
