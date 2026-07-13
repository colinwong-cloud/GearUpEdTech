import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  console.error(`[payment-priority] ${message}`);
  process.exit(1);
}

function requireFile(path) {
  const absPath = resolve(process.cwd(), path);
  if (!existsSync(absPath)) {
    fail(`required file missing: ${path}`);
  }
  return readFileSync(absPath, "utf8");
}

const checks = [
  {
    path: "src/app/api/payment/checkout/route.ts",
    snippets: [
      "payment_consent",
      "merchant_trigger_reason: \"scheduled\"",
      "DEFAULT_AIRWALLEX_CHECKOUT_LOCALE = \"zh-HK\"",
    ],
  },
  {
    path: "src/app/api/payment/webhook/route.ts",
    snippets: ["eventType.startsWith(\"payment_attempt.\")", "finalizePaymentByIntent"],
  },
  {
    path: "src/app/api/payment/verify/route.ts",
    snippets: ["finalizePaymentByIntent"],
  },
  {
    path: "src/app/api/cron-recurring-payments/route.ts",
    snippets: ["merchant_trigger_reason: \"scheduled\"", "airwallex_payment_consent_id"],
  },
  {
    path: "src/lib/airwallex-checkout-methods.ts",
    snippets: ["\"card\"", "\"applepay\"", "\"googlepay\""],
  },
  {
    path: "src/app/admin/page.tsx",
    snippets: ["付款狀態查詢", "月費家長月度明細"],
  },
  {
    path: "src/app/api/admin/console/route.ts",
    snippets: ["payment_status_enquiry", "payment_monthly_paid_summary"],
  },
  {
    path: "src/lib/server/payment-finalize.ts",
    snippets: ["verifyAndFinalizeParentPayment", "finalizePaymentByIntent"],
  },
  {
    path: "vercel.json",
    snippets: ["/api/cron-recurring-payments"],
  },
];

for (const check of checks) {
  const content = requireFile(check.path);
  for (const snippet of check.snippets) {
    if (!content.includes(snippet)) {
      fail(`missing snippet in ${check.path}: ${JSON.stringify(snippet)}`);
    }
  }
}

requireFile("src/lib/airwallex-checkout-methods.test.ts");
requireFile("src/lib/admin-paid-summary.test.ts");

console.log(`[payment-priority] OK: ${checks.length} payment guard files validated`);

