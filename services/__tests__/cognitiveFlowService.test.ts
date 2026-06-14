import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCognitiveFlowStats, getOptimalHours } from "../cognitiveFlowService";
import { DAILY_STORAGE_KEY, TODOS_STORAGE_KEY } from "../storage";

let mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => {
  return {
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
  };
});

describe("cognitiveFlowService tests", () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it("should return balanced flow stats when no tasks/habits exist", async () => {
    const stats = await getCognitiveFlowStats();
    expect(stats.peakZone).toBe("Balanced Flow");
    expect(stats.icon).toBe("activity");
    expect(stats.morningPct).toBe(0);
    expect(stats.afternoonPct).toBe(0);
    expect(stats.eveningPct).toBe(0);

    const hours = await getOptimalHours();
    expect(hours).toEqual([9, 10, 14, 15]);
  });

  it("should return Morning Focus Peak when morning tasks dominate", async () => {
    const mockTodos = {
      todos: {
        default: [
          { id: "1", title: "Morning Task 1", completed: false, alarmTime: new Date(2026, 5, 9, 8, 30).getTime() },
          { id: "2", title: "Morning Task 2", completed: false, reminderHour: 9 },
          { id: "3", title: "Evening Task", completed: false, reminderHour: 18 },
        ]
      }
    };
    const mockHabits = {
      dailyHabits: [
        { id: "h1", title: "Morning Habit", reminderHour: 7 },
      ]
    };

    mockStore[TODOS_STORAGE_KEY] = JSON.stringify(mockTodos);
    mockStore[DAILY_STORAGE_KEY] = JSON.stringify(mockHabits);

    const stats = await getCognitiveFlowStats();
    expect(stats.peakZone).toBe("Morning Focus Peak");
    expect(stats.icon).toBe("sun");
    expect(stats.morningPct).toBe(75); // 3 morning vs 1 evening = 75%
    expect(stats.eveningPct).toBe(25);

    const hours = await getOptimalHours();
    expect(hours).toEqual([8, 9, 10, 11]);
  });

  it("should return Afternoon Steady Flow when afternoon tasks dominate", async () => {
    const mockTodos = {
      todos: {
        default: [
          { id: "1", title: "Afternoon Task 1", completed: false, reminderHour: 13 },
          { id: "2", title: "Afternoon Task 2", completed: false, reminderHour: 15 },
        ]
      }
    };
    mockStore[TODOS_STORAGE_KEY] = JSON.stringify(mockTodos);

    const stats = await getCognitiveFlowStats();
    expect(stats.peakZone).toBe("Afternoon Steady Flow");
    expect(stats.icon).toBe("award");

    const hours = await getOptimalHours();
    expect(hours).toEqual([13, 14, 15, 16]);
  });

  it("should return Night Owl Momentum when evening tasks dominate", async () => {
    const mockTodos = {
      todos: {
        default: [
          { id: "1", title: "Evening Task 1", completed: false, reminderHour: 19 },
          { id: "2", title: "Evening Task 2", completed: false, reminderHour: 20 },
        ]
      }
    };
    mockStore[TODOS_STORAGE_KEY] = JSON.stringify(mockTodos);

    const stats = await getCognitiveFlowStats();
    expect(stats.peakZone).toBe("Night Owl Momentum");
    expect(stats.icon).toBe("moon");

    const hours = await getOptimalHours();
    expect(hours).toEqual([18, 19, 20, 21]);
  });
});
