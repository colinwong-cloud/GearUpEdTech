import { describe, expect, it } from "vitest";
import {
  REQUIRED_AIRWALLEX_ALL_METHODS,
  applyAirwallexMethodSafeguards,
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

  it("returns single-method list for targeted selection", () => {
    expect(getAirwallexMethodsForSelection("wechat_pay")).toEqual(["wechatpay"]);
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
      "alipayhk",
      "wechatpay",
    ]);
    expect(result.missingRequired).toEqual(["googlepay", "alipayhk", "wechatpay"]);
  });

  it("does not inject unrelated methods for targeted selection", () => {
    const result = applyAirwallexMethodSafeguards({
      paymentMethod: "cards",
      methods: ["card"],
    });

    expect(result.methods).toEqual(["card"]);
    expect(result.missingRequired).toEqual([]);
  });
});
