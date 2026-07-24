import { describe, expect, it } from "vitest";
import {
  REQUIRED_AIRWALLEX_ALL_METHODS,
  applyAirwallexMethodSafeguards,
  enforceRecurringCheckoutMethods,
  getAirwallexMethodsForSelection,
} from "./airwallex-checkout-methods";

describe("getAirwallexMethodsForSelection", () => {
  it("returns the full all-method list for all selection", () => {
    expect(getAirwallexMethodsForSelection("all")).toEqual([
      ...REQUIRED_AIRWALLEX_ALL_METHODS,
    ]);
  });

  it("falls back to all-method list for unknown selection", () => {
    expect(getAirwallexMethodsForSelection("unknown")).toEqual([
      ...REQUIRED_AIRWALLEX_ALL_METHODS,
    ]);
  });

  it("falls back to recurring-safe list for unsupported targeted selection", () => {
    expect(getAirwallexMethodsForSelection("wechat_pay")).toEqual([
      ...REQUIRED_AIRWALLEX_ALL_METHODS,
    ]);
  });
});

describe("enforceRecurringCheckoutMethods", () => {
  it("blocks non-recurring wallet methods from checkout payload", () => {
    const result = enforceRecurringCheckoutMethods([
      "card",
      "applepay",
      "alipayhk",
      "wechatpay",
    ]);

    expect(result.methods).toEqual(["card", "applepay"]);
    expect(result.blockedByRecurringPolicy).toEqual(["alipayhk", "wechatpay"]);
  });
});

describe("applyAirwallexMethodSafeguards", () => {
  it("re-adds missing required methods for all selection", () => {
    const result = applyAirwallexMethodSafeguards({
      paymentMethod: "all",
      methods: ["card", "applepay"],
    });

    expect(result.methods).toEqual([
      "card",
      "applepay",
      "googlepay",
    ]);
    expect(result.missingRequired).toEqual(["googlepay"]);
    expect(result.blockedByRecurringPolicy).toEqual([]);
  });

  it("does not inject unrelated methods for targeted selection", () => {
    const result = applyAirwallexMethodSafeguards({
      paymentMethod: "cards",
      methods: ["card"],
    });

    expect(result.methods).toEqual(["card"]);
    expect(result.missingRequired).toEqual([]);
    expect(result.blockedByRecurringPolicy).toEqual([]);
  });

  it("reports blocked methods when stale unsupported methods are provided", () => {
    const result = applyAirwallexMethodSafeguards({
      paymentMethod: "all",
      methods: ["card", "alipayhk", "wechatpay"],
    });

    expect(result.methods).toEqual(["card", "applepay", "googlepay"]);
    expect(result.missingRequired).toEqual(["applepay", "googlepay"]);
    expect(result.blockedByRecurringPolicy).toEqual(["alipayhk", "wechatpay"]);
  });
});
