# School data

## What's in it

[`js/data/schools.js`](../js/data/schools.js) holds 47 state secondary schools in and around Bristol, including some run by South Gloucestershire, North Somerset and Bath & North East Somerset councils. For each school it has:
- GCSE results (Attainment 8; English & maths grades 4+, 5+, 7+; cohort size)
- Ofsted outcome, date and area judgements (report-card areas where available)
- roll, capacity, age range, gender, sixth form and faith character
- persistent and overall absence
- % free school meals, % EAL and % SEND
- pupil:teacher ratio
- trust, address, location, website and council.

Postcode-district centroids (from postcodes.io, built from ONS data) let distances be estimated from an outward code alone, with no lookup at runtime.

## Licence and attribution

The underlying figures are public sector information from the **Department for Education** (performance tables, Get Information About Schools, school census, absence statistics) and **Ofsted**, licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Contains public sector information licensed under the Open Government Licence v3.0. Postcode data: contains OS data © Crown copyright and database right; contains Royal Mail data © Royal Mail copyright and database right; source: Office for National Statistics, via postcodes.io.

## ⚠️ Current source needs replacing

The October 2026 snapshot was compiled by scraping [FindGreatSchools](https://findgreatschools.co.uk/gcse-results/bristol): one list page plus 47 school pages, with a polite delay. **Their terms of use prohibit scraping or systematically downloading data and limit use to personal, non-commercial purposes.** The figures themselves are OGL government data, but how they were collected breaches FindGreatSchools' terms.

**Do not re-run the scraper.** `scripts/build-data.mjs` now refuses to download from FindGreatSchools and will only rebuild from its local cache.

**To fix:** rebuild the same fields directly from the official, openly licensed downloads:
- **GCSE results:** DfE [Compare school and college performance](https://www.compare-school-performance.service.gov.uk/download-data), KS4 data for the relevant local authorities
- **School details** (age range, gender, faith, capacity, sixth form, trust, location, website): DfE [Get Information About Schools](https://get-information-schools.service.gov.uk/Downloads)
- **Ofsted outcomes and report-card areas:** Ofsted's monthly management information on state-funded school inspections
- **Absence, FSM, pupil:teacher ratio:** DfE [Explore education statistics](https://explore-education-statistics.service.gov.uk/) school-level files.

## Refreshing (once the source is fixed)

1. Once a year, after GCSE results are published in late autumn, or after a major Ofsted round:
   ```bash
   npm run build-data
   ```
2. The build **fails without writing anything** if the data looks wrong: fewer than 40 schools, or any key field missing for more than 15% of schools. That catches a source changing its format. Don't loosen the check to make it pass; find out what changed.
3. Run `npm test`, then `npm run samples`, and check that the sample reports look sensible.
4. Update the snapshot date in [README.md](../README.md) if it's mentioned, then push to `main`. GitHub Pages republishes in about a minute, and browsers may keep the old files for up to 10 minutes.
