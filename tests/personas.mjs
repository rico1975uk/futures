// Contrasting test children. Used by the test suite and by scripts/sample-reports.mjs.
import { OUTCODES } from '../js/data/schools.js';

// Same north-Bristol shortlist for everyone, so differences come from the child and family, not the schools.
export const SHORTLIST = ['135575', '138855', '137440', '147072', '141705', '136822'];

const A = (soc, wor, org, cur, sen, str, aut) => {
  // Each argument is the "true" level 1-5; reverse items are mirrored so answers look like a real parent's.
  const r = v => 6 - v;
  return { soc1: soc, soc2: r(soc), soc3: soc, wor1: wor, wor2: wor, wor3: r(wor), org1: org, org2: r(org), org3: org,
    cur1: cur, cur2: cur, cur3: cur, sen1: sen, sen2: sen, sen3: sen, str1: str, str2: str, aut1: aut, aut2: aut };
};

export const PERSONAS = {
  anxiousSensitive: {
    label: 'Anxious, sensitive, still getting organised; recently bullied',
    input: {
      child: { name: 'Robin', sex: 'boy', answers: A(1, 5, 2, 3, 5, 5, 2), motivators: ['people'], interests: ['arts', 'reading'],
        attainment: { english: 'expected', maths: 'below', science: 'expected' },
        transition: { newSituations: 'slow', feelings: 'very', friendships: 'few', bullying: 'yes', happiness: '3', worries: ['friends', 'bullying', 'lost'] } },
      family: { outcode: 'BS7', priorities: { results: 2, behaviour: 4, pastoral: 5, journey: 4, sixth: 1 }, sizePref: 'small', discipline: 'balanced' },
    },
  },
  brightIndependent: {
    label: 'Confident, curious high-attainer who wants a say',
    input: {
      child: { name: 'Alex', sex: 'girl', answers: A(5, 1, 5, 5, 1, 2, 5), motivators: ['mastery', 'choice'], interests: ['maths', 'science', 'music'],
        attainment: { english: 'well_above', maths: 'well_above', science: 'above' },
        transition: { newSituations: 'dive', feelings: 'excited', friendships: 'settled', bullying: 'no', happiness: '5', worries: [] } },
      family: { outcode: 'BS7', priorities: { results: 5, behaviour: 2, pastoral: 2, journey: 2, sixth: 4 }, sizePref: 'large', discipline: 'flexible' },
    },
  },
  disorganisedSociable: {
    label: 'Sociable, easily distracted, needs structure; below expected',
    input: {
      child: { name: 'Jordan', sex: 'boy', answers: A(5, 2, 1, 2, 2, 4, 3), motivators: ['people', 'goal'], interests: ['sport', 'active'],
        attainment: { english: 'below', maths: 'below', science: 'expected' },
        transition: { newSituations: 'dive', feelings: 'mixed', friendships: 'changeable', bullying: 'no', happiness: '4', worries: ['homework', 'teachers'] } },
      family: { outcode: 'BS7', priorities: { results: 3, behaviour: 5, pastoral: 3, journey: 3, sixth: 1 }, sizePref: '', discipline: 'structured' },
    },
  },
  quietCreative: {
    label: 'Quiet, creative, sensitive to noise; happy and on track',
    input: {
      child: { name: 'Sky', sex: '', answers: A(2, 3, 4, 4, 5, 3, 4), motivators: ['mastery'], interests: ['arts', 'drama', 'reading'],
        attainment: { english: 'above', maths: 'expected', science: 'expected' },
        transition: { newSituations: 'warm', feelings: 'mixed', friendships: 'few', bullying: 'no', happiness: '4', worries: ['older', 'lost'] } },
      family: { outcode: 'BS7', priorities: { results: 3, behaviour: 3, pastoral: 4, journey: 5, sixth: 2 }, sizePref: 'small', discipline: 'balanced' },
    },
  },
  easygoingAverage: {
    label: 'Middle-of-the-road on everything; family wants a short journey',
    input: {
      child: { name: '', sex: 'girl', answers: A(3, 3, 3, 3, 3, 3, 3), motivators: [], interests: ['sport'],
        attainment: { english: 'expected', maths: 'expected', science: 'expected' },
        transition: { newSituations: 'warm', feelings: 'mixed', friendships: 'settled', bullying: 'no', happiness: '4', worries: [] } },
      family: { outcode: 'BS7', priorities: { results: 1, behaviour: 2, pastoral: 2, journey: 5, sixth: 0 } },
    },
  },
  southBristolFaith: {
    label: 'Different area (BS13), family prefers a faith school',
    input: {
      child: { name: 'Sam', sex: 'girl', answers: A(4, 2, 4, 3, 2, 4, 2), motivators: ['praise'], interests: ['music', 'languages'],
        attainment: { english: 'above', maths: 'expected', science: 'above' },
        transition: { newSituations: 'warm', feelings: 'excited', friendships: 'settled', bullying: 'no', happiness: '5', worries: ['journey'] } },
      family: { outcode: 'BS13', priorities: { results: 4, behaviour: 3, pastoral: 3, journey: 3, sixth: 3 }, faith: 'want' },
      shortlist: ['109327', '137627', '109331', '138204', '141652'],
    },
  },
};

export function inputFor(key, overrides = {}) {
  const p = PERSONAS[key].input;
  return { shortlist: SHORTLIST, outcodes: OUTCODES, visits: {}, ...structuredClone(p), ...overrides };
}
