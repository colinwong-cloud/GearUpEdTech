import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const registryPath = path.join(workspaceRoot, "docs", "feature-registry.json");

function fail(message) {
  console.error(`[feature-retention] ${message}`);
}

if (!existsSync(registryPath)) {
  fail(`Registry file not found: ${registryPath}`);
  process.exit(1);
}

let registry;
try {
  registry = JSON.parse(readFileSync(registryPath, "utf8"));
} catch (error) {
  fail(`Failed to parse registry JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const requiredFiles = Array.isArray(registry.requiredFiles) ? registry.requiredFiles : [];
const requiredSubstrings = Array.isArray(registry.requiredSubstrings) ? registry.requiredSubstrings : [];

const fileContentCache = new Map();
const errors = [];
let checksRun = 0;

for (const relativeFile of requiredFiles) {
  checksRun += 1;
  const absoluteFile = path.join(workspaceRoot, relativeFile);
  if (!existsSync(absoluteFile)) {
    errors.push(`Missing required file: ${relativeFile}`);
  }
}

for (const entry of requiredSubstrings) {
  const relativeFile = entry?.file;
  const values = Array.isArray(entry?.values) ? entry.values : [];
  if (typeof relativeFile !== "string" || relativeFile.length === 0) {
    errors.push("Invalid registry entry: requiredSubstrings.file must be a non-empty string");
    continue;
  }

  const absoluteFile = path.join(workspaceRoot, relativeFile);
  if (!existsSync(absoluteFile)) {
    for (const value of values) {
      checksRun += 1;
      errors.push(`Missing required file for marker check: ${relativeFile} (marker: ${String(value)})`);
    }
    continue;
  }

  let content = fileContentCache.get(relativeFile);
  if (content === undefined) {
    content = readFileSync(absoluteFile, "utf8");
    fileContentCache.set(relativeFile, content);
  }

  for (const value of values) {
    checksRun += 1;
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`Invalid marker value in ${relativeFile}: must be non-empty string`);
      continue;
    }
    if (!content.includes(value)) {
      errors.push(`Missing marker in ${relativeFile}: "${value}"`);
    }
  }
}

if (errors.length > 0) {
  fail(`FAILED (${errors.length} issue${errors.length > 1 ? "s" : ""})`);
  for (const entry of errors) {
    fail(`- ${entry}`);
  }
  process.exit(1);
}

console.log(
  `[feature-retention] PASS - ${requiredFiles.length} file checks + ${checksRun - requiredFiles.length} marker checks (${checksRun} total)`
);
