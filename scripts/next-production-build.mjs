import { spawnSync } from "node:child_process";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;

function runWebpackBuild() {
  return spawnSync("npx", ["next", "build", "--webpack"], {
    stdio: "inherit",
    shell: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Turbopack fails Noto Sans TC with "next/font/google queries have exactly one entry"
// on Vercel; webpack matches release-gate and completes the same production build.
// Google font fetches can occasionally return bodies the loader cannot parse — retry.
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const result = runWebpackBuild();
  if (result.status === 0) {
    process.exit(0);
  }
  if (attempt === MAX_ATTEMPTS) {
    process.exit(result.status || 1);
  }
  console.log(
    `[build] Webpack build failed on attempt ${attempt}; retrying in ${RETRY_DELAY_MS / 1000}s`
  );
  await sleep(RETRY_DELAY_MS);
}
