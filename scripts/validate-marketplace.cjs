// Validate the files Marketplace fetches, including each generated bundle.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const entries = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
assert(Array.isArray(entries) && entries.length > 0, "Root manifest must be an extension array");
const names = new Set();
for (const entry of entries) {
  assert(!names.has(entry.name), `Duplicate Marketplace entry: ${entry.name}`);
  names.add(entry.name);
  for (const key of ["name", "description", "preview", "main", "readme"]) {
    assert(typeof entry[key] === "string" && entry[key].trim(), `Missing ${key}`);
  }
  for (const key of ["preview", "main", "readme"]) {
    const file = path.resolve(root, entry[key]);
    assert(file.startsWith(root + path.sep), `Path escapes repository: ${entry[key]}`);
    assert(fs.statSync(file).size > 0, `Empty ${entry[key]}`);
  }
  execFileSync(process.execPath, ["--check", path.join(root, entry.main)]);
  if (entry.preview.endsWith(".png")) {
    const data = fs.readFileSync(path.join(root, entry.preview));
    assert(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Preview must be a PNG");
  }
}
console.log(`Validated ${entries.length} Marketplace extension(s)`);
