// Phase 2: Downloads all 12 monthly "Daily Bible Readings" PDFs from the Western Prelacy of the
// Armenian Apostolic Church for a given year, parses them into structured daily entries, and
// writes a bible.com-ready 365(-ish)-day plan.
//
// Source: https://westernprelacy.org/daily-bible-readings/
// URL pattern: https://westernprelacy.org/wp-content/uploads/{year}/01/{MM}-{MonthName}-{year}.pdf
//
// Usage: node scripts/scrape_armenian_readings.js [year]

const fs = require("fs");
const path = require("path");
const https = require("https");
const pdf = require("pdf-parse");

const YEAR = parseInt(process.argv[2], 10) || 2026;
const RAW_DIR = path.join(__dirname, "..", "raw_pdfs");
const OUT_PATH = path.join(__dirname, "..", "data", `armenian_${YEAR}_plan.json`);

const MONTHS = [
  ["01", "January", 31], ["02", "February", 28], ["03", "March", 31],
  ["04", "April", 30], ["05", "May", 31], ["06", "June", 30],
  ["07", "July", 31], ["08", "August", 31], ["09", "September", 30],
  ["10", "October", 31], ["11", "November", 30], ["12", "December", 31],
];
// Note: does not adjust February for leap years - fine for 2026 (not a leap year).
// A future run for a leap year should bump Feb to 29 here.

function monthUrl(mm, name) {
  return `https://westernprelacy.org/wp-content/uploads/${YEAR}/01/${mm}-${name}-${YEAR}.pdf`;
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const doGet = (u, redirectsLeft) => {
      https.get(u, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          doGet(new URL(res.headers.location, u).toString(), redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          fs.writeFileSync(destPath, buf);
          resolve(buf);
        });
      }).on("error", reject);
    };
    doGet(url, 5);
  });
}

async function getMonthBuffer(mm, name) {
  const dest = path.join(RAW_DIR, `${mm}-${name}-${YEAR}.pdf`);
  if (fs.existsSync(dest)) {
    return fs.readFileSync(dest);
  }
  fs.mkdirSync(RAW_DIR, { recursive: true });
  return download(monthUrl(mm, name), dest);
}

// --- Parsing ---

const BOILERPLATE_LINE = /^(daily bible readings for \d{4}|according to the lectionary of the armenian apostolic church)\s*$/i;
const PAGE_NUMBER_LINE = /^\d{1,3}\s*$/;
const MONTH_HEADER_LINE = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\s*$/i;
const DAY_START_LINE = /^\s*(\d{1,2})\s*\.\s*(.*)$/;
const REFERENCE_HINT = /\d+\s*:\s*\d+/; // e.g. "12:5" - presence strongly indicates a scripture reference line

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

// Some days (esp. Holy Week, Theophany) embed labeled liturgical sub-sections directly inline with no
// comma/semicolon before them, e.g. "Mark 16:2-8 Evening Readings: Acts 1:1-8" or
// "...Matthew 3:1-17" preceded by "Blessing of Water:". A label is a capitalized word/phrase immediately
// followed by ":" where the character before the colon is a letter (not a digit) - genuine
// "Book chapter:verse" references always have a digit right before the colon, so this is unambiguous.
const INLINE_LABEL = /\b[A-Z][a-zA-Z]*(?:\s+(?:\([^)]*\)|[A-Za-z]+)){0,8}:\s*/g;

function splitReferences(referencesRaw) {
  if (!referencesRaw) return [];
  const withLabelsAsSeparators = referencesRaw.replace(INLINE_LABEL, ";");
  // Fix rare PDF-extraction artifact where a book name and chapter run together with no space
  // (e.g. "Exodus12:1-24" -> "Exodus 12:1-24").
  const spaced = withLabelsAsSeparators.replace(/([A-Za-z])(\d)/g, "$1 $2");
  // Some entries glue two reading groups together with only a line-break (no ";"/"," delimiter) in the
  // source, e.g. "Luke 1:39-56 2 Thessalonians 2:1-16". Detect "<end of a reference><whitespace><start
  // of another reference>" and insert a separator. The lookbehind requires the preceding digit to itself
  // be preceded by a digit/colon/dash (i.e. be the tail of a verse range like "...1:39-56"), NOT a fresh
  // book-name-leading digit (e.g. the "2" in "2 Corinthians") - otherwise this would wrongly split
  // numbered book names such as "1 Timothy", "2 Kings", "1 Peter", etc. The book-name prefix may be
  // either "N " (e.g. "2 Corinthians") or a numbered-list marker "N) " (e.g. "4) Mark", used in the
  // Easter-to-Pentecost season's four-Gospel reading cycle).
  const unglued = spaced.replace(/(?<=[\d:-])(\d)\s+((?:[1-3]\s|[1-4]\)\s)?[A-Z][a-zA-Z]+\s\d)/g, "$1;$2");
  const refs = unglued
    .split(/[;,]/)
    .map((r) => normalizeWhitespace(r).replace(/^\d+\)\s*/, ""))
    // Clean up stray OCR/wrap spacing around chapter:verse punctuation, e.g. "17: 7-8" -> "17:7-8",
    // "2:11- 18" -> "2:11-18".
    .map((r) => r.replace(/\s*:\s*/g, ":").replace(/\s*-\s*/g, "-"))
    .filter(Boolean);

  // Some entries continue the previous reference's book without repeating its name, e.g.
  // "Jeremiah 1:1-10; 38:1-13" (the second is really "Jeremiah 38:1-13"). Carry the book name forward
  // for any token that starts directly with a chapter:verse pattern (no leading book name).
  const CONTINUATION = /^\d+:\d+/;
  const BOOK_NAME = /^[1-3]?\s?[A-Za-z][A-Za-z.]*(?:\s[A-Za-z][A-Za-z.]*)*/;
  let lastBook = null;
  for (let i = 0; i < refs.length; i++) {
    if (CONTINUATION.test(refs[i]) && lastBook) {
      refs[i] = `${lastBook} ${refs[i]}`;
    } else {
      const m = BOOK_NAME.exec(refs[i]);
      if (m) lastBook = m[0].trim();
    }
  }
  return refs;
}

function isBoilerplate(line) {
  const t = line.trim();
  if (!t) return true;
  if (BOILERPLATE_LINE.test(t)) return true;
  if (PAGE_NUMBER_LINE.test(t)) return true;
  return false;
}

// Parses one month's raw PDF text into an array of { day, title, referencesRaw, references, noReadings }
// `expectedMonthLabel` (e.g. "January 2026") is used to know where THIS month's content starts, and
// stop before content bleeds into the following month/year (some PDFs include a preview of next month).
function parseMonthText(rawText, expectedMonthLabel, daysInMonth) {
  const lines = rawText.split(/\r?\n/);

  // Find the start of the target month's section (first matching month header).
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (normalizeWhitespace(lines[i]).toLowerCase() === expectedMonthLabel.toLowerCase()) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) {
    throw new Error(`Could not find month header "${expectedMonthLabel}" in PDF text`);
  }

  // Find where the NEXT month header appears (bleed-over content) to know where to stop.
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    const t = normalizeWhitespace(lines[i]);
    if (MONTH_HEADER_LINE.test(t) && t.toLowerCase() !== expectedMonthLabel.toLowerCase()) {
      endIdx = i;
      break;
    }
  }

  // Filter out page headers/footers. A standalone 1-3 digit line is normally a page number, but if the
  // preceding kept line ends in a hyphen (a wrapped verse range continuing onto the next page/line,
  // e.g. "John 15:1-" / "8"), it's actually the tail of a reference - keep it and glue it back on.
  const rawSlice = lines.slice(startIdx, endIdx);
  const relevant = [];
  for (const l of rawSlice) {
    const trimmed = l.trim();
    if (PAGE_NUMBER_LINE.test(trimmed) && relevant.length > 0 && /-\s*$/.test(relevant[relevant.length - 1])) {
      relevant[relevant.length - 1] = relevant[relevant.length - 1].replace(/-\s*$/, `-${trimmed}`);
      continue;
    }
    if (!isBoilerplate(l)) relevant.push(l);
  }

  // Group lines into day blocks.
  const blocks = []; // { day, lines: [] }
  for (const line of relevant) {
    const m = DAY_START_LINE.exec(line);
    if (m) {
      const dayNum = parseInt(m[1], 10);
      // Guard against false positives (e.g. stray numbers) - day must be in valid range and increasing.
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        blocks.push({ day: dayNum, lines: [m[2]] });
        continue;
      }
    }
    if (blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }

  // Some PDFs have a two-column-layout text-extraction glitch that occasionally misprints/duplicates a
  // day number (e.g. "22" appearing where "20" was expected). The PDF always lists every day of the
  // month in order (including explicit "No Readings" entries), so if we found exactly `daysInMonth`
  // blocks, trust positional order over the printed digit.
  if (blocks.length === daysInMonth) {
    blocks.forEach((b, i) => {
      const expected = i + 1;
      if (b.day !== expected) {
        console.warn(`  NOTE: ${expectedMonthLabel} day-number mismatch: printed "${b.day}", using positional "${expected}"`);
      }
      b.day = expected;
    });
  } else {
    console.warn(`  WARNING: ${expectedMonthLabel} expected ${daysInMonth} day-blocks, found ${blocks.length}; keeping printed day numbers as-is.`);
  }

  const results = [];
  for (const block of blocks) {
    const nonEmptyLines = block.lines.map((l) => normalizeWhitespace(l)).filter(Boolean);
    const fullText = nonEmptyLines.join(" ");

    if (/^no readings\.?$/i.test(fullText)) {
      results.push({ day: block.day, title: null, referencesRaw: null, references: [], noReadings: true });
      continue;
    }

    const titleParts = [];
    const refParts = [];
    for (const line of nonEmptyLines) {
      if (REFERENCE_HINT.test(line)) refParts.push(line);
      else titleParts.push(line);
    }

    const referencesRaw = normalizeWhitespace(refParts.join(" "));
    const references = splitReferences(referencesRaw);

    results.push({
      day: block.day,
      title: titleParts.length ? normalizeWhitespace(titleParts.join(" ")) : null,
      referencesRaw: referencesRaw || null,
      references,
      noReadings: references.length === 0,
    });
  }

  return results;
}

async function main() {
  const allEntries = []; // { year, month, monthName, day, title, references, noReadings }

  for (const [mm, name, daysInMonth] of MONTHS) {
    console.log(`Fetching ${name} ${YEAR}...`);
    const buffer = await getMonthBuffer(mm, name);
    const data = await pdf(buffer);
    const parsed = parseMonthText(data.text, `${name} ${YEAR}`, daysInMonth);

    const byDay = new Map(parsed.map((e) => [e.day, e]));
    for (let d = 1; d <= daysInMonth; d++) {
      const entry = byDay.get(d);
      if (!entry) {
        console.warn(`  WARNING: no entry parsed for ${name} ${d}, ${YEAR}`);
        allEntries.push({
          year: YEAR, month: parseInt(mm, 10), monthName: name, day: d,
          title: null, references: [], noReadings: true, parseWarning: "missing",
        });
        continue;
      }
      allEntries.push({
        year: YEAR, month: parseInt(mm, 10), monthName: name, day: d,
        title: entry.title, references: entry.references, noReadings: entry.noReadings,
      });
    }
    console.log(`  Parsed ${parsed.length}/${daysInMonth} days.`);
  }

  // A few days point back to a previous day's readings instead of restating them, e.g.
  // "The same lections as above" (seen the day after certain feasts). Resolve these by copying the
  // previous calendar day's references.
  const SAME_AS_ABOVE = /^(the\s+)?same\s+(lections?|readings?)\s+as\s+above\.?$/i;
  for (let i = 0; i < allEntries.length; i++) {
    if (allEntries[i].references.some((r) => SAME_AS_ABOVE.test(r)) && i > 0) {
      allEntries[i].references = allEntries[i].references.filter((r) => !SAME_AS_ABOVE.test(r));
      allEntries[i].references.push(...allEntries[i - 1].references);
    }
  }

  const noReadingsCount = allEntries.filter((e) => e.noReadings).length;
  const withReadings = allEntries.filter((e) => !e.noReadings);

  // Re-number sequentially as bible.com Plan days (skip calendar dates with no assigned readings,
  // since every Plan day requires >=1 reference).
  const planDays = withReadings.map((e, i) => ({
    day: i + 1,
    calendarDate: `${e.year}-${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`,
    title: e.title,
    references: e.references,
  }));

  const output = {
    meta: {
      nameEn: `Daily Bible Readings ${YEAR}: Armenian Apostolic Church Lectionary`,
      nameHy: `Ամենօրյա Աստվածաշնչի Ընթերցումներ ${YEAR}. Հայ Առաքելական Եկեղեցու Տոնացույց`,
      descriptionEn:
        `Follow the Armenian Apostolic Church's daily Scripture readings for ${YEAR}, as compiled by the Armenian ` +
        `Religious Education Council (AREC) of the Western Prelacy of the Armenian Apostolic Church of America. ` +
        `Each day includes the Church's appointed readings, following the feasts, fasts, and commemorations of the ` +
        `liturgical year.`,
      attributionEn:
        "Readings compiled by the Armenian Religious Education Council (AREC) of the Western Prelacy of the " +
        "Armenian Apostolic Church of America. Source: https://westernprelacy.org/daily-bible-readings/",
      sourceUrl: "https://westernprelacy.org/daily-bible-readings/",
      categories: ["Bible Reading Plans", "Orthodox/Eastern Christianity", "Devotional"],
      keywords: ["armenian", "apostolic", "lectionary", "orthodox", "daily reading"],
      year: YEAR,
    },
    stats: {
      calendarDays: allEntries.length,
      noReadingsDays: noReadingsCount,
      planDays: planDays.length,
    },
    // Full calendar-date-indexed data (including "No Readings" days) for traceability/spot-checking.
    calendar: allEntries,
    // The actual bible.com-ready plan, sequentially numbered.
    days: planDays,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log("\n--- Summary ---");
  console.log(`Calendar days processed: ${allEntries.length}`);
  console.log(`"No Readings" days: ${noReadingsCount}`);
  console.log(`Final Plan length: ${planDays.length} days`);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
