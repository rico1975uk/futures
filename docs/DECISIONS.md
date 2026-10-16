# Design decisions

The choices that shape Futures, and why. Read this before changing them; most were made deliberately against a plausible alternative.

## 1. No built-in AI write-up, so prompts for the parent's own AI instead

*October 2026.* An earlier version called Claude through a small server to write a narrative report. It was removed because:
- the rules-based report was already good
- a server needs hosting, a paid API key and abuse limits
- "your answers never leave this device" is a simpler and stronger promise to parents.

Instead the report generates copy-and-paste prompts ([`js/prompts.js`](../js/prompts.js)). Parents' own AI assistants can search the web and fill the gaps our data can't: admissions distances, transition programmes, behaviour policies, clubs. The old version is preserved on the `ai-writeup` branch.

Privacy defaults in the prompts: postcode district on, visit notes on, wellbeing details off, child's name off. Research prompts only ever carry needs, interests and attainment level.

## 2. Visit impressions are not part of the match score

*October 2026.* An earlier version weighted the parent's and child's visit ratings as heavily as all the published data. That turned the tool partly into an echo: it handed the parent's own view back with the tool's authority, which legitimises exactly the impressions it should help test. Single-visit impressions are also especially prone to the halo effect.

Now:
- the score is the tool's independent view (published data seen through the child's needs and the family's priorities)
- the visit form follows Kahneman's mediating-assessments approach: child's view first, then specific observations, overall verdict last
- the report shows **where impressions and evidence disagree**, framed as questions that side with neither.

See [METHODOLOGY.md §7](METHODOLOGY.md#7-visit-impressions-not-scored).

## 3. State schools only; no SEND module

Independent schools (fees, selective entry) and SEND provision (EHCPs, specialist placements) each need different data and expertise. Both were judged too big to do well here, so they're out of scope rather than done badly.

## 4. "Describe your child" uses everyday statements, read as a snapshot

The 7 traits map onto well-researched temperament and personality dimensions, written in everyday language and rated by a parent. Self-report is unreliable before early adolescence, which is why the parent rates. The statements are not a validated scale.

Personality is only moderately stable at 11, and early adolescence brings typical, mostly temporary, shifts. So the report treats the profile as a snapshot for the move to secondary, and turns traits into current *needs* rather than labels.

## 5. Results and absence are judged against similar intakes

Both are strongly linked to deprivation. Judging raw figures would reward affluent intakes rather than good schools, so both are adjusted for % free school meals. Raw figures are still shown.

## 6. No child details means no "match"

With no child information, ratings are labelled "… on the data" and the report says it is a data comparison, so the default slider settings are never presented as a personal match.

## 7. Static site, zero dependencies

Plain HTML, CSS and ES modules, hosted on GitHub Pages. Nothing to install, nothing to keep patched, nothing that can leak data.

## 8. Licence: CC BY-NC 4.0

Reuse and adaptation are welcome for non-commercial purposes with credit. Creative Commons doesn't recommend its licences for software (they don't address patents or source distribution). The choice was made knowingly, because the value here is mainly the content and method. School data stays under the Open Government Licence; see [DATA.md](DATA.md).
