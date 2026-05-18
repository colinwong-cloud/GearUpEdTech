import { describe, expect, it } from "vitest";

import { genderFromAvatarStyle } from "./student-gender";

describe("genderFromAvatarStyle", () => {
  it("maps Boy avatar style to M", () => {
    expect(genderFromAvatarStyle("Boy")).toBe("M");
  });

  it("maps Girl avatar style to F", () => {
    expect(genderFromAvatarStyle("Girl")).toBe("F");
  });

  it("handles case and whitespace safely", () => {
    expect(genderFromAvatarStyle("  girl  ")).toBe("F");
    expect(genderFromAvatarStyle("BOY")).toBe("M");
  });

  it("returns null for unsupported values", () => {
    expect(genderFromAvatarStyle("")).toBeNull();
    expect(genderFromAvatarStyle("Unknown")).toBeNull();
  });
});
