import React from "react";
import { act, create } from "react-test-renderer";
import { useTodayActions } from "@/features/today/hooks/useTodayActions";
import { TaskRepository, HabitRepository } from "@/repositories";
import type { Task, Habit } from "@/shared/types/domain.types";

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

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));

jest.mock("expo-router", () => ({
  useNavigation: () => ({}),
}));

const task = (id: string, workspaceId = "ws-spawn"): Task => ({
  id,
  workspaceId,
  title: `Task ${id}`,
  status: "todo",
  priority: "none",
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

const habit = (id: string, workspaceId = "ws-spawn"): Habit => ({
  id,
  workspaceId,
  title: `Habit ${id}`,
  recurrence: { frequency: "daily", interval: 1 },
  completionHistory: [],
  revision: 1,
  lifecycleGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
});

type FlyingPebble = {
  id: string;
  startX: number;
  startY: number;
  type: "task" | "habit";
};

function makeHarness(allTodos: Task[], allHabits: Habit[]) {
  let flyingPebbles: FlyingPebble[] = [];
  let api: ReturnType<typeof useTodayActions> | undefined;
  let setFlyingPebbles!: (updater: any) => void;

  function Harness() {
    setFlyingPebbles = (updater: any) => {
      flyingPebbles =
        typeof updater === "function" ? updater(flyingPebbles) : updater;
    };
    api = useTodayActions({
      loadDashboardData: jest.fn(async () => undefined),
      showUndo: jest.fn(),
      setFlyingPebbles,
      setAllChecklists: jest.fn(),
      gratitudeText: "",
      setGratitudeText: jest.fn(),
      intentionText: "",
      setIntentionText: jest.fn(),
      setIsReviewModalVisible: jest.fn(),
      allTodos,
      allHabits,
    });
    return null;
  }

  let renderer!: ReturnType<typeof create>;
  const harness = () => {
    act(() => {
      renderer = create(React.createElement(Harness));
    });
  };
  return {
    harness,
    api: () => api!,
    getFlyingPebbles: () => flyingPebbles,
    // Mirrors the screen's handlePebbleAnimationComplete(id): removes only the
    // projectile with the given id.
    removePebble: (id: string) => {
      act(() => {
        setFlyingPebbles((prev: FlyingPebble[]) =>
          prev.filter((p) => p.id !== id),
        );
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

beforeEach(() => {
  mockStore = {};
  jest.clearAllMocks();
});

describe("Today projectile spawning (parent side)", () => {
  test("one eligible task completion creates exactly ONE projectile", async () => {
    await TaskRepository.saveTask(task("task-1"));
    const h = makeHarness([task("task-1")], []);
    h.harness();
    try {
      await act(async () => {
        await h.api().completeTodoFromDashboard("task-1", {
          nativeEvent: { pageX: 100, pageY: 200 },
        });
      });

      const pebbles = h.getFlyingPebbles();
      expect(pebbles).toHaveLength(1);
      expect(pebbles[0].type).toBe("task");
      expect(pebbles[0].startX).toBe(100);
      expect(pebbles[0].startY).toBe(200);
      // Reward is still earned exactly once per completion.
      const balance = await require("@/features/profile/services/pebble.service").getPebbleCounts();
      expect(balance.today).toBe(1);
    } finally {
      h.unmount();
    }
  });

  test("multiple simultaneous completions produce one independent projectile each", async () => {
    await TaskRepository.saveTask(task("task-a"));
    await TaskRepository.saveTask(task("task-b"));
    await HabitRepository.saveHabit(habit("habit-c"));
    const h = makeHarness([task("task-a"), task("task-b")], [habit("habit-c")]);
    h.harness();
    try {
      await act(async () => {
        await h.api().completeTodoFromDashboard("task-a", {
          nativeEvent: { pageX: 10, pageY: 20 },
        });
        await h.api().completeTodoFromDashboard("task-b", {
          nativeEvent: { pageX: 30, pageY: 40 },
        });
        await h.api().completeHabitFromDashboard("habit-c", {
          nativeEvent: { pageX: 50, pageY: 60 },
        });
      });

      const pebbles = h.getFlyingPebbles();
      expect(pebbles).toHaveLength(3);
      // Every projectile has its own id, its own source point, and its own type.
      const ids = new Set(pebbles.map((p) => p.id));
      expect(ids.size).toBe(3);
      expect(pebbles.find((p) => p.type === "task" && p.startX === 10)).toBeDefined();
      expect(pebbles.find((p) => p.type === "task" && p.startX === 30)).toBeDefined();
      expect(pebbles.find((p) => p.type === "habit" && p.startX === 50)).toBeDefined();
      // All three completions earned exactly one reward each.
      const balance = await require("@/features/profile/services/pebble.service").getPebbleCounts();
      expect(balance.today).toBe(3);
    } finally {
      h.unmount();
    }
  });

  test("completing another task while a projectile is flying does not alter the existing projectile", async () => {
    await TaskRepository.saveTask(task("task-a"));
    await TaskRepository.saveTask(task("task-b"));
    const h = makeHarness([task("task-a"), task("task-b")], []);
    h.harness();
    try {
      await act(async () => {
        await h.api().completeTodoFromDashboard("task-a", {
          nativeEvent: { pageX: 10, pageY: 20 },
        });
      });
      const first = h.getFlyingPebbles()[0];

      await act(async () => {
        await h.api().completeTodoFromDashboard("task-b", {
          nativeEvent: { pageX: 30, pageY: 40 },
        });
      });

      const pebbles = h.getFlyingPebbles();
      expect(pebbles).toHaveLength(2);
      // The first projectile is untouched: same id, same source, same type.
      expect(pebbles[0]).toEqual(first);
    } finally {
      h.unmount();
    }
  });

  test("removing one projectile by id leaves the others in flight (self-removal semantics)", async () => {
    await TaskRepository.saveTask(task("task-a"));
    await TaskRepository.saveTask(task("task-b"));
    const h = makeHarness([task("task-a"), task("task-b")], []);
    h.harness();
    try {
      await act(async () => {
        await h.api().completeTodoFromDashboard("task-a", {
          nativeEvent: { pageX: 10, pageY: 20 },
        });
        await h.api().completeTodoFromDashboard("task-b", {
          nativeEvent: { pageX: 30, pageY: 40 },
        });
      });

      const first = h.getFlyingPebbles()[0];
      h.removePebble(first.id);
      const remaining = h.getFlyingPebbles();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).not.toBe(first.id);
    } finally {
      h.unmount();
    }
  });
});
