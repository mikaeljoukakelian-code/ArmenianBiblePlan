// Canonical book names and chapter counts used by the plan generators.
// Chapter counts are standard across virtually all English/Armenian Bible versions.

const NEW_TESTAMENT = [
  ["Matthew", 28], ["Mark", 16], ["Luke", 24], ["John", 21],
  ["Acts", 28],
  ["Romans", 16], ["1 Corinthians", 16], ["2 Corinthians", 13],
  ["Galatians", 6], ["Ephesians", 6], ["Philippians", 4], ["Colossians", 4],
  ["1 Thessalonians", 5], ["2 Thessalonians", 3],
  ["1 Timothy", 6], ["2 Timothy", 4], ["Titus", 3], ["Philemon", 1],
  ["Hebrews", 13], ["James", 5],
  ["1 Peter", 5], ["2 Peter", 3],
  ["1 John", 5], ["2 John", 1], ["3 John", 1], ["Jude", 1],
  ["Revelation", 22],
];

// USFM-style book codes used by bible.com deep links (/bible/{versionId}/{BOOK}.{chapter}.{versionAbbr})
const BOOK_CODES = {
  // New Testament
  "Matthew": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT",
  "Romans": "ROM", "1 Corinthians": "1CO", "2 Corinthians": "2CO",
  "Galatians": "GAL", "Ephesians": "EPH", "Philippians": "PHP", "Colossians": "COL",
  "1 Thessalonians": "1TH", "2 Thessalonians": "2TH",
  "1 Timothy": "1TI", "2 Timothy": "2TI", "Titus": "TIT", "Philemon": "PHM",
  "Hebrews": "HEB", "James": "JAS", "1 Peter": "1PE", "2 Peter": "2PE",
  "1 John": "1JN", "2 John": "2JN", "3 John": "3JN", "Jude": "JUD",
  "Revelation": "REV",
  // Old Testament
  "Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV", "Numbers": "NUM", "Deuteronomy": "DEU",
  "Joshua": "JOS", "Judges": "JDG", "Ruth": "RUT",
  "1 Samuel": "1SA", "2 Samuel": "2SA", "1 Kings": "1KI", "2 Kings": "2KI",
  "1 Chronicles": "1CH", "2 Chronicles": "2CH", "Ezra": "EZR", "Nehemiah": "NEH", "Esther": "EST",
  "Job": "JOB", "Psalms": "PSA", "Proverbs": "PRO", "Ecclesiastes": "ECC", "Song of Songs": "SNG",
  "Isaiah": "ISA", "Jeremiah": "JER", "Lamentations": "LAM", "Ezekiel": "EZK", "Daniel": "DAN",
  "Hosea": "HOS", "Joel": "JOL", "Amos": "AMO", "Obadiah": "OBA", "Jonah": "JON", "Micah": "MIC",
  "Nahum": "NAM", "Habakkuk": "HAB", "Zephaniah": "ZEP", "Haggai": "HAG", "Zechariah": "ZEC", "Malachi": "MAL",
  // Deuterocanonical/Apocrypha (used in the Armenian Apostolic lectionary and the ՆԷԱ Armenian Bible, id 2860)
  "Tobit": "TOB", "Judith": "JDT", "Wisdom": "WIS", "Sirach": "SIR", "Baruch": "BAR",
  "1 Maccabees": "1MA", "2 Maccabees": "2MA",
};

// Known typos/abbreviation variants seen in the Western Prelacy source PDFs, normalized to the
// canonical names used as keys in BOOK_CODES above.
const BOOK_NAME_ALIASES = {
  "Mathew": "Matthew",
  "Matt": "Matthew",
  "Song of Song": "Song of Songs",
};

function normalizeBookName(name) {
  return BOOK_NAME_ALIASES[name] || name;
}

const PSALMS_CHAPTER_COUNT = 150;
const PROVERBS_CHAPTER_COUNT = 31;

function flattenChapters(books) {
  // Returns an array of { book, chapter } for every chapter in every book, in canonical order.
  const out = [];
  for (const [book, count] of books) {
    for (let c = 1; c <= count; c++) out.push({ book, chapter: c });
  }
  return out;
}

module.exports = {
  NEW_TESTAMENT,
  BOOK_CODES,
  BOOK_NAME_ALIASES,
  normalizeBookName,
  PSALMS_CHAPTER_COUNT,
  PROVERBS_CHAPTER_COUNT,
  flattenChapters,
};
