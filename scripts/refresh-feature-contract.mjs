import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { FEATURE_CONTRACT_BASE } from "./feature-contract-source.mjs";

function getCommitInventorySince(startDate) {
  const cmd =
    `git log --since="${startDate}" --no-merges --date=short ` +
    `--pretty='format:%H|%ad|%s'`;
  const raw = execSync(cmd, { encoding: "utf8" }).trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...summaryParts] = line.split("|");
      return {
        sha,
        date,
        summary: summaryParts.join("|").trim(),
      };
    });
}

function buildContract() {
  const generatedAt = new Date().toISOString();
  const commit_inventory = getCommitInventorySince(
    FEATURE_CONTRACT_BASE.coverage_start_date
  );
  return {
    ...FEATURE_CONTRACT_BASE,
    generated_at: generatedAt,
    commit_inventory,
    inventory_stats: {
      total_commits_since_start: commit_inventory.length,
      total_feature_rows: FEATURE_CONTRACT_BASE.features.length,
    },
  };
}

const outPath = resolve(process.cwd(), "docs/feature-contract.json");
mkdirSync(dirname(outPath), { recursive: true });
const payload = buildContract();
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `[feature-contract] wrote docs/feature-contract.json with ${payload.inventory_stats.total_commits_since_start} commits and ${payload.inventory_stats.total_feature_rows} feature rows`
);

