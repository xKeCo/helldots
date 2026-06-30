import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const BUDGET_BYTES = 50 * 1024;
const TARGET = "dist/helldots.esm.js";

let raw;
try {
  raw = readFileSync(TARGET);
} catch {
  console.error(`${TARGET} not found — run "npm run build" first.`);
  process.exit(1);
}

const gzipBytes = gzipSync(raw).length;
const gzipKb = (gzipBytes / 1024).toFixed(2);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);

console.log(`${TARGET}: ${gzipKb} KB gzip (budget: ${budgetKb} KB)`);

if (gzipBytes > BUDGET_BYTES) {
  console.error(
    `Size budget exceeded by ${((gzipBytes - BUDGET_BYTES) / 1024).toFixed(2)} KB.`
  );
  process.exit(1);
}
