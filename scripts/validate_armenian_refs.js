// Validates data/armenian_2026_plan.json: flags any reference string that doesn't look like a
// well-formed "Book Chapter:Verse[-Chapter:Verse]" citation, so we can manually review edge cases.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", `armenian_${process.argv[2] || 2026}_plan.json`);
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// A reasonably permissive pattern for a single scripture reference:
// optional leading number (1/2/3), book name (letters/spaces/periods), chapter:verse, optional range.
const REF_PATTERN = /^[1-3]?\s?[A-Za-z][A-Za-z. ]*\d+(:\d+)?([-–—]\d+(:\d+)?)?\.?$/;

let flagged = 0;
let totalRefs = 0;
for (const entry of data.calendar) {
  for (const ref of entry.references) {
    totalRefs++;
    if (!REF_PATTERN.test(ref)) {
      flagged++;
      console.log(`${entry.monthName} ${entry.day}: "${ref}"`);
    }
  }
}

console.log(`\nTotal references: ${totalRefs}`);
console.log(`Flagged as possibly malformed: ${flagged}`);
