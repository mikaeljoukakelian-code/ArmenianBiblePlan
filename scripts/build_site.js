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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Computes the weekday name for a Y/M/D via UTC construction (avoids local-timezone off-by-one).
function weekdayName(year, month, day) {
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

// Lightweight keyword-based classification for visually highlighting fasting days and major feast
// days in the lectionary title. Not a canonical liturgical authority - just a helpful visual cue.
const FAST_RE = /\bfast\b|median day of great lent|first day of lent/i;
const FEAST_RE = /\bfeast\b|nativity|christmas|epiphany|\beaster\b|pentecost|\bascension\b|transfiguration|assumption|exaltation of the holy cross|annunciation|\bpresentation\b|palm sunday|vartavar|discovery of the holy cross|apparition of the holy cross/i;
function classifyDay(title) {
  if (!title) return { fast: false, feast: false };
  const fast = FAST_RE.test(title);
  const feast = !fast && FEAST_RE.test(title);
  return { fast, feast };
}

// Parses a reference like "Isaiah 51:15-52:3" (crosses chapters), "Mark 10:35-45" (same chapter), or
// "Genesis 1:1" (single verse). bible.com only supports verse-precise links within a single chapter,
// so cross-chapter refs are resolved into two same-chapter links by the caller: the exact starting
// verse, and the ending chapter's 1-through-endVerse range.
function parseReference(ref) {
  const m = /^([1-3]?\s?[A-Za-z][A-Za-z. ]*?)\s+(\d+):(\d+)(?:[-\u2013\u2014](?:(\d+):)?(\d+))?/.exec(ref);
  if (!m) return null;
  const book = normalizeBookName(m[1].trim());
  const code = BOOK_CODES[book];
  if (!code) return null;
  const startChapter = parseInt(m[2], 10);
  const startVerse = parseInt(m[3], 10);
  const hasRange = m[5] !== undefined;
  const endChapter = m[4] ? parseInt(m[4], 10) : startChapter;
  const endVerse = hasRange ? parseInt(m[5], 10) : startVerse;
  return { book, code, startChapter, startVerse, endChapter, endVerse, crossesChapters: endChapter !== startChapter };
}

function bibleLink(versionId, code, chapter, verse, endVerse) {
  const versePart = verse ? (endVerse && endVerse !== verse ? `.${verse}-${endVerse}` : `.${verse}`) : "";
  return `https://www.bible.com/bible/${versionId}/${code}.${chapter}${versePart}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Builds link info for one reference string. Same-chapter refs get one precise verse-range link. Refs
// that cross chapters (e.g. "Luke 20:41-21:4") can't be a single bible.com link, so this produces a
// primary link to the exact starting verse plus a "cont." link to the ending chapter's 1-through-
// endVerse range.
function buildRefLinks(ref) {
  const parsed = parseReference(ref);
  if (!parsed) return { text: ref, unresolved: true };
  const { book, code, startChapter, startVerse, endChapter, endVerse, crossesChapters } = parsed;
  const isDeutero = DEUTERO_BOOKS.has(book);
  const isNt = NT_BOOKS.has(book);
  const armVersionId = isDeutero ? ARMENIAN_DEUTERO_VERSION_ID : (isNt ? ARMENIAN_NT_VERSION_ID : ARMENIAN_OT_VERSION_ID);

  const makeLink = (versionId, chapter, verse, verseEnd) => bibleLink(versionId, code, chapter, verse, verseEnd);

  const armUrl = crossesChapters
    ? makeLink(armVersionId, startChapter, startVerse)
    : makeLink(armVersionId, startChapter, startVerse, endVerse);
  const armContUrl = crossesChapters ? makeLink(armVersionId, endChapter, 1, endVerse) : null;

  const enUrl = isDeutero ? null : (crossesChapters
    ? makeLink(ENGLISH_VERSION_ID, startChapter, startVerse)
    : makeLink(ENGLISH_VERSION_ID, startChapter, startVerse, endVerse));
  const enContUrl = (isDeutero || !crossesChapters) ? null : makeLink(ENGLISH_VERSION_ID, endChapter, 1, endVerse);

  return { text: ref, armUrl, armContUrl, armDeutero: isDeutero, enUrl, enContUrl };
}

// Precompute the full 365-day calendar (including "No Readings" days) with resolved links, used both
// for server-rendered HTML and as an embedded JSON blob the client script uses to find "today".
const CALENDAR_DAYS = ARM_PLAN.calendar.map((d) => {
  const dateStr = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  const { fast, feast } = classifyDay(d.title);
  return {
    date: dateStr,
    dateLabel: `${weekdayName(d.year, d.month, d.day)}, ${d.monthName} ${d.day}`,
    title: d.title || "",
    noReadings: !!d.noReadings,
    fast,
    feast,
    refs: d.noReadings ? [] : d.references.map(buildRefLinks),
  };
});

function renderRefHtml(r) {
  if (r.unresolved) return `<span class="unresolved">${escapeHtml(r.text)}</span>`;
  const deuteroNote = r.armDeutero ? ' <sup title="Not in WARMB/WANTACOC or NKJV; shown from the ՆԷԱ (New Ejmiatsin) Armenian Bible instead.">&dagger;</sup>' : "";
  const cont = r.armContUrl ? ` <a class="cont-link" href="${r.armContUrl}" target="_blank" rel="noopener" title="Continue reading to the end of this passage">cont.&rarr;</a>` : "";
  const en = r.enUrl ? ` <a class="en-link" href="${r.enUrl}" target="_blank" rel="noopener">EN</a>` : "";
  return `<a class="arm-link" href="${r.armUrl}" target="_blank" rel="noopener">${escapeHtml(r.text)}</a>${deuteroNote}${cont}${en}`;
}

function renderDayInner(d, includeDate) {
  const badge = d.fast ? '<span class="badge fast-badge">Fast</span> ' : (d.feast ? '<span class="badge feast-badge">Feast</span> ' : "");
  const title = d.title ? `<span class="tag">${escapeHtml(d.title)}</span> ` : "";
  const date = includeDate === false ? "" : `<span class="date">${escapeHtml(d.dateLabel)}</span> `;
  const body = d.noReadings
    ? `<span class="no-readings">No readings appointed</span>`
    : d.refs.map(renderRefHtml).join(", ");
  return `${date}${badge}${title}${body}`;
}

function renderCalendarDays() {
  return CALENDAR_DAYS.map((d) => {
    const cls = [d.fast ? "fast" : "", d.feast ? "feast" : ""].filter(Boolean).join(" ");
    const classAttr = cls ? ` class="${cls}"` : "";
    return `<li data-date="${d.date}"${classAttr}>${renderDayInner(d)}</li>`;
  }).join("\n");
}

const CALENDAR_JSON = JSON.stringify(CALENDAR_DAYS.map((d) => ({
  date: d.date,
  dateLabel: d.dateLabel,
  title: d.title,
  noReadings: d.noReadings,
  fast: d.fast,
  feast: d.feast,
  html: renderDayInner(d, false),
})));

// Copy the cropped photo (left side of the Sevan peninsula panorama) into site/ so the static page
// can reference it with a plain relative path, used as a top banner image above the content.
const bgSrc = path.join(__dirname, "..", "data", "sevan_left.jpg");
const bgFileName = "sevan_left.jpg";
fs.mkdirSync(path.join(__dirname, "..", "site"), { recursive: true });
fs.copyFileSync(bgSrc, path.join(__dirname, "..", "site", bgFileName));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Armenian Apostolic Daily Bible Readings - 2026</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.5; color: #222; background: #fdfaf5; margin: 0; padding: 0 0 3rem; }
  .banner { width: 100%; max-height: 260px; object-fit: cover; object-position: center 35%; display: block; }
  .page { max-width: 900px; margin: 0 auto; padding: 1.5rem 1.75rem; }
  h1 { font-size: 1.6rem; margin-top: 0; }
  h2 { border-bottom: 2px solid #7a1f2b; padding-bottom: 0.3rem; margin-top: 1.5rem; }
  .summary { color: #444; margin-bottom: 0.4rem; }
  .more-info { font-size: 0.9rem; color: #555; margin-bottom: 1.5rem; }
  .more-info summary { cursor: pointer; color: #7a1f2b; font-weight: bold; margin-bottom: 0.5rem; }
  .more-info p { margin: 0.5rem 0; }
  #today-card { border: 2px solid #7a1f2b; background: #fff8ef; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1.5rem; }
  #today-card.feast { border-color: #c9971b; background: #fff8e2; }
  #today-card.fast { border-color: #5b7c99; background: #eef4f8; }
  .today-nav { display: flex; align-items: center; gap: 0.5rem; }
  #today-card h2 { margin: 0 0 0.4rem; border: none; padding-bottom: 0; text-align: center; font-size: 0.95rem; font-weight: normal; color: #6a5153; }
  .today-date { flex: 1; text-align: center; font-size: 1.1rem; font-weight: bold; color: #7a1f2b; }
  .nav-arrow { width: 44px; height: 44px; background: none; border: none; color: #7a1f2b; font-size: 1.3rem; line-height: 1; cursor: pointer; flex: none; padding: 0; opacity: 0.7; }
  .nav-arrow:hover:not(:disabled) { opacity: 1; }
  .nav-arrow:disabled { color: #c9b8bc; cursor: default; opacity: 0.4; }
  .back-link { display: inline-block; margin-top: 0.5rem; font-size: 0.85rem; }
  #today-card .date { font-size: 1.4rem; }
  #today-card .body { font-size: 1.1rem; margin-top: 0.4rem; }
  .filter-controls { display: grid; grid-template-columns: minmax(190px, 0.7fr) minmax(0, 1.3fr); gap: 0.75rem; margin-bottom: 1rem; }
  .filter-controls label { display: flex; flex-direction: column; gap: 0.3rem; color: #444; font-size: 0.9rem; font-weight: bold; }
  .filter-controls select, .filter-controls input { width: 100%; min-height: 44px; padding: 0.55rem 0.7rem; border: 2px solid #8c6a57; border-radius: 4px; background: #fff; color: #222; font: inherit; box-sizing: border-box; }
  .filter-controls select { border-color: #7a1f2b; cursor: pointer; }
  .filter-controls select:focus, .filter-controls input:focus { outline: 3px solid #dfc9a8; outline-offset: 1px; }
  @media (max-width: 540px) { .filter-controls { grid-template-columns: 1fr; gap: 0.6rem; } }
  ul.plan { list-style: none; padding: 0; margin: 0; }
  ul.plan li { padding: 0.4rem 0.5rem; border-bottom: 1px solid #e5ddd0; border-left: 4px solid transparent; }
  ul.plan li:hover { background: #f5eee0; }
  ul.plan li.feast { background: #fff8e2; border-left-color: #c9971b; }
  ul.plan li.fast { background: #eef4f8; border-left-color: #5b7c99; }
  ul.plan li.is-today { outline: 2px solid #7a1f2b; outline-offset: -2px; }
  .date { font-weight: bold; color: #7a1f2b; display: inline-block; min-width: 9rem; }
  .tag { font-style: italic; color: #555; }
  .badge { font-size: 0.7rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em; border-radius: 3px; padding: 0.1rem 0.4rem; margin-right: 0.3rem; display: inline-block; }
  .feast-badge { background: #c9971b; color: #fff; }
  .fast-badge { background: #5b7c99; color: #fff; }
  a { color: #1a5276; text-decoration: none; }
  a:hover { text-decoration: underline; }
  a.en-link { font-size: 0.8rem; color: #7a1f2b; border: 1px solid #7a1f2b; border-radius: 4px; padding: 0 0.3rem; text-decoration: none; }
  a.en-link:hover { background: #7a1f2b; color: #fff; }
  a.cont-link { font-size: 0.8rem; color: #888; }
  .unresolved, .no-readings { color: #999; font-style: italic; }
</style>
<!-- Cloudflare Web Analytics -->
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "d1bfa8daaf504008b837aaeb3ffb8f78"}'></script>
<!-- End Cloudflare Web Analytics -->
</head>
<body>
<img class="banner" src="${bgFileName}" alt="Sevan peninsula monasteries, Armenia">
<div class="page">
<h1>📖 Armenian Apostolic Daily Bible Readings (2026)</h1>

<div id="today-card">
  <h2 id="today-heading">Give us this day our daily bread</h2>
  <div class="today-nav">
    <button id="prev-day" class="nav-arrow" type="button" aria-label="Previous day">&larr;</button>
    <span id="today-date" class="today-date" aria-live="polite">Loading...</span>
    <button id="next-day" class="nav-arrow" type="button" aria-label="Next day">&rarr;</button>
  </div>
  <div id="today-body">Loading...</div>
  <a href="#" id="back-to-today" class="back-link" style="display:none;">&uarr; Back to Today</a>
</div>

<p class="summary">Daily Scripture readings for 2026 following the Armenian Apostolic Church's liturgical calendar, compiled by AREC (Western Prelacy).</p>
<details class="more-info">
  <summary>More info</summary>
  <p lang="hy">${escapeHtml(ARM_PLAN.meta.nameHy)}</p>
  <p>${escapeHtml(ARM_PLAN.meta.descriptionEn)}</p>
  <p>${escapeHtml(ARM_PLAN.meta.attributionEn)}</p>
  <p>Armenian links use the Western Armenian Bible (WARMB, bible.com version ${ARMENIAN_OT_VERSION_ID}) for Old Testament readings and the Western Armenian New Translation (WANTACOC, version ${ARMENIAN_NT_VERSION_ID}) for New Testament readings. English "EN" links use the NKJV (version ${ENGLISH_VERSION_ID}). A few readings cite deuterocanonical books (Tobit, Judith, Wisdom, Sirach, Baruch, 1-2 Maccabees, marked &dagger;) that aren't included in WARMB, WANTACOC, or the NKJV - those links fall back to the ՆԷԱ (New Ejmiatsin) Armenian Bible, and no English link is shown. <span class="badge feast-badge">Feast</span> and <span class="badge fast-badge">Fast</span> days are highlighted below.</p>
</details>

<div class="filter-controls">
  <label for="month-filter">Go to month
    <select id="month-filter" class="month-filter">
      <option value="all">All months</option>
      ${MONTH_NAMES.map((month, index) => `<option value="${String(index + 1).padStart(2, "0")}">${month}</option>`).join("")}
    </select>
  </label>
  <label for="text-filter">Search readings
    <input type="search" id="text-filter" class="filter" placeholder="Type a date, feast, or book (e.g. Isaiah)...">
  </label>
</div>
<ul class="plan" id="plan-list">
${renderCalendarDays()}
</ul>
</div>

<script>
  var CALENDAR = ${CALENDAR_JSON};
  var MONTH_NAMES = ${JSON.stringify(MONTH_NAMES)};

  function todayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return { full: d.getFullYear() + '-' + mm + '-' + dd, monthDay: mm + '-' + dd };
  }

  function findTodayIndex() {
    var today = todayStr();
    var idx = CALENDAR.findIndex(function (d) { return d.date === today.full; });
    if (idx === -1) idx = CALENDAR.findIndex(function (d) { return d.date.slice(5) === today.monthDay; });
    return idx;
  }

  var todayIndex = findTodayIndex();
  var viewedIndex = todayIndex === -1 ? 0 : todayIndex;

  function renderCard(index) {
    if (index < 0) index = 0;
    if (index > CALENDAR.length - 1) index = CALENDAR.length - 1;
    viewedIndex = index;
    var entry = CALENDAR[index];
    var card = document.getElementById('today-card');
    var body = document.getElementById('today-body');
    var date = document.getElementById('today-date');
    var backLink = document.getElementById('back-to-today');
    if (!entry) {
      body.innerHTML = '<span class="unresolved">No reading found - browse the full list below.</span>';
      return;
    }
    body.innerHTML = entry.html;
    date.textContent = entry.dateLabel;
    card.classList.toggle('feast', !!entry.feast);
    card.classList.toggle('fast', !!entry.fast);
    document.querySelectorAll('#plan-list li.is-today').forEach(function (li) { li.classList.remove('is-today'); });
    var li = document.querySelector('#plan-list li[data-date="' + entry.date + '"]');
    if (li) li.classList.add('is-today');
    if (index === todayIndex) {
      backLink.style.display = 'none';
    } else {
      backLink.style.display = '';
    }
    document.getElementById('prev-day').disabled = index <= 0;
    document.getElementById('next-day').disabled = index >= CALENDAR.length - 1;
  }

  renderCard(viewedIndex);

  document.getElementById('prev-day').addEventListener('click', function () { renderCard(viewedIndex - 1); });
  document.getElementById('next-day').addEventListener('click', function () { renderCard(viewedIndex + 1); });
  document.getElementById('back-to-today').addEventListener('click', function (e) {
    e.preventDefault();
    renderCard(todayIndex === -1 ? 0 : todayIndex);
  });

  var input = document.querySelector('input.filter');
  var monthSelect = document.getElementById('month-filter');
  var list = document.getElementById('plan-list');

  function applyFilter() {
    var query = input.value.trim().toLowerCase();
    var selectedMonth = monthSelect.value;
    list.querySelectorAll('li').forEach(function (li) {
      var matchesMonth = selectedMonth === 'all' || li.dataset.date.slice(5, 7) === selectedMonth;
      var matchesText = li.textContent.toLowerCase().includes(query);
      li.style.display = matchesMonth && matchesText ? '' : 'none';
    });
  }

  input.addEventListener('input', applyFilter);
  monthSelect.addEventListener('change', applyFilter);

  monthSelect.value = String(new Date().getMonth() + 1).padStart(2, '0');
  applyFilter();
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
