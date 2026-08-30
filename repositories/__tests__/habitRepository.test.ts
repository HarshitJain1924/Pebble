import { HabitRepository } from "../HabitRepository";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Habit } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("HabitRepository Field Preservation", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("preserves recurrenceExceptions during full AsyncStorage roundtrip", async () => {
    const wsId = "test-workspace";
    const initialHabit: Habit = {
      id: "test-habit",
      title: "Initial Title",
      workspaceId: wsId,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      recurrenceExceptions: ["2026-08-19", "2026-08-20"],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Save Habit
    await HabitRepository.saveHabit(initialHabit);

    // 2. Load it through HabitRepository
    let habits = await HabitRepository.getHabits(wsId);
    let loadedHabit = habits["test-habit"];
    
    expect(loadedHabit).toBeDefined();
    expect(loadedHabit.recurrenceExceptions).toEqual(["2026-08-19", "2026-08-20"]);

    // 3. Modify unrelated field
    loadedHabit.title = "Updated Title";

    // 4. Save modified Habit
    await HabitRepository.saveHabit(loadedHabit);

    // 5. Load it again
    habits = await HabitRepository.getHabits(wsId);
    loadedHabit = habits["test-habit"];

    // 6. Assert recurrenceExceptions unchanged
    expect(loadedHabit.recurrenceExceptions).toEqual(["2026-08-19", "2026-08-20"]);
    
    // 7. Assert unrelated field changed
    expect(loadedHabit.title).toBe("Updated Title");
  });

  it("preserves schedule during full AsyncStorage roundtrip", async () => {
    const wsId = "test-workspace";
    const initialHabit: Habit = {
      id: "test-habit-schedule",
      title: "run 5km every evening",
      workspaceId: wsId,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      schedule: { startTime: "18:00" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(initialHabit);

    let habits = await HabitRepository.getHabits(wsId);
    let loadedHabit = habits["test-habit-schedule"];
    
    expect(loadedHabit).toBeDefined();
    expect(loadedHabit.schedule).toEqual({ startTime: "18:00" });

    // Modify unrelated field
    loadedHabit.title = "Updated Title";

    await HabitRepository.saveHabit(loadedHabit);

    habits = await HabitRepository.getHabits(wsId);
    loadedHabit = habits["test-habit-schedule"];

    expect(loadedHabit.schedule).toEqual({ startTime: "18:00" });
    expect(loadedHabit.title).toBe("Updated Title");
  });

  it("remains valid for a Habit without a schedule", async () => {
    const wsId = "test-workspace";
    const initialHabit: Habit = {
      id: "test-habit-no-schedule",
      title: "No Schedule Habit",
      workspaceId: wsId,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(initialHabit);
    const habits = await HabitRepository.getHabits(wsId);
    const loadedHabit = habits["test-habit-no-schedule"];
    
    expect(loadedHabit).toBeDefined();
    expect(loadedHabit.schedule).toBeUndefined();
  });

  it("reminder.triggerAt remains independent from schedule.startTime", async () => {
    const wsId = "test-workspace";
    const initialHabit: Habit = {
      id: "test-habit-reminder",
      title: "Reminder Habit",
      workspaceId: wsId,
      recurrence: { frequency: "daily", interval: 1 },
      completionHistory: [],
      reminder: { enabled: true, triggerAt: 123456789 },
      schedule: { startTime: "18:00" },
      revision: 1,
      lifecycleGeneration: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await HabitRepository.saveHabit(initialHabit);
    const habits = await HabitRepository.getHabits(wsId);
    const loadedHabit = habits["test-habit-reminder"];
    
    expect(loadedHabit).toBeDefined();
    expect(loadedHabit.schedule).toEqual({ startTime: "18:00" });
    expect(loadedHabit.reminder).toEqual({ enabled: true, triggerAt: 123456789 });
  });
});
