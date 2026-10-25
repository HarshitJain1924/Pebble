import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  earnPebble,
  reversePebbleReward,
  getPebbleCounts,
  getGemsBalance,
  PEBBLE_LOG_KEY,
} from "@/features/profile/services/pebble.service";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockImplementation(async (key) => mockStore[key] || null),
  setItem: jest.fn().mockImplementation(async (key, value) => {
    mockStore[key] = String(value);
    return null;
  }),
  removeItem: jest.fn().mockImplementation(async (key) => {
    delete mockStore[key];
    return null;
  }),
  clear: jest.fn().mockImplementation(async () => {
    mockStore = {};
    return null;
  }),
}));

describe("First Pebble of the Day Crow Animation Trigger & Ledger", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  // Helper simulating MascotOverlay's trigger evaluation logic
  function shouldTriggerCrowDrop(
    prevLifetime: number,
    pebbleStats: { lifetime: number; today?: number },
  ): boolean {
    const newLifetime = pebbleStats.lifetime || 0;
    if (newLifetime <= prevLifetime) return false;
    const isFirstPebbleToday = (pebbleStats.today || 0) === 1;
    return isFirstPebbleToday;
  }

  it("triggers animation on first task completion today, but not on second task completion today", async () => {
    let lifetimeRef = 0;

    // First task completion today
    await earnPebble("task", "task-1");
    let stats = await getPebbleCounts();
    expect(stats.today).toBe(1);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(true);
    lifetimeRef = stats.lifetime;

    // Second task completion today
    await earnPebble("task", "task-2");
    stats = await getPebbleCounts();
    expect(stats.today).toBe(2);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(false);
    lifetimeRef = stats.lifetime;
  });

  it("triggers animation on first task completion on a new calendar day", async () => {
    let lifetimeRef = 0;

    // Day 1: complete task
    await earnPebble("task", "task-day1");
    let stats = await getPebbleCounts();
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(true);
    lifetimeRef = stats.lifetime;

    // Day 2: simulate entry on a previous day by backdating task-day1 in mockStore
    const dayMs = 24 * 60 * 60 * 1000;
    const yesterday = Date.now() - dayMs;
    const log = [{ type: "task", timestamp: yesterday, rewardId: "task-day1" }];
    await AsyncStorage.setItem(PEBBLE_LOG_KEY, JSON.stringify(log));

    // Reset lifetime ref for day 2 start
    lifetimeRef = 1;

    // Day 2 first task completion
    await earnPebble("task", "task-day2");
    stats = await getPebbleCounts();
    expect(stats.today).toBe(1);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(true);
  });

  it("does not trigger animation on task unchecking, and handles rechecking correctly", async () => {
    let lifetimeRef = 0;

    // Task 1 completion today -> triggers animation
    await earnPebble("task", "task-1");
    let stats = await getPebbleCounts();
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(true);
    lifetimeRef = stats.lifetime; // lifetimeRef = 1

    // Task 2 completion today -> no animation
    await earnPebble("task", "task-2");
    stats = await getPebbleCounts();
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(false);
    lifetimeRef = stats.lifetime; // lifetimeRef = 2

    // Uncheck Task 2 -> reversal occurs, no animation (lifetime decreased)
    await reversePebbleReward("task-2");
    stats = await getPebbleCounts();
    expect(stats.today).toBe(1);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(false);
    lifetimeRef = stats.lifetime; // lifetimeRef = 1

    // Recheck Task 2 -> today becomes 2, no animation
    await earnPebble("task", "task-2");
    stats = await getPebbleCounts();
    expect(stats.today).toBe(2);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(false);
    lifetimeRef = stats.lifetime; // lifetimeRef = 2

    // Uncheck Task 2 again
    await reversePebbleReward("task-2");
    stats = await getPebbleCounts();
    lifetimeRef = stats.lifetime; // lifetimeRef = 1

    // Uncheck Task 1 -> daily bonus gem rolled back, today becomes 0
    await reversePebbleReward("task-1");
    stats = await getPebbleCounts();
    expect(stats.today).toBe(0);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(false);
    lifetimeRef = stats.lifetime; // lifetimeRef = 0

    // Recheck Task 1 (now first task of day again) -> triggers animation
    await earnPebble("task", "task-1");
    stats = await getPebbleCounts();
    expect(stats.today).toBe(1);
    expect(shouldTriggerCrowDrop(lifetimeRef, stats)).toBe(true);
  });
});
