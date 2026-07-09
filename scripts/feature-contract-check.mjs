import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  console.error(`[feature-contract] ${message}`);
  process.exit(1);
}

function run(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function getCommitInventorySince(startDate) {
  const cmd =
    `git log --since="${startDate}" --no-merges --date=short ` +
    `--pretty='format:%H|%ad|%s'`;
  const raw = run(cmd);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...summaryParts] = line.split("|");
      return { sha, date, summary: summaryParts.join("|").trim() };
    });
}

function validateCheck(check) {
  if (!check || typeof check !== "object") return false;
  if (check.type === "file_exists") {
    return typeof check.path === "string" && check.path.length > 0;
  }
  if (check.type === "file_contains") {
    return (
      typeof check.path === "string" &&
      check.path.length > 0 &&
      typeof check.snippet === "string" &&
      check.snippet.length > 0
    );
  }
  return false;
}

function runFeatureChecks(features) {
  for (const feature of features) {
    if (!Array.isArray(feature.checks) || feature.checks.length === 0) {
      fail(`feature "${feature.id}" has no retention checks`);
    }
    for (const check of feature.checks) {
      if (!validateCheck(check)) {
        fail(`feature "${feature.id}" has invalid check definition`);
      }
      const absPath = resolve(process.cwd(), check.path);
      if (check.type === "file_exists") {
        if (!existsSync(absPath)) {
          fail(`feature "${feature.id}" missing file: ${check.path}`);
        }
      } else if (check.type === "file_contains") {
        if (!existsSync(absPath)) {
          fail(`feature "${feature.id}" missing file for snippet check: ${check.path}`);
        }
        const content = readFileSync(absPath, "utf8");
        if (!content.includes(check.snippet)) {
          fail(
            `feature "${feature.id}" missing snippet in ${check.path}: ${JSON.stringify(
              check.snippet
            )}`
          );
        }
      }
    }
  }
}

function getChangedFilesAgainstMain() {
  try {
    const base = run("git merge-base HEAD origin/main");
    const diff = run(`git diff --name-only ${base}...HEAD`);
    if (!diff) return [];
    return diff.split("\n").map((row) => row.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function enforceContractUpdatedWhenProductChanges() {
  const changed = getChangedFilesAgainstMain();
  if (changed.length === 0) return;

  const productChanged = changed.some((file) => {
    return (
      file.startsWith("src/") ||
      /^supabase_.*\.sql$/i.test(file) ||
      file === "vercel.json" ||
      file === "package.json"
    );
  });
  if (!productChanged) return;

  const unstaged = run("git diff --name-only");
  const staged = run("git diff --name-only --cached");
  const porcelain = run("git status --porcelain");
  const untracked = porcelain
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.replace(/^[A-Z?]{1,2}\s+/, ""))
    .filter(Boolean);
  const localFiles = `${unstaged}\n${staged}`
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .concat(untracked);
  const localTouched =
    localFiles.includes("docs/feature-contract.json") ||
    localFiles.some((file) => file === "docs/" || file.startsWith("docs/"));
  const contractTouched = changed.includes("docs/feature-contract.json") || localTouched;
  if (!contractTouched) {
    fail(
      "product code changed without updating docs/feature-contract.json. Run: npm run feature:contract:refresh"
    );
  }
}

const contractPath = resolve(process.cwd(), "docs/feature-contract.json");
if (!existsSync(contractPath)) {
  fail("docs/feature-contract.json not found. Run: npm run feature:contract:refresh");
}
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

if (!contract.coverage_start_date) {
  fail("coverage_start_date missing in feature contract");
}
if (!Array.isArray(contract.features) || contract.features.length === 0) {
  fail("features list is empty in feature contract");
}
if (!Array.isArray(contract.commit_inventory) || contract.commit_inventory.length === 0) {
  fail("commit_inventory is empty in feature contract");
}

const ids = new Set();
for (const feature of contract.features) {
  if (!feature.id || typeof feature.id !== "string") {
    fail("feature id is missing or invalid");
  }
  if (ids.has(feature.id)) {
    fail(`duplicate feature id found: ${feature.id}`);
  }
  ids.add(feature.id);

  if (!Array.isArray(feature.evidence_commits) || feature.evidence_commits.length === 0) {
    fail(`feature "${feature.id}" has no evidence_commits`);
  }
}

const months = new Set(contract.features.map((f) => f.month));
const requiredMonths = contract.policy?.required_feature_months || [];
for (const month of requiredMonths) {
  if (!months.has(month)) {
    fail(`missing required month coverage in feature rows: ${month}`);
  }
}

const liveInventory = getCommitInventorySince(contract.coverage_start_date);
const liveShas = new Set(liveInventory.map((row) => row.sha));
const contractShas = new Set(contract.commit_inventory.map((row) => row.sha));

for (const sha of liveShas) {
  if (!contractShas.has(sha)) {
    fail(`commit missing from contract inventory: ${sha}`);
  }
}

for (const feature of contract.features) {
  for (const shortSha of feature.evidence_commits) {
    const hasMatch = [...contractShas].some((fullSha) => fullSha.startsWith(shortSha));
    if (!hasMatch) {
      fail(`feature "${feature.id}" references unknown commit: ${shortSha}`);
    }
  }
}

const paymentCriticalFeatures = contract.features.filter(
  (feature) => feature.priority === "payment-critical"
);
if (paymentCriticalFeatures.length === 0) {
  fail("no payment-critical features found in contract");
}

runFeatureChecks(contract.features);
enforceContractUpdatedWhenProductChanges();

console.log(
  `[feature-contract] OK: ${contract.features.length} feature rows, ${contract.commit_inventory.length} commits, ${paymentCriticalFeatures.length} payment-critical rows`
);

