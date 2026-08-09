import { spawnSync } from "node:child_process";

function runStep(command, args) {
  const label = `${command} ${args.join(" ")}`;
  console.log(`[release-gate] running: ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

runStep("node", ["scripts/feature-contract-check.mjs"]);
runStep("node", ["scripts/payment-priority-check.mjs"]);
runStep("npx", [
  "vitest",
  "run",
  "src/lib/anti-missing-regressions.test.ts",
  "src/lib/airwallex-checkout-methods.test.ts",
  "src/lib/airwallex-hpp-mit.test.ts",
  "src/lib/server/payment-finalize-consent.test.ts",
  "src/lib/session-practice-summary.test.ts",
  "src/lib/admin-paid-summary.test.ts",
  "src/lib/question-source.test.ts",
  "src/lib/quiz-subjects.test.ts",
]);

console.log("[release-gate] OK");

