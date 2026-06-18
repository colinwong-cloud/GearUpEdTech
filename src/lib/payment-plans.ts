export type PaymentPlanCode =
  | "monthly_standard"
  | "tutor_monthly_1on1"
  | "tutor_monthly_1on2";

export type TutorSubject = "Chinese" | "English" | "Math";

export type PaymentPlanDefinition = {
  code: PaymentPlanCode;
  name: string;
  amountHkd: number;
  recurringIntervalMonths: number;
  category: "standard" | "tutor";
  serviceMode: "monthly_membership" | "online_tutor_1on1" | "online_tutor_1on2";
};

export const DEFAULT_PAYMENT_PLAN_CODE: PaymentPlanCode = "monthly_standard";

export const PAYMENT_PLAN_DEFINITIONS: Record<PaymentPlanCode, PaymentPlanDefinition> = {
  monthly_standard: {
    code: "monthly_standard",
    name: "GearUp 增分寶月費會員",
    amountHkd: 99,
    recurringIntervalMonths: 1,
    category: "standard",
    serviceMode: "monthly_membership",
  },
  tutor_monthly_1on1: {
    code: "tutor_monthly_1on1",
    name: "名師一對一補習（月費）",
    amountHkd: 498,
    recurringIntervalMonths: 1,
    category: "tutor",
    serviceMode: "online_tutor_1on1",
  },
  tutor_monthly_1on2: {
    code: "tutor_monthly_1on2",
    name: "名師一對二補習（月費）",
    amountHkd: 298,
    recurringIntervalMonths: 1,
    category: "tutor",
    serviceMode: "online_tutor_1on2",
  },
};

export function normalizePaymentPlanCode(raw: string | null | undefined): PaymentPlanCode {
  const key = (raw || "").trim().toLowerCase();
  if (
    key === "monthly_standard" ||
    key === "tutor_monthly_1on1" ||
    key === "tutor_monthly_1on2"
  ) {
    return key;
  }
  return DEFAULT_PAYMENT_PLAN_CODE;
}

export function getPaymentPlanDefinition(
  raw: string | null | undefined
): PaymentPlanDefinition {
  return PAYMENT_PLAN_DEFINITIONS[normalizePaymentPlanCode(raw)];
}

export function normalizeTutorSubject(raw: string | null | undefined): TutorSubject | null {
  const key = (raw || "").trim().toLowerCase();
  if (!key) return null;

  if (key === "chinese" || key === "chi" || key === "zh") return "Chinese";
  if (key === "english" || key === "eng" || key === "en") return "English";
  if (key === "math" || key === "maths" || key === "mathematics") return "Math";
  return null;
}

export function isTutorPlanCode(raw: string | null | undefined): boolean {
  const plan = getPaymentPlanDefinition(raw);
  return plan.category === "tutor";
}
