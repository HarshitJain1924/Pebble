import { earnPebble, reversePebbleReward, spendGems, getPebbleCounts, PEBBLE_LOG_KEY, GEMS_SPENT_KEY, STREAK_RECOVERIES_KEY, PebbleLogEntry } from "../pebble.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Task, Habit, Checklist } from "@/shared/types/domain.types";
import * as selectors from "@/shared/utils/domain-selectors";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("@/services/events/state-events", () => ({
  emitStateChange: jest.fn(),
}));

jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    recordFocusSession: jest.fn(),
  }
}));

jest.mock("@/shared/utils/domain-selectors", () => {
  const actual = jest.requireActual("@/shared/utils/domain-selectors");
  return {
    ...actual,
    isHabitCompletedToday: jest.fn(),
  };
});

describe("Pebble Economy Core", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Identity-based Reversal", () => {
    it("should remove the exact pebble by rewardId", async () => {
      const mockLog: PebbleLogEntry[] = [
        { type: "task", timestamp: 1000, rewardId: "task:1" },
        { type: "task", timestamp: 2000, rewardId: "task:2" }
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockLog));
      
      await reversePebbleReward("task:1");
      
      const setCall = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect(setCall[0]).toBe(PEBBLE_LOG_KEY);
      const saved = JSON.parse(setCall[1]);
      expect(saved.length).toBe(1);
      expect(saved[0].rewardId).toBe("task:2");
    });
  });

  describe("Streak Recovery", () => {
    it("should spend a gem and record the recovered date without creating a fake focus pebble", async () => {
      const { recoverMainStreak } = require("../pebble.service");
      
      const dayMs = 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      // Mock Date so getOffsetDateKey works properly
      const mockToday = new Date("2023-01-05T12:00:00Z");
      jest.useFakeTimers({ now: mockToday });
      
      // 2023-01-05 is today (0 offset)
      // 2023-01-04 is yesterday (1 offset) -> this is the broken date
      // 2023-01-03 to 2023-01-01 is a 3-day streak (2, 3, 4 offsets)
      
      // Create PEBBLE_LOG_KEY state before recovery
      const initialLog: PebbleLogEntry[] = [
        { type: "task", timestamp: mockToday.getTime() - 2 * dayMs, rewardId: "t1" },
        { type: "task", timestamp: mockToday.getTime() - 3 * dayMs, rewardId: "t2" },
        { type: "task", timestamp: mockToday.getTime() - 4 * dayMs, rewardId: "t3" },
      ];
      
      let store: Record<string, string> = {
        [PEBBLE_LOG_KEY]: JSON.stringify(initialLog),
        "todoapp:gems_bonus": "1", // 1 Gem available
        [GEMS_SPENT_KEY]: "0",
        [STREAK_RECOVERIES_KEY]: "[]",
      };

      (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => store[key] || null);
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, val: string) => {
        store[key] = val;
      });

      // 4. Call recoverMainStreak()
      const success = await recoverMainStreak();
      
      // 5. Verify recovery succeeds
      expect(success).toBe(true);
      
      // 6. Verify exactly 1 Gem was consumed
      expect(store[GEMS_SPENT_KEY]).toBe("1");
      
      // 7. Verify STREAK_RECOVERIES_KEY contains the recovered date ("2023-01-04")
      const recoveries = JSON.parse(store[STREAK_RECOVERIES_KEY] || "[]");
      expect(recoveries).toContain("2023-01-04");
      
      // 8 & 9 & 10. Verify PEBBLE_LOG_KEY is IDENTICAL in Pebble count before vs after recovery
      const finalLog = JSON.parse(store[PEBBLE_LOG_KEY] || "[]");
      expect(finalLog.length).toBe(3); // Lifetime pebbles do not increase
      expect(finalLog.filter((p: any) => p.type === "focus").length).toBe(0); // Focus pebble count does not increase
      
      // 11. Call recovery again and verify it cannot recover the same date twice
      const success2 = await recoverMainStreak();
      expect(success2).toBe(false); // Should not be eligible anymore
      
      // Restore Date
      jest.restoreAllMocks();
    });
  });
});
