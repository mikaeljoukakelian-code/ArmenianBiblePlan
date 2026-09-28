// Generates a 365-day reading plan: New Testament chapters (weekdays) + Psalms/Proverbs (weekend reflection days).
//
// Design (365 days total):
//   - NT has exactly 260 chapters. Assigned 5-per-"week" (260 = 52 weeks x 5).
//   - Remaining 105 days (52 weeks x 2 + 1 leftover day) get a Psalm or Proverbs chapter,
//     alternating, so the plan always has exactly one reference per day and never repeats
//     an NT chapter. "Week" here just means a repeating 7-day rhythm, not calendar weeks -
//     a user can start the plan on any real-world day.
//
// Output: data/nt_plus_psalms_plan.json

const fs = require("fs");
const path = require("path");
const {
  NEW_TESTAMENT,
  BOOK_CODES,
  PSALMS_CHAPTER_COUNT,
  PROVERBS_CHAPTER_COUNT,
  flattenChapters,
} = require("./bible_data");

const TOTAL_DAYS = 365;

function buildPlan() {
  const ntChapters = flattenChapters(NEW_TESTAMENT); // 260 entries, canonical order
  let ntIndex = 0;
  let psalmIndex = 0; // next Psalm chapter (0-based) -> chapter = psalmIndex + 1
  let provIndex = 0; // next Proverbs chapter (0-based)
  let fillerToggle = 0; // 0 = try Psalms first, 1 = try Proverbs first

  const days = [];
  for (let day = 1; day <= TOTAL_DAYS; day++) {
    const dayInWeek = (day - 1) % 7; // 0..6, arbitrary repeating rhythm
    const isWeekdaySlot = dayInWeek < 5;

    let book, chapter, type;
    if (isWeekdaySlot && ntIndex < ntChapters.length) {
      ({ book, chapter } = ntChapters[ntIndex++]);
      type = "New Testament";
    } else {
      type = "Reflection (Psalms/Proverbs)";
      if (fillerToggle === 0 && psalmIndex < PSALMS_CHAPTER_COUNT) {
        book = "Psalms";
        chapter = ++psalmIndex;
      } else if (provIndex < PROVERBS_CHAPTER_COUNT) {
        book = "Proverbs";
        chapter = ++provIndex;
      } else {
        book = "Psalms";
        chapter = ++psalmIndex;
      }
      fillerToggle = 1 - fillerToggle;
    }

    days.push({
      day,
      type,
      book,
      chapter,
      reference: `${book} ${chapter}`,
      bookCode: BOOK_CODES[book],
    });
  }

  return {
    ntChaptersUsed: ntIndex,
    psalmsUsed: psalmIndex,
    proverbsUsed: provIndex,
    days,
  };
}

function validate(result) {
  const errors = [];
  if (result.days.length !== TOTAL_DAYS) {
    errors.push(`Expected ${TOTAL_DAYS} days, got ${result.days.length}`);
  }
  if (result.ntChaptersUsed !== 260) {
    errors.push(`Expected all 260 NT chapters used, got ${result.ntChaptersUsed}`);
  }
  const seenNT = new Set();
  for (const d of result.days) {
    if (d.type === "New Testament") {
      const key = d.reference;
      if (seenNT.has(key)) errors.push(`Duplicate NT reference on day ${d.day}: ${key}`);
      seenNT.add(key);
    }
  }
  return errors;
}

function main() {
  const result = buildPlan();
  const errors = validate(result);
  if (errors.length) {
    console.error("Validation FAILED:");
    for (const e of errors) console.error(" -", e);
    process.exitCode = 1;
    return;
  }

  const output = {
    meta: {
      nameEn: "New Testament in a Year (with Psalms & Proverbs)",
      descriptionEn:
        "Read through the entire New Testament in canonical order over 365 days, one chapter on each weekday. " +
        "On weekend reflection days, pause with a Psalm or a chapter of Proverbs to meditate on what you've read.",
      lengthDays: TOTAL_DAYS,
      categories: ["Bible Reading Plans", "New Testament", "Devotional"],
      keywords: ["new testament", "one year", "psalms", "proverbs", "daily reading"],
      recommendedVersions: { english: "NKJV or ESV" },
    },
    stats: {
      ntChaptersUsed: result.ntChaptersUsed,
      psalmsUsed: result.psalmsUsed,
      proverbsUsed: result.proverbsUsed,
      totalDays: result.days.length,
    },
    days: result.days,
  };

  const outPath = path.join(__dirname, "..", "data", "nt_plus_psalms_plan.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("Validation passed.");
  console.log(`NT chapters used: ${result.ntChaptersUsed}/260`);
  console.log(`Psalms used: ${result.psalmsUsed}/150, Proverbs used: ${result.proverbsUsed}/31`);
  console.log(`Total days: ${result.days.length}`);
  console.log(`Wrote ${outPath}`);
}

main();
