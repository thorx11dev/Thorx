#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const limits = {
  trackedFiles: 500,
  markdownFiles: 20,
  screenshotFiles: 40,
  textPayloadBytes: 5 * 1024 * 1024,
  trackedBytes: 25 * 1024 * 1024,
};

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const isText = (file) => /\.(md|markdown|txt|ts|tsx|js|jsx|mjs|cjs|json|sql|css|html|sh|ya?ml|toml|csv|xml|example|production|cache|bak)$/i.test(file);
const isScreenshot = (file) => /(^|\/)(screenshot|screencapture|screenshots?)(_|\/|-)/i.test(file) || /^attached_assets\//i.test(file);
const bytes = (file) => fs.statSync(path.resolve(file)).size;

const trackedBytes = tracked.reduce((sum, file) => sum + bytes(file), 0);
const textPayloadBytes = tracked.filter(isText).reduce((sum, file) => sum + bytes(file), 0);
const markdownFiles = tracked.filter((file) => /\.(md|markdown)$/i.test(file));
const screenshotFiles = tracked.filter(isScreenshot);

const checks = [
  ["tracked files", tracked.length, limits.trackedFiles],
  ["Markdown files", markdownFiles.length, limits.markdownFiles],
  ["screenshot/archive image files", screenshotFiles.length, limits.screenshotFiles],
  ["text payload bytes", textPayloadBytes, limits.textPayloadBytes],
  ["tracked bytes", trackedBytes, limits.trackedBytes],
];

const failures = checks.filter(([, actual, limit]) => actual > limit);
for (const [name, actual, limit] of checks) {
  console.log(`[repo-hygiene] ${name}: ${actual} (limit ${limit})`);
}

if (failures.length > 0) {
  console.error("[repo-hygiene] limits exceeded; move historical material to thorx-docs-audits");
  process.exit(1);
}

console.log("[repo-hygiene] repository is within import limits");