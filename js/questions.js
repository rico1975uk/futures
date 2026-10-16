// "Describe your child" question bank.
// Items are everyday-language statements written to tap well-studied dimensions of child temperament
// and personality. They are ADAPTED, not a validated psychometric scale, and the tool says so to parents.

export const LIKERT = [
  { v: 1, label: 'Not like them' },
  { v: 2, label: 'A little' },
  { v: 3, label: 'Somewhat' },
  { v: 4, label: 'Quite like them' },
  { v: 5, label: 'Very like them' },
];

// Each dimension: items (r = reverse-scored), plain-language poles, and the evidence it rests on.
export const DIMENSIONS = [
  {
    id: 'sociability', title: 'Social energy',
    low: 'Prefers a few close friends and quieter settings', high: 'Gets energy from lots of people and busy groups',
    basis: 'Extraversion / surgency',
    items: [
      { id: 'soc1', text: 'Gets a buzz from being around lots of people' },
      { id: 'soc2', text: 'Prefers one or two close friends to a big group', r: true },
      { id: 'soc3', text: 'Will happily start chatting to children they don’t know' },
    ],
  },
  {
    id: 'worry', title: 'Worry and emotional sensitivity',
    low: 'Usually takes knocks and changes in their stride', high: 'Feels worries strongly and can take time to recover',
    basis: 'Negative emotionality / neuroticism',
    items: [
      { id: 'wor1', text: 'Worries about things that might go wrong' },
      { id: 'wor2', text: 'Takes a while to bounce back after something upsetting' },
      { id: 'wor3', text: 'Stays fairly calm when plans change at short notice', r: true },
    ],
  },
  {
    id: 'selforg', title: 'Self-organisation and persistence',
    low: 'Needs reminders and scaffolding to stay organised', high: 'Organises themselves and sticks at things',
    basis: 'Conscientiousness / effortful control (self-control)',
    items: [
      { id: 'org1', text: 'Keeps going with tricky work without being nagged' },
      { id: 'org2', text: 'Loses track of belongings, homework or time', r: true },
      { id: 'org3', text: 'Can make themselves start a task they don’t enjoy' },
    ],
  },
  {
    id: 'curiosity', title: 'Curiosity and appetite for challenge',
    low: 'Happiest with familiar work at a comfortable pace', high: 'Hungry for ideas, depth and harder problems',
    basis: 'Openness to experience / intellect',
    items: [
      { id: 'cur1', text: 'Asks big “why?” and “how does that work?” questions' },
      { id: 'cur2', text: 'Gets absorbed in their own projects or interests' },
      { id: 'cur3', text: 'Switches off quickly when work is too easy' },
    ],
  },
  {
    id: 'sensitivity', title: 'Sensitivity to busy environments',
    low: 'Unbothered by noise, crowds and bustle', high: 'Finds noise and crowds draining; needs calm to recharge',
    basis: 'Environmental sensitivity',
    items: [
      { id: 'sen1', text: 'Finds noisy, crowded places tiring or overwhelming' },
      { id: 'sen2', text: 'Needs quiet time to recharge after a busy day' },
      { id: 'sen3', text: 'Picks up quickly on tension or a change of mood in a room' },
    ],
  },
  {
    id: 'structure', title: 'Need for structure',
    low: 'Copes well with loose plans and surprises', high: 'Does best with clear expectations and routines',
    basis: 'Need for structure / predictability',
    items: [
      { id: 'str1', text: 'Does best when they know exactly what’s expected of them' },
      { id: 'str2', text: 'Likes routines and is unsettled when they change' },
    ],
  },
  {
    id: 'autonomy', title: 'Need for independence and a say',
    low: 'Content to follow the plan they’re given', high: 'Wants choice, a voice, and reasons for rules',
    basis: 'Autonomy (self-determination theory)',
    items: [
      { id: 'aut1', text: 'Gets frustrated by rules that seem pointless' },
      { id: 'aut2', text: 'Works best when they can choose how to do things' },
    ],
  },
];

export const MOTIVATORS = [
  { id: 'mastery', label: 'Getting good at something hard', need: 'competence' },
  { id: 'people', label: 'Doing things with people they like', need: 'relatedness' },
  { id: 'choice', label: 'Having a say in what and how', need: 'autonomy' },
  { id: 'praise', label: 'Praise and recognition from adults', need: 'external' },
  { id: 'goal', label: 'A clear goal, score or reward', need: 'external' },
];

export const ATTAINMENT_LEVELS = [
  { v: 'well_above', label: 'Well above expected', score: 2 },
  { v: 'above', label: 'Above expected', score: 1 },
  { v: 'expected', label: 'Around expected', score: 0 },
  { v: 'below', label: 'Below expected', score: -1 },
  { v: 'well_below', label: 'Well below expected', score: -2 },
  { v: '', label: 'Not sure', score: null },
];
export const SUBJECTS = [['english', 'Reading and writing'], ['maths', 'Maths'], ['science', 'Science']];

export const INTERESTS = [
  ['maths', 'Maths and puzzles'], ['science', 'Science and how things work'], ['computing', 'Computing and tech'],
  ['reading', 'Reading and writing'], ['languages', 'Languages'], ['humanities', 'History, geography, current affairs'],
  ['arts', 'Art and design'], ['drama', 'Drama and performance'], ['music', 'Music'],
  ['sport', 'Team sport'], ['active', 'Being outdoors and active'], ['making', 'Making, building, cooking'],
];

// Wellbeing and transition — the factors with the strongest evidence for how Year 7 goes.
export const TRANSITION = {
  newSituations: {
    q: 'When they start something new (a new class, club or holiday camp), they usually…',
    options: [['dive', 'Dive straight in'], ['warm', 'Are cautious at first, then settle within a week or two'], ['slow', 'Take a long time to settle, or find it really hard']],
  },
  feelings: {
    q: 'How are they feeling about starting secondary school?',
    options: [['excited', 'Mostly excited'], ['mixed', 'A mix of excited and nervous'], ['worried', 'Mostly worried'], ['very', 'Very worried'], ['unknown', 'We haven’t really talked about it']],
  },
  worries: {
    q: 'Which of these have they mentioned worrying about? (tick any)',
    options: [['friends', 'Making new friends'], ['losing', 'Losing current friends'], ['lost', 'Getting lost / a big site'], ['work', 'Harder work'], ['homework', 'Homework'],
      ['older', 'Older students'], ['teachers', 'Strict teachers or getting into trouble'], ['bullying', 'Being picked on'], ['journey', 'The journey']],
  },
  friendships: {
    q: 'Their friendships at primary school are…',
    options: [['settled', 'A settled group of friends'], ['few', 'One or two close friends'], ['changeable', 'Changeable, with ups and downs'], ['hard', 'Something they find hard at the moment']],
  },
  bullying: {
    q: 'In the past year, have they been picked on or left out in a way that upset them?',
    options: [['no', 'No'], ['some', 'A little, now and then'], ['yes', 'Yes, significantly']],
  },
  happiness: {
    q: 'How happy are they at primary school right now?',
    options: [['5', 'Very happy'], ['4', 'Happy'], ['3', 'Up and down'], ['2', 'Often unhappy'], ['1', 'Very unhappy']],
  },
};

// Visit observations: specific, checkable things tied to the factors the engine weighs. Specific
// observations resist the halo effect better than "did you like it?" (Kahneman's mediating assessments).
// They are compared with the published evidence; they never feed the match score.
export const OBSERVATIONS = [
  { id: 'lessons', factor: 'calm', need: 'calm', text: 'Lessons we saw were calm and purposeful' },
  { id: 'corridors', factor: 'calm', need: 'calm', text: 'Corridors and lunch felt manageable at busy times' },
  { id: 'known', factor: 'pastoral', need: 'pastoral', text: 'Staff talked about individual pupils, not just policies' },
  { id: 'transition', factor: 'pastoral', need: 'pastoral', text: 'There was a clear plan for Year 7s’ first weeks (named contact, induction)' },
  { id: 'stretch', factor: 'stretch', need: 'stretch', text: 'Work we saw looked genuinely challenging for able pupils' },
  { id: 'support', factor: 'support', need: 'support', text: 'They were specific about how they help pupils who are behind' },
  { id: 'pupils', factor: 'pupils', need: null, text: 'Pupils we met seemed happy and spoke well of the school' },
];
export const OBS_SCALE = [['yes', 'Yes', 1], ['partly', 'Partly', 0.5], ['no', 'No', 0], ['', 'Didn’t see', null]];

// Short, honest summaries of the research the engine leans on. Shown in the form's “Why we ask these questions”
// panels and in the report's “The research behind it”.
export const EVIDENCE = {
  personality: {
    short: 'Children differ in stable, measurable ways (temperament) that shape how they experience school. Parent ratings of these traits predict school adjustment and attainment.',
    refs: ['Shiner & Caspi (2003), J. Child Psychology & Psychiatry 44(1)', 'Rothbart (2007), Current Directions in Psychological Science 16(4)', 'Poropat (2014), Learning & Individual Differences 34'],
  },
  change: {
    short: 'Personality becomes steadily more stable with age but is only moderately stable at 11. Early adolescence brings a typical, mostly temporary, dip in conscientiousness and rise in negative emotionality.',
    refs: ['Roberts & DelVecchio (2000), Psychological Bulletin 126(1)', 'Soto et al. (2011), J. Personality & Social Psychology 100(2)', 'Soto & Tackett (2015), Current Directions in Psychological Science 24(5)'],
  },
  fit: {
    short: 'Young adolescents do best when the school environment matches their developmental needs, especially for supportive relationships with teachers and a growing say in their own learning. A mismatch is linked to drops in motivation after the move to secondary school.',
    refs: ['Eccles et al. (1993), “Stage–environment fit”, American Psychologist 48(2)'],
  },
  sdt: {
    short: 'Motivation is strongest when three needs are met: feeling capable (competence), connected (relatedness) and having some choice (autonomy).',
    refs: ['Ryan & Deci (2000), American Psychologist 55(1)'],
  },
  selfcontrol: {
    short: 'Self-organisation and persistence are among the strongest everyday predictors of school success. Explicit routines and organisational support help most where they are still developing.',
    refs: ['Moffitt et al. (2011), PNAS 108(7)', 'Poropat (2009), Psychological Bulletin 135(2)'],
  },
  sensitivity: {
    short: 'Some children are more strongly affected by their environment, for better and for worse. They are more affected by calm, warm settings, and also by chaotic ones.',
    refs: ['Pluess (2015), Child Development Perspectives 9(3)'],
  },
  transition: {
    short: 'In UK studies of the move to secondary school, the strongest predictors of a difficult transition were prior anxiety, being bullied, and low school connectedness. Making new friends, settling into routines and feeling that school “gets” you predicted a good one.',
    refs: ['Evangelou et al. (2008), DCSF Research Report RR019', 'Rice, Frederickson & Seymour (2011), British J. Educational Psychology 81(2)', 'Rice et al. (2021), School Mental Health 13'],
  },
  judgement: {
    short: 'Impressions from a single visit are vulnerable to the halo effect: one striking feature colours everything. Judgements are more reliable when broken into specific, independent assessments with the overall verdict made last, and when people judge independently before comparing notes.',
    refs: ['Kahneman (2011), Thinking, Fast and Slow', 'Kahneman, Sibony & Sunstein (2021), Noise', 'Dawes (1979), American Psychologist 34(7)'],
  },
  schoolEffects: {
    short: 'Headline results mostly reflect a school’s intake. Differences in how much a school adds for an individual child are real but smaller and less certain than league tables suggest, so fit and practicalities matter too.',
    refs: ['Leckie & Goldstein (2009), J. Royal Statistical Society A 172(4)', 'Burgess et al. (2015), “What parents want”, Economic Journal 125'],
  },
};
