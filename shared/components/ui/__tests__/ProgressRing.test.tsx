jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import React from "react";
import { create, act } from "react-test-renderer";
import { ProgressRing, getActivePebbleCount } from "../ProgressRing";

describe("getActivePebbleCount", () => {
  describe("Standard percentage progression (count = 24)", () => {
    const COUNT = 24;

    it("returns 0 for 0% progress", () => {
      expect(getActivePebbleCount(0, COUNT)).toBe(0);
    });

    it("returns 6 for 25% progress", () => {
      expect(getActivePebbleCount(0.25, COUNT)).toBe(6);
    });

    it("returns 12 for 50% progress", () => {
      expect(getActivePebbleCount(0.5, COUNT)).toBe(12);
    });

    it("returns 18 for 75% progress", () => {
      expect(getActivePebbleCount(0.75, COUNT)).toBe(18);
    });

    it("returns 24 for 100% progress", () => {
      expect(getActivePebbleCount(1.0, COUNT)).toBe(24);
    });
  });

  describe("Out-of-range progress clamping", () => {
    const COUNT = 24;

    it("clamps negative progress to 0", () => {
      expect(getActivePebbleCount(-0.01, COUNT)).toBe(0);
      expect(getActivePebbleCount(-0.5, COUNT)).toBe(0);
      expect(getActivePebbleCount(-10, COUNT)).toBe(0);
    });

    it("clamps progress > 1 to count", () => {
      expect(getActivePebbleCount(1.01, COUNT)).toBe(COUNT);
      expect(getActivePebbleCount(1.5, COUNT)).toBe(COUNT);
      expect(getActivePebbleCount(100, COUNT)).toBe(COUNT);
    });

    it("never returns a count below 0 or above count", () => {
      const testValues = [-100, -1, 0, 0.33, 0.66, 1, 1.2, 50];
      for (const p of testValues) {
        const result = getActivePebbleCount(p, COUNT);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(COUNT);
      }
    });
  });

  describe("Edge cases for count", () => {
    it("safely handles count = 0", () => {
      expect(getActivePebbleCount(0, 0)).toBe(0);
      expect(getActivePebbleCount(0.5, 0)).toBe(0);
      expect(getActivePebbleCount(1, 0)).toBe(0);
    });

    it("safely handles negative count", () => {
      expect(getActivePebbleCount(0.5, -5)).toBe(0);
      expect(getActivePebbleCount(1, -24)).toBe(0);
    });

    it("safely handles count = 1", () => {
      expect(getActivePebbleCount(0, 1)).toBe(0);
      expect(getActivePebbleCount(0.5, 1)).toBe(0);
      expect(getActivePebbleCount(0.99, 1)).toBe(0);
      expect(getActivePebbleCount(1.0, 1)).toBe(1);
      expect(getActivePebbleCount(1.5, 1)).toBe(1);
    });

    it("safely handles non-finite inputs", () => {
      expect(getActivePebbleCount(NaN, 24)).toBe(0);
      expect(getActivePebbleCount(0.5, NaN)).toBe(0);
      expect(getActivePebbleCount(Infinity, 24)).toBe(24);
      expect(getActivePebbleCount(-Infinity, 24)).toBe(0);
      expect(getActivePebbleCount(0.5, Infinity)).toBe(0);
    });
  });

  describe("Fractional progress around boundaries", () => {
    const COUNT = 24;

    it("evaluates boundary around 6 pebbles (25%)", () => {
      // Just under boundary
      expect(getActivePebbleCount((6 - 0.001) / COUNT, COUNT)).toBe(5);
      // Exact boundary
      expect(getActivePebbleCount(6 / COUNT, COUNT)).toBe(6);
      // Just above boundary
      expect(getActivePebbleCount((6 + 0.001) / COUNT, COUNT)).toBe(6);
    });

    it("evaluates boundary around 12 pebbles (50%)", () => {
      expect(getActivePebbleCount((12 - 0.001) / COUNT, COUNT)).toBe(11);
      expect(getActivePebbleCount(12 / COUNT, COUNT)).toBe(12);
      expect(getActivePebbleCount((12 + 0.001) / COUNT, COUNT)).toBe(12);
    });

    it("evaluates boundary around 18 pebbles (75%)", () => {
      expect(getActivePebbleCount((18 - 0.001) / COUNT, COUNT)).toBe(17);
      expect(getActivePebbleCount(18 / COUNT, COUNT)).toBe(18);
      expect(getActivePebbleCount((18 + 0.001) / COUNT, COUNT)).toBe(18);
    });

    it("evaluates boundary around 24 pebbles (100%)", () => {
      expect(getActivePebbleCount((24 - 0.001) / COUNT, COUNT)).toBe(23);
      expect(getActivePebbleCount(24 / COUNT, COUNT)).toBe(24);
      expect(getActivePebbleCount(1.0, COUNT)).toBe(24);
    });
  });

  describe("Custom pebble counts", () => {
    it("handles count = 12 correctly", () => {
      expect(getActivePebbleCount(0, 12)).toBe(0);
      expect(getActivePebbleCount(0.25, 12)).toBe(3);
      expect(getActivePebbleCount(0.5, 12)).toBe(6);
      expect(getActivePebbleCount(0.75, 12)).toBe(9);
      expect(getActivePebbleCount(1.0, 12)).toBe(12);
    });

    it("handles count = 32 correctly", () => {
      expect(getActivePebbleCount(0, 32)).toBe(0);
      expect(getActivePebbleCount(0.25, 32)).toBe(8);
      expect(getActivePebbleCount(0.5, 32)).toBe(16);
      expect(getActivePebbleCount(0.75, 32)).toBe(24);
      expect(getActivePebbleCount(1.0, 32)).toBe(32);
    });
  });

  describe("ProgressRing Component Rendering", () => {
    it("renders continuous variant correctly", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <ProgressRing progress={0.5} variant="continuous" showText={true} />
        );
      });
      expect(renderer.root).toBeDefined();
    });

    it("renders pebbles variant correctly", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          <ProgressRing progress={0.5} variant="pebbles" showText={false} />
        );
      });
      expect(renderer.root).toBeDefined();
    });
  });
});
