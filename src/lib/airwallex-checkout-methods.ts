export const REQUIRED_AIRWALLEX_ALL_METHODS = [
  "applepay",
  "googlepay",
  "card",
] as const;

const AIRWALLEX_METHOD_MAP: Record<string, readonly string[]> = {
  all: REQUIRED_AIRWALLEX_ALL_METHODS,
  cards: ["card"],
  apple_pay: ["applepay"],
  google_pay: ["googlepay"],
  alipay: ["alipayhk"],
  wechat_pay: ["wechatpay"],
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

export function applyAirwallexMethodSafeguards({
  paymentMethod,
  methods,
}: {
  paymentMethod: string;
  methods: string[];
}): {
  methods: string[];
  missingRequired: string[];
} {
  const candidate = methods.length > 0 ? methods : getAirwallexMethodsForSelection(paymentMethod);
  const normalizedMethods = dedupeMethods(candidate);
  if (normalizeMethodToken(paymentMethod || "all") !== "all") {
    return {
      methods: normalizedMethods,
      missingRequired: [],
    };
  }

  const missingRequired = REQUIRED_AIRWALLEX_ALL_METHODS.filter(
    (method) => !normalizedMethods.includes(method)
  );
  return {
    methods: [...normalizedMethods, ...missingRequired],
    missingRequired: [...missingRequired],
  };
}

export function filterRecurringCapableMethods({
  methods,
  availableMethods,
}: {
  methods: string[];
  availableMethods: string[];
}): {
  methods: string[];
  missingFromAirwallex: string[];
} {
  const recurringAllowed = new Set(REQUIRED_AIRWALLEX_ALL_METHODS);
  const requestedRecurring = dedupeMethods(methods).filter((method) =>
    recurringAllowed.has(method as (typeof REQUIRED_AIRWALLEX_ALL_METHODS)[number])
  );
  if (requestedRecurring.length === 0) {
    return { methods: [], missingFromAirwallex: [] };
  }

  const normalizedAvailable = dedupeMethods(availableMethods);
  if (normalizedAvailable.length === 0) {
    return {
      methods: requestedRecurring,
      missingFromAirwallex: [],
    };
  }

  const availableSet = new Set(normalizedAvailable);
  const methodsInAirwallex = requestedRecurring.filter((method) => availableSet.has(method));
  const missingFromAirwallex = requestedRecurring.filter((method) => !availableSet.has(method));
  return {
    methods: methodsInAirwallex,
    missingFromAirwallex,
  };
}
