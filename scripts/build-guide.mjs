// Builds guide.html (the parents' guide on the website) from parent_readme.md, so there is one source.
// Usage: node scripts/build-guide.mjs        (tests/docs.test.mjs fails if guide.html is out of date)
// Supports the small subset of Markdown the guide uses: headings, paragraphs, lists, bold, links, rules.
import fs from 'node:fs';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s)<]+[^\s)<.,])/g, '$1<a href="$2">$2</a>');

export function markdownToHtml(md) {
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeLists = (depth = 0) => { while (list && list.length > depth) out.push(`</li></${list.pop()}>`); if (list && !list.length) list = null; };
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^(\s*)([-*]|\d+\.) (.*)$/);
    if (item) {
      flushPara();
      const depth = Math.floor(item[1].length / 2) + 1, tag = /\d/.test(item[2]) ? 'ol' : 'ul';
      list ||= [];
      if (list.length < depth) { list.push(tag); out.push(`<${tag}><li>`); }
      else { closeLists(depth); if (!list) { list = [tag]; out.push(`<${tag}><li>`); } else out.push('</li><li>'); }
      out.push(inline(item[3]));
      continue;
    }
    if (!line.trim()) { flushPara(); continue; }
    closeLists();
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) { flushPara(); const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); out.push(`<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^---+$/.test(line)) { flushPara(); out.push('<hr>'); continue; }
    para.push(line.trim());
  }
  flushPara(); closeLists();
  return out.join('\n');
}

export function buildGuide(md) {
  const body = markdownToHtml(md)
    // The guide's own link to the website becomes a link back to the tool.
    .replace(/<a href="https:\/\/rico1975uk\.github\.io\/futures\/">https:\/\/rico1975uk\.github\.io\/futures\/<\/a>/g, '<a href="./">https://rico1975uk.github.io/futures/</a>');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Futures | Guide for parents</title>
<meta name="description" content="A plain-English guide to using Futures to choose a Bristol secondary school.">
<link rel="stylesheet" href="css/styles.css">
</head>
<body>
<!-- Generated from parent_readme.md by scripts/build-guide.mjs. Do not edit by hand. -->
<header class="site">
  <div class="eyebrow">Futures · guide for parents</div>
  <p class="header-links"><a class="header-btn" href="./">← Back to the questionnaire</a></p>
</header>
<main class="guide">
${body}
<p class="guide-back"><a class="btn" href="./">Start the questionnaire</a></p>
</main>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  fs.writeFileSync('guide.html', buildGuide(fs.readFileSync('parent_readme.md', 'utf8')));
  console.log('Wrote guide.html');
}
