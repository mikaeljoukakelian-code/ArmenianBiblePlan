// One-off inspection script (Phase 0.3 de-risk): dumps raw extracted text from a lectionary PDF
// so we can design the real parser against real structure instead of guessing.
//
// Usage: node scripts/inspect_pdf.js raw_pdfs/01-January-2026.pdf

const fs = require("fs");
const pdf = require("pdf-parse");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/inspect_pdf.js <path-to-pdf>");
  process.exit(1);
}

const buffer = fs.readFileSync(file);
pdf(buffer).then((data) => {
  console.log(`--- ${file} ---`);
  console.log(`Pages: ${data.numpages}`);
  console.log("--- RAW TEXT START ---");
  console.log(data.text);
  console.log("--- RAW TEXT END ---");
}).catch((err) => {
  console.error("Failed to parse:", err.message);
  process.exit(1);
});
