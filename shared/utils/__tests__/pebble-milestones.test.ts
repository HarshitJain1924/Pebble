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
  const ALL_TEST_COUNTS = [
    0,
    1,
    9,
    10,
    11,
    24,
    25,
    26,
    49,
    50,
    51,
    99,
    100,
    101,
    249,
    250,
    251,
    499,
    500,
    501,
    1000,
    5000,
    10000,
    1000000,
  ];

  describe("canonical thresholds", () => {
    it("exposes the canonical threshold ladder", () => {
      expect([...PEBBLE_STAGE_THRESHOLDS]).toEqual([
        10, 25, 50, 100, 250, 500, 1000,
      ]);
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
      [11, 1],
      [24, 1],
      [25, 2],
      [26, 2],
      [49, 2],
      [50, 3],
      [51, 3],
      [99, 3],
      [100, 4],
      [101, 4],
      [249, 4],
      [250, 5],
      [251, 5],
      [499, 5],
      [500, 6],
      [501, 6],
      [999, 6],
      [1000, 7],
      [5000, 7],
      [10000, 7],
      [1000000, 7],
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
    it("points at the next stage and its threshold during prelude", () => {
      const info = getMilestoneInfo(4);
      expect(info.isPrelude).toBe(true);
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
        isMaxStage: false,
      });
      expect(getMilestoneInfo(25)).toMatchObject({
        stage: 2,
        name: "Growth",
        isPrelude: false,
        isMaxStage: false,
      });
      expect(getMilestoneInfo(500)).toMatchObject({
        stage: 6,
        name: "Peak",
        isPrelude: false,
        isMaxStage: false,
      });
      expect(getMilestoneInfo(501)).toMatchObject({
        stage: 6,
        name: "Peak",
        isPrelude: false,
        isMaxStage: false,
      });
      expect(getMilestoneInfo(1000)).toMatchObject({
        stage: 7,
        name: "Beyond",
        isPrelude: false,
        isMaxStage: true,
      });
    });

    it("uses canonical thresholds and unlocks across all stages", () => {
      expect(getMilestoneInfo(10).nextThreshold).toBe(25);
      expect(getMilestoneInfo(10).nextUnlock).toBe("Curious Mascot grows");

      expect(getMilestoneInfo(25).nextThreshold).toBe(50);
      expect(getMilestoneInfo(25).nextUnlock).toBe("Zen Energy floats");

      expect(getMilestoneInfo(50).nextThreshold).toBe(100);
      expect(getMilestoneInfo(50).nextUnlock).toBe("Crowned Mascot & sparkles");

      expect(getMilestoneInfo(100).nextThreshold).toBe(250);
      expect(getMilestoneInfo(100).nextUnlock).toBe("Golden Jar & sparks");

      expect(getMilestoneInfo(250).nextThreshold).toBe(500);
      expect(getMilestoneInfo(250).nextUnlock).toBe("Sanctuary Mastery");

      expect(getMilestoneInfo(500).nextThreshold).toBe(1000);
      expect(getMilestoneInfo(500).nextUnlock).toBeNull();
    });

    it("correctly models 500 and 501+ behavior", () => {
      const at500 = getMilestoneInfo(500);
      expect(at500.stage).toBe(6);
      expect(at500.name).toBe("Peak");
      expect(at500.isMaxStage).toBe(false);
      expect(at500.progressInStage).toBe(0);
      expect(at500.stageSpan).toBe(500);
      expect(at500.progressRatio).toBe(0);
      expect(at500.remaining).toBe(500);

      const at501 = getMilestoneInfo(501);
      expect(at501.stage).toBe(6);
      expect(at501.name).toBe("Peak");
      expect(at501.isMaxStage).toBe(false);
      expect(at501.progressInStage).toBe(1);
      expect(at501.stageSpan).toBe(500);
      expect(at501.progressRatio).toBeCloseTo(1 / 500, 5);
      expect(at501.remaining).toBe(499);
    });

    it("has no next milestone at the final stage (1000+)", () => {
      const info = getMilestoneInfo(1000);
      expect(info.isMaxStage).toBe(true);
      expect(info.nextStage).toBeNull();
      expect(info.nextThreshold).toBeNull();
      expect(info.nextUnlock).toBeNull();
      expect(info.remaining).toBe(0);
      expect(info.progressRatio).toBe(1);
      expect(getPebblesToNextStage(1000)).toBe(0);

      const huge = getMilestoneInfo(1000000);
      expect(huge.isMaxStage).toBe(true);
      expect(huge.remaining).toBe(0);
      expect(huge.progressRatio).toBe(1);
    });
  });

  describe("progress", () => {
    it("measures fill inside the current stage band", () => {
      // Chapter 1 spans 10-24; threshold=10, next=25, span=15.
      const info = getMilestoneInfo(18);
      expect(info.stageSpan).toBe(15);
      expect(info.progressInStage).toBe(8);
      expect(info.progressRatio).toBeCloseTo(8 / 15, 5);
    });

    it("is zero only at the very start of each ladder band", () => {
      expect(getMilestoneInfo(0).progressRatio).toBe(0);
      expect(getMilestoneInfo(0).progressInStage).toBe(0);
      expect(getMilestoneInfo(10).progressRatio).toBe(0);
      expect(getMilestoneInfo(25).progressRatio).toBe(0);
      expect(getMilestoneInfo(50).progressRatio).toBe(0);
      expect(getMilestoneInfo(100).progressRatio).toBe(0);
      expect(getMilestoneInfo(250).progressRatio).toBe(0);
      expect(getMilestoneInfo(500).progressRatio).toBe(0);
    });

    it("is 1 at the max stage", () => {
      expect(getMilestoneInfo(1000).progressRatio).toBe(1);
      expect(getMilestoneInfo(5000).progressRatio).toBe(1);
    });
  });

  describe("canonical chapter copy", () => {
    it("uses the Storybook chapter names and canonical bands", () => {
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
        "500-999",
        "1000+",
      ]);
      expect(getMilestoneInfo(30).range).toBe("25-49");
      expect(getMilestoneInfo(30).desc).toBe(
        "A small base of habit stones.",
      );
      expect(getMilestoneInfo(750).name).toBe("Peak");
      expect(getMilestoneInfo(750).range).toBe("500-999");
      expect(getMilestoneInfo(1500).name).toBe("Beyond");
      expect(getMilestoneInfo(1500).range).toBe("1000+");
    });
  });

  describe("calculateJarWaterFill", () => {
    it.each(ALL_TEST_COUNTS)(
      "evaluates required count %i within safe bounds [0.08, 0.94]",
      (count) => {
        const fill = calculateJarWaterFill(count);
        expect(fill).toBeGreaterThanOrEqual(0.08);
        expect(fill).toBeLessThanOrEqual(0.94);
        expect(Number.isFinite(fill)).toBe(true);
      },
    );

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

    it("is strictly monotonic as Pebble count increases from 0 to 1000", () => {
      const countsUpTo1000 = ALL_TEST_COUNTS.filter((c) => c <= 1000);
      for (let i = 0; i < countsUpTo1000.length - 1; i++) {
        const prev = calculateJarWaterFill(countsUpTo1000[i]);
        const next = calculateJarWaterFill(countsUpTo1000[i + 1]);
        expect(next).toBeGreaterThan(prev);
      }
    });

    it("is non-decreasing across all counts including very large counts", () => {
      for (let i = 0; i < ALL_TEST_COUNTS.length - 1; i++) {
        const prev = calculateJarWaterFill(ALL_TEST_COUNTS[i]);
        const next = calculateJarWaterFill(ALL_TEST_COUNTS[i + 1]);
        expect(next).toBeGreaterThanOrEqual(prev);
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
      expect(calculateJarWaterFill(10000)).toBe(0.94);
      expect(calculateJarWaterFill(1000000)).toBe(0.94);
    });
  });

  describe("calculateVisiblePebbleCount", () => {
    it.each(ALL_TEST_COUNTS)(
      "produces an integer between 0 and 50 for count %i",
      (count) => {
        const visible = calculateVisiblePebbleCount(count);
        expect(Number.isInteger(visible)).toBe(true);
        expect(visible).toBeGreaterThanOrEqual(0);
        expect(visible).toBeLessThanOrEqual(50);
      },
    );

    it("is non-decreasing (monotonic) across all 24 required counts", () => {
      for (let i = 0; i < ALL_TEST_COUNTS.length - 1; i++) {
        const prev = calculateVisiblePebbleCount(ALL_TEST_COUNTS[i]);
        const next = calculateVisiblePebbleCount(ALL_TEST_COUNTS[i + 1]);
        expect(next).toBeGreaterThanOrEqual(prev);
      }
    });

    it("visibly accumulates past 50, 100, and 250 reaching 50 at 500", () => {
      const at50 = calculateVisiblePebbleCount(50);
      const at100 = calculateVisiblePebbleCount(100);
      const at250 = calculateVisiblePebbleCount(250);
      const at500 = calculateVisiblePebbleCount(500);
      const at501 = calculateVisiblePebbleCount(501);
      const at1000 = calculateVisiblePebbleCount(1000);

      expect(at100).toBeGreaterThan(at50);
      expect(at250).toBeGreaterThan(at100);
      expect(at500).toBeGreaterThan(at250);
      expect(at500).toBe(50);
      expect(at501).toBe(50);
      expect(at1000).toBe(50);
    });

    it("safely handles 0, negative, and non-finite counts", () => {
      expect(calculateVisiblePebbleCount(0)).toBe(0);
      expect(calculateVisiblePebbleCount(-5)).toBe(0);
      expect(calculateVisiblePebbleCount(NaN)).toBe(0);
      expect(calculateVisiblePebbleCount(Infinity)).toBe(0);
    });
  });
});
