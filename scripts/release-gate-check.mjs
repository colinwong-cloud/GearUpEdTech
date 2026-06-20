import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const REQUIRED_FILES = [
  "docs/feature-registry.md",
  "docs/release-manifest.md",
  "docs/release-deploy-checklist.md",
  "docs/release-sop.md",
];

const errors = [];

function readFileSafe(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireIncludes(content, text, filePath) {
  if (!content.includes(text)) {
    errors.push(`Missing required text in ${filePath}: ${text}`);
  }
}

for (const requiredFile of REQUIRED_FILES) {
  readFileSafe(requiredFile);
}

const registry = readFileSafe("docs/feature-registry.md");
requireIncludes(registry, "# Feature Registry", "docs/feature-registry.md");
requireIncludes(registry, "## B1. Functional feature records", "docs/feature-registry.md");
requireIncludes(registry, "## B2. Release test packs (must-pass packs)", "docs/feature-registry.md");
requireIncludes(registry, "F-TUTOR-PACKAGE", "docs/feature-registry.md");

const manifest = readFileSafe("docs/release-manifest.md");
requireIncludes(manifest, "## Included in this release", "docs/release-manifest.md");
requireIncludes(
  manifest,
  "## Deferred/Parked (explicitly not in this release)",
  "docs/release-manifest.md"
);
requireIncludes(manifest, "## Must-not-break verification", "docs/release-manifest.md");
requireIncludes(manifest, "Gatekeeper agent result: PASS", "docs/release-manifest.md");

const checklist = readFileSafe("docs/release-deploy-checklist.md");
requireIncludes(
  checklist,
  "Parent practice email includes wrong-question readability detail cards",
  "docs/release-deploy-checklist.md"
);
requireIncludes(checklist, "npm run release:gate", "docs/release-deploy-checklist.md");

const sop = readFileSafe("docs/release-sop.md");
requireIncludes(sop, "Hybrid Permanent Gatekeeping", "docs/release-sop.md");
requireIncludes(sop, "docs/feature-registry.md", "docs/release-sop.md");
requireIncludes(sop, "docs/release-manifest.md", "docs/release-sop.md");

if (errors.length > 0) {
  console.error("Release gate check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Release gate check passed.");
