// Builds js/data/schools.js from findgreatschools.co.uk (DfE/Ofsted-derived) + postcodes.io.
// Usage: node scripts/build-data.mjs [--refresh]
// Pages are cached in .cache/ so re-runs don't hit the source site. --refresh re-downloads.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const CACHE = path.join(ROOT, '.cache');
const REFRESH = process.argv.includes('--refresh');
const LIST_URL = 'https://findgreatschools.co.uk/gcse-results/bristol';
const UA = { 'User-Agent': 'futures-school-tool/1.0 (parent decision aid; contact via GitHub)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cached(file, url) {
  const f = path.join(CACHE, file);
  if (!REFRESH && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  await sleep(1200); // be polite
  return text;
}

const strip = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => (s == null || s === '' || s === '–') ? null : Number(String(s).replace(/[%,]/g, ''));

const list = await cached('list.html', LIST_URL);
const stateTable = list.match(/<table[\s\S]*?<\/table>/g)[0]; // first table = state schools; second = independents (excluded)
const rows = stateTable.match(/<tr[\s\S]*?<\/tr>/g).slice(2); // skip header + England average

const OFSTED_SCALE = ['Exceptional', 'Strong', 'Expected', 'Needs attention', 'Urgent improvement', 'Outstanding', 'Good', 'Requires improvement', 'Inadequate', 'Met', 'Not met'];
const areaRe = new RegExp(`([A-Z][A-Za-z\\- &]+?) (${OFSTED_SCALE.join('|')})(?: standard)?(?= )`, 'g');

const schools = [];
for (const r of rows) {
  const cells = (r.match(/<td[\s\S]*?<\/td>/g) || []).map(strip);
  const urn = (r.match(/href="\/schools\/(\d+)"/) || [])[1];
  const html = await cached(`pages/${urn}.html`, `https://findgreatschools.co.uk/schools/${urn}`);
  const ld = JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || '{}');
  const t = strip(html);
  const g = re => { const m = t.match(re); return m ? m[1].trim() : null; };

  const age = g(/Capacity\s+([\d\-–]+) Age range/) || '';
  const [ageLo, ageHi] = age.split(/[-–]/).map(Number);
  const sixthField = g(/Sixth Form\s+(Has a sixth form|Does not have a sixth form)/);
  let sixth = sixthField ? sixthField.startsWith('Has') : ageHi >= 18;
  let sixthNote = null;
  if (sixthField && sixth !== (ageHi >= 18)) { sixthNote = 'Published records disagree on whether there is a sixth form; check with the school.'; sixth = null; }

  let ofstedAreas = null, ofstedDate = null, ofstedFramework = null;
  const oi = t.search(/Ofsted (Report Card|Inspection)\s*Inspected/);
  if (oi >= 0) {
    const seg = t.slice(oi, t.indexOf('Scale:', oi));
    ofstedDate = (seg.match(/Inspected (\d+ \w+ \d{4})/) || [])[1] || null;
    ofstedFramework = /renewed framework/.test(seg) ? 'report-card' : 'graded';
    ofstedAreas = {};
    const body = seg.replace(/^.*?View on Ofsted/, '') + ' ';
    let m; areaRe.lastIndex = 0;
    while ((m = areaRe.exec(body))) ofstedAreas[m[1].trim()] = m[2];
  }
  const religion = g(/Religious Character (.+?) (?:Nursery|Sixth Form)/);
  const site = (html.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*Visit website/) || [])[1] || null;

  schools.push({
    urn, name: ld.name || cells[1].split('Bristol ·')[0].trim(),
    type: (cells[1].match(/· ([^·]+?)(?: · |$)/) || [])[1] || null,
    street: ld.address?.streetAddress || null, postcode: ld.address?.postalCode || null,
    lat: ld.geo?.latitude ?? null, lng: ld.geo?.longitude ?? null,
    gcse: { a8: num(cells[2]), g7: num(cells[3]), g5: num(cells[4]), g4: num(cells[5]), cohort: num(cells[7]) },
    roll: ld.numberOfStudents ?? num(g(/Total Pupils (\d+)/)), capacity: num(g(/(\d+) Capacity/)),
    ageRange: age, entryYear: ageLo >= 13 ? 10 : 7, gender: g(/Age range\s+(\w+) Gender/),
    sixthForm: sixth, sixthNote,
    religion: religion && religion !== 'Does not apply' ? religion : null,
    ofsted: (g(/Ofsted:\s*([A-Za-z ]+?)\s+Updated/) || '').replace(/ Score$/, '') || null,
    ofstedDate, ofstedFramework, ofstedAreas,
    ptr: num(g(/Pupil:Teacher Ratio\s+([\d.]+):1/)),
    absence: num(g(/Overall Absence Rate\s+([\d.]+)%/)), persistentAbsence: num(g(/Persistent Absence\s+([\d.]+)%/)),
    fsm: num(g(/FSM Eligible\s+([\d.]+)%/)), eal: num(g(/EAL\s+([\d.]+)%/)), send: num(g(/SEND\s+([\d.]+)%/)),
    trust: g(/Trust\s+(.+?)\s+Often compared/),
    alevel: g(/([A-E][+-]?) Avg A-Level Grade/),
    website: site,
    profileUrl: `https://findgreatschools.co.uk/schools/${urn}`,
  });
  process.stderr.write('.');
}

// Local authority for each school (admissions are run by the home council).
const la = await (await fetch('https://api.postcodes.io/postcodes', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ postcodes: schools.map(s => s.postcode) }),
})).json();
la.result.forEach((x, i) => { schools[i].council = x.result?.admin_district?.replace('Bristol, City of', 'Bristol City') || null; schools[i].ward = x.result?.admin_ward || null; });
for (const s of schools) if (!s.council && /^BS(1|2|3|4|5|6|7|8|9|10|11|13|14)\s/.test(s.postcode)) s.council = 'Bristol City';

// Postcode-district centroids so distance works offline, from an outward code only.
let outcodes;
const ocFile = path.join(CACHE, 'outcodes.json');
if (!REFRESH && fs.existsSync(ocFile)) outcodes = JSON.parse(fs.readFileSync(ocFile, 'utf8'));
else {
  outcodes = {};
  const codes = [...Array(49)].map((_, i) => 'BS' + (i + 1)).concat(['BA1', 'BA2', 'BA3', 'GL12', 'GL13']);
  for (const c of codes) {
    const r = await fetch('https://api.postcodes.io/outcodes/' + c);
    if (r.ok) { const j = (await r.json()).result; if (j?.latitude) outcodes[c] = [+j.latitude.toFixed(4), +j.longitude.toFixed(4)]; }
  }
  fs.writeFileSync(ocFile, JSON.stringify(outcodes));
}
const oc = Object.fromEntries(Object.entries(outcodes).map(([k, v]) => [k, [v[0], v[1]]]));

const out = `// Generated by scripts/build-data.mjs on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.
// Source: findgreatschools.co.uk (compiled from DfE performance tables, Get Information About Schools and Ofsted), postcodes.io.
export const DATA_META = ${JSON.stringify({ retrieved: new Date().toISOString().slice(0, 10), gcseYear: '2025-26', source: LIST_URL })};
export const SCHOOLS = ${JSON.stringify(schools, null, 1)};
export const OUTCODES = ${JSON.stringify(oc)};
`;
fs.writeFileSync(path.join(ROOT, 'js/data/schools.js'), out);
console.log(`\nWrote ${schools.length} schools, ${Object.keys(oc).length} outcodes`);
