// Phase 4: Builds a static, self-contained fallback HTML page listing the Armenian Apostolic Church
// daily lectionary day-by-day with direct bible.com deep links - usable immediately (phone or laptop)
// without any bible.com Partner Portal approval. Data is embedded inline so the page works even opened
// directly as a local file (no server/fetch/CORS required).

const fs = require("fs");
const path = require("path");
const { NEW_TESTAMENT, BOOK_CODES, normalizeBookName } = require("./bible_data");

const ARM_PLAN = require(path.join(__dirname, "..", "data", "armenian_2026_plan.json"));

// Bible versions used for links:
//  - WARMB (Western Armenian Bible 1853): standard 39-book Old Testament, Armenian.
//  - WANTACOC (Western Armenian New Translation, Armenian Catholicosate of Cilicia): New Testament, Armenian.
//  - NKJV: English, for readers who want a parallel English reference.
//  - Neither WARMB, WANTACOC, nor NKJV include the deuterocanonical/Apocrypha books the lectionary
//    occasionally references (Tobit, Judith, Wisdom, Sirach, Baruch, 1-2 Maccabees). For those, the
//    Armenian link falls back to the ՆԷԱ (New Ejmiatsin) Bible, version 2860, which does include them,
//    and no English link is shown (verified live: none of WARMB/WANTACOC/NKJV render those chapters).
const ARMENIAN_OT_VERSION_ID = 1987; // WARMB
const ARMENIAN_NT_VERSION_ID = 2325; // WANTACOC
const ARMENIAN_DEUTERO_VERSION_ID = 2860; // ՆԷԱ Նոր Էջմիածին Աստվածաշունչ (fallback only)
const ENGLISH_VERSION_ID = 114; // NKJV

const NT_BOOKS = new Set(NEW_TESTAMENT.map(([name]) => name));
const DEUTERO_BOOKS = new Set([
  "Tobit", "Judith", "Wisdom", "Sirach", "Baruch", "1 Maccabees", "2 Maccabees",
]);

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

// Builds { text, armUrl, armDeutero, enUrl } for one reference string, or { text, unresolved: true }.
function buildRefLinks(ref) {
  const parsed = parseReference(ref);
  if (!parsed) return { text: ref, unresolved: true };
  const { book, code, chapter } = parsed;
  const isDeutero = DEUTERO_BOOKS.has(book);
  const isNt = NT_BOOKS.has(book);
  const armVersionId = isDeutero ? ARMENIAN_DEUTERO_VERSION_ID : (isNt ? ARMENIAN_NT_VERSION_ID : ARMENIAN_OT_VERSION_ID);
  const armUrl = bibleLink(armVersionId, code, chapter);
  const enUrl = isDeutero ? null : bibleLink(ENGLISH_VERSION_ID, code, chapter);
  return { text: ref, armUrl, armDeutero: isDeutero, enUrl };
}

// Precompute the full 365-day calendar (including "No Readings" days) with resolved links, used both
// for server-rendered HTML and as an embedded JSON blob the client script uses to find "today".
const CALENDAR_DAYS = ARM_PLAN.calendar.map((d) => {
  const dateStr = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  return {
    date: dateStr,
    dateLabel: `${d.monthName} ${d.day}`,
    title: d.title || "",
    noReadings: !!d.noReadings,
    refs: d.noReadings ? [] : d.references.map(buildRefLinks),
  };
});

function renderRefHtml(r) {
  if (r.unresolved) return `<span class="unresolved">${escapeHtml(r.text)}</span>`;
  const deuteroNote = r.armDeutero ? ' <sup title="Not in WARMB/WANTACOC or NKJV; shown from the ՆԷԱ (New Ejmiatsin) Armenian Bible instead.">&dagger;</sup>' : "";
  const en = r.enUrl ? ` <a class="en-link" href="${r.enUrl}" target="_blank" rel="noopener">EN</a>` : "";
  return `<a class="arm-link" href="${r.armUrl}" target="_blank" rel="noopener">${escapeHtml(r.text)}</a>${deuteroNote}${en}`;
}

function renderDayInner(d) {
  const title = d.title ? `<span class="tag">${escapeHtml(d.title)}</span> ` : "";
  const body = d.noReadings
    ? `<span class="no-readings">No readings appointed</span>`
    : d.refs.map(renderRefHtml).join(", ");
  return `<span class="date">${escapeHtml(d.dateLabel)}</span> ${title}${body}`;
}

function renderCalendarDays() {
  return CALENDAR_DAYS.map((d) => `<li data-date="${d.date}">${renderDayInner(d)}</li>`).join("\n");
}

const CALENDAR_JSON = JSON.stringify(CALENDAR_DAYS.map((d) => ({
  date: d.date,
  dateLabel: d.dateLabel,
  title: d.title,
  noReadings: d.noReadings,
  html: renderDayInner(d),
})));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Armenian Apostolic Daily Bible Readings - 2026</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 900px; margin: 0 auto; padding: 1.5rem; line-height: 1.5; color: #222; background: #fdfaf5; }
  h1 { font-size: 1.6rem; }
  h2 { border-bottom: 2px solid #7a1f2b; padding-bottom: 0.3rem; margin-top: 1.5rem; }
  .desc { color: #444; margin-bottom: 1rem; }
  .attribution { font-size: 0.85rem; color: #666; margin-bottom: 1.5rem; }
  #today-card { border: 2px solid #7a1f2b; background: #fff8ef; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1.5rem; }
  #today-card h2 { margin-top: 0; border: none; padding-bottom: 0; font-size: 1.1rem; color: #7a1f2b; text-transform: uppercase; letter-spacing: 0.03em; }
  #today-card .date { font-size: 1.4rem; }
  #today-card .body { font-size: 1.1rem; margin-top: 0.4rem; }
  input[type=search] { width: 100%; padding: 0.5rem; margin-bottom: 1rem; font-size: 1rem; box-sizing: border-box; }
  ul.plan { list-style: none; padding: 0; margin: 0; }
  ul.plan li { padding: 0.4rem 0.2rem; border-bottom: 1px solid #e5ddd0; }
  ul.plan li:hover { background: #f5eee0; }
  ul.plan li.is-today { background: #fef1d8; }
  .date { font-weight: bold; color: #7a1f2b; display: inline-block; min-width: 6rem; }
  .tag { font-style: italic; color: #555; }
  a { color: #1a5276; text-decoration: none; }
  a:hover { text-decoration: underline; }
  a.en-link { font-size: 0.8rem; color: #7a1f2b; border: 1px solid #7a1f2b; border-radius: 4px; padding: 0 0.3rem; text-decoration: none; }
  a.en-link:hover { background: #7a1f2b; color: #fff; }
  .unresolved, .no-readings { color: #999; font-style: italic; }
</style>
</head>
<body>
<h1>📖 Armenian Apostolic Daily Bible Readings (2026)</h1>
<p class="desc" lang="hy">${escapeHtml(ARM_PLAN.meta.nameHy)}</p>
<p class="desc">${escapeHtml(ARM_PLAN.meta.descriptionEn)}</p>
<p class="attribution">${escapeHtml(ARM_PLAN.meta.attributionEn)}</p>
<p class="attribution">Armenian links use the Western Armenian Bible (WARMB, bible.com version ${ARMENIAN_OT_VERSION_ID}) for Old Testament readings and the Western Armenian New Translation (WANTACOC, version ${ARMENIAN_NT_VERSION_ID}) for New Testament readings. English "EN" links use the NKJV (version ${ENGLISH_VERSION_ID}). A few readings cite deuterocanonical books (Tobit, Judith, Wisdom, Sirach, Baruch, 1-2 Maccabees, marked &dagger;) that aren't included in WARMB, WANTACOC, or the NKJV - those links fall back to the ՆԷԱ (New Ejmiatsin) Armenian Bible, and no English link is shown.</p>

<div id="today-card">
  <h2>Today's Reading</h2>
  <div id="today-body">Loading...</div>
</div>

<input type="search" class="filter" placeholder="Search by date, feast, or book (e.g. 'January 1' or 'Isaiah')...">
<ul class="plan" id="plan-list">
${renderCalendarDays()}
</ul>

<script>
  var CALENDAR = ${CALENDAR_JSON};

  function todayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return { full: d.getFullYear() + '-' + mm + '-' + dd, monthDay: mm + '-' + dd };
  }

  function renderToday() {
    var today = todayStr();
    var entry = CALENDAR.find(function (d) { return d.date === today.full; });
    if (!entry) {
      entry = CALENDAR.find(function (d) { return d.date.slice(5) === today.monthDay; });
    }
    var body = document.getElementById('today-body');
    if (!entry) {
      body.innerHTML = '<span class="unresolved">No reading found for today - browse the full list below.</span>';
      return;
    }
    body.innerHTML = entry.html;
    var li = document.querySelector('#plan-list li[data-date="' + entry.date + '"]');
    if (li) li.classList.add('is-today');
  }

  renderToday();

  var input = document.querySelector('input.filter');
  var list = document.getElementById('plan-list');
  input.addEventListener('input', function () {
    var q = input.value.toLowerCase();
    list.querySelectorAll('li').forEach(function (li) {
      li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
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
let deutero = 0;
for (const d of CALENDAR_DAYS) {
  for (const r of d.refs) {
    total++;
    if (r.unresolved) {
      unresolved++;
      console.warn(`  Could not build a link for: "${r.text}" (${d.date})`);
    } else if (r.armDeutero) {
      deutero++;
    }
  }
}
console.log(`Armenian references: ${total}, unresolved (no link): ${unresolved}, deuterocanonical fallback (version 2860): ${deutero}`);
