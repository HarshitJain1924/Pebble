import {
  getMilestoneInfo,
  getPebbleStage,
  getPebblesToNextStage,
  MAX_PEBBLE_STAGE,
  PEBBLE_MILESTONES,
  PEBBLE_STAGE_THRESHOLDS,
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
      [11, 2],
      [25, 2],
      [26, 3],
      [50, 3],
      [51, 4],
      [100, 4],
      [101, 5],
      [250, 5],
      [251, 6],
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
      expect(getMilestoneInfo(11.2).stage).toBe(2);
    });
  });

  describe("next milestone + remaining", () => {
    it("points at the next stage and its threshold", () => {
      const info = getMilestoneInfo(4);
      expect(info.nextStage).toBe(2);
      expect(info.nextStageName).toBe("Sprout");
      expect(info.nextThreshold).toBe(10);
      expect(info.remaining).toBe(6);
      expect(info.nextUnlock).toBe("Sprout Jar Nest");
    });

    it("reports zero remaining at an exact threshold", () => {
      expect(getMilestoneInfo(10).remaining).toBe(0);
      expect(getMilestoneInfo(25).remaining).toBe(0);
      expect(getMilestoneInfo(500).remaining).toBe(0);
    });

    it("uses the canonical threshold, not a duplicated list", () => {
      // nextThreshold is the count that COMPLETES the current stage, so it
      // always equals the stage's own canonical threshold.
      expect(getMilestoneInfo(26).nextThreshold).toBe(50);
      expect(getMilestoneInfo(51).nextThreshold).toBe(100);
      expect(getMilestoneInfo(101).nextThreshold).toBe(250);
      expect(getMilestoneInfo(251).nextThreshold).toBe(500);
      expect(getMilestoneInfo(100).nextUnlock).toBe(
        "Crowned Mascot & sparkles",
      );
      expect(getMilestoneInfo(250).nextUnlock).toBe("Golden Jar & sparks");
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
      // Stage 2 spans 11-25; the band baseline is stage 1's threshold (10),
      // matching the historical progress calculation exactly.
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
      expect(getMilestoneInfo(10).progressRatio).toBe(1);
      expect(getMilestoneInfo(25).progressRatio).toBe(1);
      expect(getMilestoneInfo(500).progressRatio).toBe(1);
    });
  });

  describe("canonical stage copy", () => {
    it("preserves the existing stage names and bands", () => {
      expect(PEBBLE_MILESTONES.map((m) => m.name)).toEqual([
        "First Steps",
        "Sprout",
        "Zen Stream",
        "Sanctuary Base",
        "Pebble Hoarder",
        "Zen Mountain",
        "Ocean of Focus",
      ]);
      expect(getMilestoneInfo(30).range).toBe("26-50");
      expect(getMilestoneInfo(30).desc).toBe(
        "Flowing stream of productivity.",
      );
    });
  });
});
