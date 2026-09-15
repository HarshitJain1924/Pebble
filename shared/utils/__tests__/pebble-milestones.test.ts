import {
  getMilestoneInfo,
  getPebbleStage,
  getPebblesToNextStage,
  MAX_PEBBLE_STAGE,
  PEBBLE_MILESTONES,
  PEBBLE_STAGE_THRESHOLDS,
  calculateJarWaterFill,
  calculateVisiblePebbleCount,
} from "../pebble-milestones";

describe("pebble-milestones", () => {
  describe("canonical thresholds", () => {
    it("exposes the canonical threshold ladder", () => {
      expect([...PEBBLE_STAGE_THRESHOLDS]).toEqual([10, 25, 50, 100, 250, 500]);
    });

    it("defines one milestone per stage plus the final stage", () => {
      expect(PEBBLE_MILESTONES).toHaveLength(7);
      expect(MAX_PEBBLE_STAGE).toBe(7);
      PEBBLE_MILESTONES.forEach((milestone, i) => {
        expect(milestone.stage).toBe(i + 1);
        expect(milestone.name.length).toBeGreaterThan(0);
        expect(milestone.range.length).toBeGreaterThan(0);
        expect(milestone.desc.length).toBeGreaterThan(0);
      });
    });
  });

  describe("stage selection boundaries", () => {
    const cases: [number, number][] = [
      [0, 1],
      [1, 1],
      [9, 1],
      [10, 1],
      [24, 1],
      [25, 2],
      [49, 2],
      [50, 3],
      [99, 3],
      [100, 4],
      [249, 4],
      [250, 5],
      [499, 5],
      [500, 6],
      [501, 7],
      [9999, 7],
    ];

    it.each(cases)("count %i resolves to stage %i", (count, stage) => {
      expect(getPebbleStage(count)).toBe(stage);
      expect(getMilestoneInfo(count).stage).toBe(stage);
    });

    it("treats invalid counts as zero", () => {
      expect(getPebbleStage(-5)).toBe(1);
      expect(getPebbleStage(Number.NaN)).toBe(1);
      expect(getMilestoneInfo(-5).remaining).toBe(10);
    });

    it("floors fractional counts", () => {
      expect(getMilestoneInfo(10.9).stage).toBe(1);
      expect(getMilestoneInfo(11.2).stage).toBe(1);
    });
  });

  describe("next milestone + remaining", () => {
    it("points at the next stage and its threshold", () => {
      const info = getMilestoneInfo(4);
      expect(info.nextStage).toBe(1);
      expect(info.nextStageName).toBe("Beginning");
      expect(info.nextThreshold).toBe(10);
      expect(info.remaining).toBe(6);
      expect(info.nextUnlock).toBe("Beginning Jar Nest");
    });

    it("activates a chapter at each exact threshold", () => {
      expect(getMilestoneInfo(9).isPrelude).toBe(true);
      expect(getMilestoneInfo(10)).toMatchObject({
        stage: 1,
        name: "Beginning",
        isPrelude: false,
      });
      expect(getMilestoneInfo(25)).toMatchObject({
        stage: 2,
        name: "Growth",
        isPrelude: false,
      });
      expect(getMilestoneInfo(500)).toMatchObject({
        stage: 6,
        name: "Peak",
        isPrelude: false,
      });
      expect(getMilestoneInfo(501)).toMatchObject({
        stage: 7,
        name: "Beyond",
        isMaxStage: true,
      });
    });

    it("uses the canonical threshold, not a duplicated list", () => {
      // nextThreshold is the count that unlocks the next chapter.
      expect(getMilestoneInfo(25).nextThreshold).toBe(50);
      expect(getMilestoneInfo(50).nextThreshold).toBe(100);
      expect(getMilestoneInfo(100).nextThreshold).toBe(250);
      expect(getMilestoneInfo(250).nextThreshold).toBe(500);
      expect(getMilestoneInfo(100).nextUnlock).toBe("Golden Jar & sparks");
      expect(getMilestoneInfo(250).nextUnlock).toBeNull();
    });

    it("has no next milestone at the final stage", () => {
      const info = getMilestoneInfo(900);
      expect(info.isMaxStage).toBe(true);
      expect(info.nextStage).toBeNull();
      expect(info.nextThreshold).toBeNull();
      expect(info.nextUnlock).toBeNull();
      expect(info.remaining).toBe(0);
      expect(info.progressRatio).toBe(1);
      expect(getPebblesToNextStage(900)).toBe(0);
    });
  });

  describe("progress", () => {
    it("measures fill inside the current stage band", () => {
      // Chapter 1 spans 10-24; its progress begins at the chapter's
      // threshold and runs until Chapter 2 unlocks at 25.
      const info = getMilestoneInfo(18);
      expect(info.stageSpan).toBe(15);
      expect(info.progressInStage).toBe(8);
      expect(info.progressRatio).toBeCloseTo(8 / 15, 5);
    });

    it("is zero only at the very start of the ladder", () => {
      expect(getMilestoneInfo(0).progressRatio).toBe(0);
      expect(getMilestoneInfo(0).progressInStage).toBe(0);
    });

    it("never exceeds a full band", () => {
      expect(getMilestoneInfo(10).progressRatio).toBe(0);
      expect(getMilestoneInfo(25).progressRatio).toBe(0);
      expect(getMilestoneInfo(500).progressRatio).toBe(0);
      expect(getMilestoneInfo(501).progressRatio).toBe(1);
    });
  });

  describe("canonical chapter copy", () => {
    it("uses the Storybook chapter names and existing bands", () => {
      expect(PEBBLE_MILESTONES.map((m) => m.name)).toEqual([
        "Beginning",
        "Growth",
        "Flow",
        "Home",
        "Collection",
        "Peak",
        "Beyond",
      ]);
      expect(PEBBLE_MILESTONES.map((m) => m.range)).toEqual([
        "10-24",
        "25-49",
        "50-99",
        "100-249",
        "250-499",
        "500",
        "501+",
      ]);
      expect(getMilestoneInfo(30).range).toBe("25-49");
      expect(getMilestoneInfo(30).desc).toBe(
        "A small base of habit stones.",
      );
    });

    it.each([
      [9, "Beginning"],
      [10, "Beginning"],
      [24, "Beginning"],
      [25, "Growth"],
      [49, "Growth"],
      [50, "Flow"],
      [99, "Flow"],
      [100, "Home"],
      [249, "Home"],
      [250, "Collection"],
      [499, "Collection"],
      [500, "Peak"],
      [500, "Peak"],
      [501, "Beyond"],
    ])("maps %i Pebbles to chapter %s", (count, name) => {
      expect(getMilestoneInfo(count).name).toBe(name);
    });
  });

  describe("calculateJarWaterFill", () => {
    const requiredCounts = [0, 1, 9, 10, 25, 50, 100, 101, 250, 499, 500, 501, 1000];

    it.each(requiredCounts)("evaluates required count %i within safe bounds", (count) => {
      const fill = calculateJarWaterFill(count);
      expect(fill).toBeGreaterThanOrEqual(0.08);
      expect(fill).toBeLessThanOrEqual(0.94);
      expect(Number.isFinite(fill)).toBe(true);
    });

    it("evaluates exact threshold values", () => {
      expect(calculateJarWaterFill(0)).toBeCloseTo(0.08, 4);
      expect(calculateJarWaterFill(10)).toBeCloseTo(0.20, 4);
      expect(calculateJarWaterFill(25)).toBeCloseTo(0.35, 4);
      expect(calculateJarWaterFill(50)).toBeCloseTo(0.50, 4);
      expect(calculateJarWaterFill(100)).toBeCloseTo(0.65, 4);
      expect(calculateJarWaterFill(250)).toBeCloseTo(0.80, 4);
      expect(calculateJarWaterFill(500)).toBeCloseTo(0.90, 4);
      expect(calculateJarWaterFill(1000)).toBeCloseTo(0.94, 4);
    });

    it("is strictly monotonic as Pebble count increases", () => {
      for (let i = 0; i < requiredCounts.length - 1; i++) {
        const prev = calculateJarWaterFill(requiredCounts[i]);
        const next = calculateJarWaterFill(requiredCounts[i + 1]);
        expect(next).toBeGreaterThan(prev);
      }
    });

    it("safely handles 0, negative, and non-finite counts without NaN", () => {
      expect(calculateJarWaterFill(0)).toBe(0.08);
      expect(calculateJarWaterFill(-10)).toBe(0.08);
      expect(calculateJarWaterFill(NaN)).toBe(0.08);
      expect(calculateJarWaterFill(Infinity)).toBe(0.08);
    });

    it("never exceeds the safe visual maximum even for huge counts", () => {
      expect(calculateJarWaterFill(5000)).toBe(0.94);
      expect(calculateJarWaterFill(100000)).toBe(0.94);
    });
  });

  describe("calculateVisiblePebbleCount", () => {
    const requiredCounts = [0, 1, 9, 10, 25, 50, 100, 101, 250, 499, 500, 501, 1000];

    it.each(requiredCounts)("produces an integer between 0 and 50 for count %i", (count) => {
      const visible = calculateVisiblePebbleCount(count);
      expect(Number.isInteger(visible)).toBe(true);
      expect(visible).toBeGreaterThanOrEqual(0);
      expect(visible).toBeLessThanOrEqual(50);
    });

    it("is non-decreasing (monotonic) across all counts", () => {
      for (let i = 0; i < requiredCounts.length - 1; i++) {
        const prev = calculateVisiblePebbleCount(requiredCounts[i]);
        const next = calculateVisiblePebbleCount(requiredCounts[i + 1]);
        expect(next).toBeGreaterThanOrEqual(prev);
      }
    });

    it("visibly accumulates past 50 and 100 rather than freezing", () => {
      const at50 = calculateVisiblePebbleCount(50);
      const at100 = calculateVisiblePebbleCount(100);
      const at250 = calculateVisiblePebbleCount(250);
      const at500 = calculateVisiblePebbleCount(500);

      expect(at100).toBeGreaterThan(at50);
      expect(at250).toBeGreaterThan(at100);
      expect(at500).toBeGreaterThan(at250);
      expect(at500).toBe(50);
    });

    it("safely handles 0, negative, and non-finite counts", () => {
      expect(calculateVisiblePebbleCount(0)).toBe(0);
      expect(calculateVisiblePebbleCount(-5)).toBe(0);
      expect(calculateVisiblePebbleCount(NaN)).toBe(0);
      expect(calculateVisiblePebbleCount(Infinity)).toBe(0);
    });
  });
});
