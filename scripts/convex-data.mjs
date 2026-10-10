#!/usr/bin/env node
// Runs `npx convex data` with the given arguments and prints each document as
// one line of JSON. The CLI prints 64-bit integers as `123n`, which JSON.parse
// rejects, so those become strings.
//
//   node scripts/convex-data.mjs workerState --prod --component presence/batchWorker
//   node scripts/convex-data.mjs sessions --prod --component presence --limit 50

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["convex", "data", ...process.argv.slice(2), "--format", "jsonl"],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] }
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

let unparsed = 0;
for (const line of result.stdout.split("\n")) {
  if (!line.startsWith("{")) {
    // Not a document, e.g. "There are no documents in this table."
    if (line.trim()) console.error(line);
    continue;
  }
  try {
    console.log(JSON.stringify(JSON.parse(quoteBigInts(line))));
  } catch {
    console.error(`Could not parse: ${line}`);
    unparsed++;
  }
}
process.exit(unparsed ? 1 : 0);

/** Quotes each `123n` outside a string literal; string literals pass through whole. */
function quoteBigInts(line) {
  return line.replace(/("(?:[^"\\]|\\.)*")|(-?\d+)n\b/g, (match, string, digits) =>
    string ?? `"${digits}"`
  );
}
