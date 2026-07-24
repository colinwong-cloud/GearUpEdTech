export const REQUIRED_AIRWALLEX_ALL_METHODS = [
  "card",
  "applepay",
  "googlepay",
] as const;

const AIRWALLEX_METHOD_MAP: Record<string, readonly string[]> = {
  all: REQUIRED_AIRWALLEX_ALL_METHODS,
  cards: ["card"],
  apple_pay: ["applepay"],
  google_pay: ["googlepay"],
};

function normalizeMethodToken(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeMethods(methods: string[]): string[] {
  return Array.from(new Set(methods.map(normalizeMethodToken).filter(Boolean)));
}

export function getAirwallexMethodsForSelection(paymentMethod: string): string[] {
  const key = normalizeMethodToken(paymentMethod || "all");
  return [...(AIRWALLEX_METHOD_MAP[key] ?? AIRWALLEX_METHOD_MAP.all)];
}

export function enforceRecurringCheckoutMethods(methods: string[]): {
  methods: string[];
  blockedByRecurringPolicy: string[];
} {
  const normalized = dedupeMethods(methods);
  const allowed = new Set(REQUIRED_AIRWALLEX_ALL_METHODS);
  const allowedMethods = normalized.filter((method) => allowed.has(method as (typeof REQUIRED_AIRWALLEX_ALL_METHODS)[number]));
  const blockedByRecurringPolicy = normalized.filter((method) => !allowed.has(method as (typeof REQUIRED_AIRWALLEX_ALL_METHODS)[number]));
  return {
    methods: allowedMethods,
    blockedByRecurringPolicy,
  };
}

export function applyAirwallexMethodSafeguards({
  paymentMethod,
  methods,
}: {
  paymentMethod: string;
  methods: string[];
}): {
  methods: string[];
  missingRequired: string[];
  blockedByRecurringPolicy: string[];
} {
  const candidate = methods.length > 0 ? methods : getAirwallexMethodsForSelection(paymentMethod);
  const { methods: recurringMethods, blockedByRecurringPolicy } =
    enforceRecurringCheckoutMethods(candidate);
  if (normalizeMethodToken(paymentMethod || "all") !== "all") {
    return {
      methods: recurringMethods,
      missingRequired: [],
      blockedByRecurringPolicy,
    };
  }

  const missingRequired = REQUIRED_AIRWALLEX_ALL_METHODS.filter(
    (method) => !recurringMethods.includes(method)
  );
  return {
    methods: [...recurringMethods, ...missingRequired],
    missingRequired: [...missingRequired],
    blockedByRecurringPolicy,
  };
}
