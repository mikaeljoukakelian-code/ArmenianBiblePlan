// Phase 4: Builds a static, self-contained fallback HTML page listing both reading plans day-by-day
// with direct bible.com deep links - usable immediately (phone or laptop) without any bible.com
// Partner Portal approval. Data is embedded inline so the page works even opened directly as a local
// file (no server/fetch/CORS required).

const fs = require("fs");
const path = require("path");
const { BOOK_CODES, normalizeBookName } = require("./bible_data");

const NT_PLAN = require(path.join(__dirname, "..", "data", "nt_plus_psalms_plan.json"));
const ARM_PLAN = require(path.join(__dirname, "..", "data", "armenian_2026_plan.json"));

const ENGLISH_VERSION_ID = 59; // ESV
const ARMENIAN_VERSION_ID = 2860; // ՆԷԱ Նոր Էջմիածին Աստվածաշունչ (New Ejmiatsin Bible)

// Parses a reference string like "Isaiah 51:15-52:3" into { book, chapter } using the START chapter,
// for building a bible.com chapter-level deep link.
function parseReference(ref) {
  const m = /^([1-3]?\s?[A-Za-z][A-Za-z. ]*?)\s+(\d+)/.exec(ref);
  if (!m) return null;
  const book = normalizeBookName(m[1].trim());
  const chapter = parseInt(m[2], 10);
  const code = BOOK_CODES[book];
  if (!code) return null;
  return { book, chapter, code };
}

function bibleLink(versionId, code, chapter) {
  return `https://www.bible.com/bible/${versionId}/${code}.${chapter}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderNtDays() {
  return NT_PLAN.days.map((d) => {
    const link = bibleLink(ENGLISH_VERSION_ID, d.bookCode, d.chapter);
    return `<li><span class="day">Day ${d.day}</span> <span class="tag">${escapeHtml(d.type)}</span> ` +
      `<a href="${link}" target="_blank" rel="noopener">${escapeHtml(d.reference)}</a></li>`;
  }).join("\n");
}

function renderArmenianDays() {
  return ARM_PLAN.days.map((d) => {
    const links = d.references.map((ref) => {
      const parsed = parseReference(ref);
      if (!parsed) return `<span class="unresolved">${escapeHtml(ref)}</span>`;
      const link = bibleLink(ARMENIAN_VERSION_ID, parsed.code, parsed.chapter);
      return `<a href="${link}" target="_blank" rel="noopener">${escapeHtml(ref)}</a>`;
    }).join(", ");
    const title = d.title ? `<span class="tag">${escapeHtml(d.title)}</span> ` : "";
    return `<li><span class="day">Day ${d.day}</span> <span class="date">(${d.calendarDate})</span> ${title}${links}</li>`;
  }).join("\n");
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bible Study Plans - Armenian Community</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 900px; margin: 0 auto; padding: 1.5rem; line-height: 1.5; color: #222; background: #fdfaf5; }
  h1 { font-size: 1.6rem; }
  h2 { border-bottom: 2px solid #7a1f2b; padding-bottom: 0.3rem; margin-top: 2.5rem; }
  .desc { color: #444; margin-bottom: 1rem; }
  .attribution { font-size: 0.85rem; color: #666; margin-bottom: 1.5rem; }
  nav.tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; position: sticky; top: 0; background: #fdfaf5; padding: 0.5rem 0; z-index: 10; }
  nav.tabs button { font-size: 1rem; padding: 0.5rem 1rem; border: 1px solid #7a1f2b; background: #fff; color: #7a1f2b; border-radius: 6px; cursor: pointer; }
  nav.tabs button.active { background: #7a1f2b; color: #fff; }
  input[type=search] { width: 100%; padding: 0.5rem; margin-bottom: 1rem; font-size: 1rem; box-sizing: border-box; }
  ul.plan { list-style: none; padding: 0; margin: 0; }
  ul.plan li { padding: 0.4rem 0.2rem; border-bottom: 1px solid #e5ddd0; }
  ul.plan li:hover { background: #f5eee0; }
  .day { font-weight: bold; color: #7a1f2b; display: inline-block; min-width: 4.5rem; }
  .date { color: #888; font-size: 0.85rem; }
  .tag { font-style: italic; color: #555; }
  a { color: #1a5276; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .unresolved { color: #999; font-style: italic; }
  section.plan-section { display: none; }
  section.plan-section.active { display: block; }
</style>
</head>
<body>
<h1>📖 Daily Bible Reading Plans</h1>
<p class="desc">Two self-guided reading plans for the Armenian Christian community. Tap any reference to
open it directly in the bible.com Bible App (works on phone or laptop). No sign-up or app plan
subscription required - each day is just a direct link to the passage.</p>

<nav class="tabs">
  <button class="tab-btn active" data-target="nt">New Testament in a Year</button>
  <button class="tab-btn" data-target="arm">Armenian Apostolic Lectionary (2026)</button>
</nav>

<section id="nt" class="plan-section active">
  <h2>${escapeHtml(NT_PLAN.meta.nameEn)}</h2>
  <p class="desc">${escapeHtml(NT_PLAN.meta.descriptionEn)}</p>
  <p class="attribution">Recommended English version: ${escapeHtml(NT_PLAN.meta.recommendedVersions.english)}. Links use ESV (bible.com version ${ENGLISH_VERSION_ID}) by default - open the Bible App and switch versions if you prefer another.</p>
  <input type="search" class="filter" placeholder="Search by day or book (e.g. 'Day 45' or 'Romans')...">
  <ul class="plan">
${renderNtDays()}
  </ul>
</section>

<section id="arm" class="plan-section">
  <h2>${escapeHtml(ARM_PLAN.meta.nameEn)}</h2>
  <p class="desc" lang="hy">${escapeHtml(ARM_PLAN.meta.nameHy)}</p>
  <p class="desc">${escapeHtml(ARM_PLAN.meta.descriptionEn)}</p>
  <p class="attribution">${escapeHtml(ARM_PLAN.meta.attributionEn)}</p>
  <p class="attribution">Links use the ՆԷԱ (New Ejmiatsin) Armenian Bible (bible.com version ${ARMENIAN_VERSION_ID}), which includes all Old Testament and deuterocanonical books referenced by the lectionary.</p>
  <input type="search" class="filter" placeholder="Search by day, date, feast, or book...">
  <ul class="plan">
${renderArmenianDays()}
  </ul>
</section>

<script>
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.plan-section').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });
  document.querySelectorAll('input.filter').forEach((input) => {
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      const list = input.nextElementSibling;
      list.querySelectorAll('li').forEach((li) => {
        li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  });
</script>
</body>
</html>
`;

const outPath = path.join(__dirname, "..", "site", "index.html");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${outPath}`);

// Quick sanity report: how many Armenian references failed to resolve to a bible.com link.
let unresolved = 0;
let total = 0;
for (const d of ARM_PLAN.days) {
  for (const ref of d.references) {
    total++;
    if (!parseReference(ref)) {
      unresolved++;
      console.warn(`  Could not build a link for: "${ref}" (Day ${d.day}, ${d.calendarDate})`);
    }
  }
}
console.log(`Armenian references: ${total}, unresolved (no link): ${unresolved}`);
