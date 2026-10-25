import {
  STREAK_FLAME_ASSETS,
  resolveStreakFlameSource,
} from "../streakFlameAssets";
import { getHabitStreakStage } from "../habitStreakStage";

/**
 * Deliberately does NOT mock the asset registry — this suite is the only place
 * that proves the five real GIF files are registered and resolvable, and that
 * each stage points at a *different* file (a copy-paste slip here would silently
 * show the wrong flame for a stage).
 */
describe("streakFlameAssets", () => {
  it("resolves real artwork for every active stage", () => {
    for (const stage of [1, 2, 3, 4, 5] as const) {
      expect(resolveStreakFlameSource(stage)).toBeTruthy();
    }
  });

  it("has no artwork for the inactive stage", () => {
    expect(resolveStreakFlameSource(0)).toBeNull();
    expect(STREAK_FLAME_ASSETS[0]).toBeNull();
  });

  it("registers a distinct file per stage", () => {
    const resolved = [1, 2, 3, 4, 5].map((stage) =>
      JSON.stringify(resolveStreakFlameSource(stage as 1 | 2 | 3 | 4 | 5)),
    );
    expect(new Set(resolved).size).toBe(5);
  });

  it("maps streak lengths onto the registered stages", () => {
    // The ladder the product specified, end to end through both helpers.
    expect(resolveStreakFlameSource(getHabitStreakStage(0))).toBeNull();
    for (const [streak, stage] of [
      [1, 1],
      [2, 1],
      [3, 2],
      [6, 2],
      [7, 3],
      [13, 3],
      [14, 4],
      [29, 4],
      [30, 5],
      [365, 5],
    ] as const) {
      expect(getHabitStreakStage(streak)).toBe(stage);
      expect(resolveStreakFlameSource(stage)).toBeTruthy();
    }
  });
});
