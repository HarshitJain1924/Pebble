import { mixHex } from "../color-mix";

describe("mixHex", () => {
  it("returns the untouched base at ratio 0 and the accent at ratio 1", () => {
    expect(mixHex("#1C1C21", "#358366", 0)).toBe("#1C1C21");
    expect(mixHex("#1C1C21", "#358366", 1)).toBe("#358366");
  });

  it("blends channels linearly at intermediate ratios", () => {
    // #000000 → #FFFFFF at 50% is #808080 (127.5 rounds to 128).
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    // #1C1C21 → #358366 at 25%: r 28→53 ⇒ 34.25, g 28→131 ⇒ 53.75, b 33→102 ⇒ 50.25
    expect(mixHex("#1C1C21", "#358366", 0.25)).toBe("#223632");
  });

  it("accepts three-digit hex and normalizes the result to six digits", () => {
    expect(mixHex("#000", "#fff", 1)).toBe("#FFFFFF");
    expect(mixHex("#fff", "#000", 0.5)).toBe("#808080");
  });

  it("clamps out-of-range and non-finite ratios instead of producing invalid colors", () => {
    expect(mixHex("#1C1C21", "#358366", -2)).toBe("#1C1C21");
    expect(mixHex("#1C1C21", "#358366", 4)).toBe("#358366");
    expect(mixHex("#1C1C21", "#358366", Number.NaN)).toBe("#1C1C21");
  });

  it("falls back to the base surface when either color is malformed", () => {
    expect(mixHex("#1C1C21", "not-a-color", 0.5)).toBe("#1C1C21");
    expect(mixHex("#1C1C21", "#12345", 0.5)).toBe("#1C1C21");
    expect(mixHex("bogus", "#358366", 0.5)).toBe("bogus");
  });
});
