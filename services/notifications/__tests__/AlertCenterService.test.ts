import { AlertCenterService } from "../AlertCenterService";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Task, Habit, Checklist } from "@/shared/types/domain.types";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));
jest.mock("@/repositories/WorkspaceRepository");
jest.mock("@/repositories/TaskRepository");
jest.mock("@/repositories/HabitRepository");
jest.mock("@/repositories/ChecklistRepository");
jest.mock("@/services/command/EntityCommandService", () => ({
  EntityCommandService: {
    completeTask: jest.fn().mockResolvedValue(undefined),
    completeHabit: jest.fn().mockResolvedValue(undefined),
    updateTask: jest.fn().mockResolvedValue(undefined),
    updateHabit: jest.fn().mockResolvedValue(undefined),
    updateChecklist: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("AlertCenterService Canonical Projection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (WorkspaceRepository.getWorkspaces as jest.Mock).mockResolvedValue([
      { id: "ws-1", name: "Inbox", isDefault: true, revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);
  });

  describe("1. Data Partitioning & Status Calculation", () => {
    it("partitions overdue task into needsAttention group", async () => {
      const now = Date.now();
      const pastTime = now - 2 * 60 * 60 * 1000; // 2 hours ago

      const overdueTask: Task = {
        id: "task-overdue",
        workspaceId: "ws-1",
        title: "Study Kubernetes",
        status: "todo",
        priority: "high",
        categoryId: "work",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: pastTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
        "task-overdue": overdueTask,
      });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.needsAttention.length).toBe(1);
      expect(data.needsAttention[0].entityId).toBe("task-overdue");
      expect(data.needsAttention[0].status).toBe("overdue");
      expect(data.needsAttention[0].entityType).toBe("todo");
      expect(data.upNext.length).toBe(0);
      expect(data.later.length).toBe(0);
    });

    it("partitions upcoming alert within 24 hours into upNext group", async () => {
      const now = Date.now();
      const soonTime = now + 2 * 60 * 60 * 1000; // In 2 hours

      const upcomingTask: Task = {
        id: "task-soon",
        workspaceId: "ws-1",
        title: "Deploy Release",
        status: "todo",
        priority: "medium",
        categoryId: "work",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: soonTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
        "task-soon": upcomingTask,
      });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.upNext.length).toBe(1);
      expect(data.upNext[0].entityId).toBe("task-soon");
      expect(data.needsAttention.length).toBe(0);
      expect(data.later.length).toBe(0);
    });

    it("partitions alert beyond 24 hours into later group", async () => {
      const now = Date.now();
      const futureTime = now + 48 * 60 * 60 * 1000; // In 2 days

      const futureTask: Task = {
        id: "task-later",
        workspaceId: "ws-1",
        title: "Sprint Retrospective",
        status: "todo",
        priority: "low",
        categoryId: "work",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: futureTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({
        "task-later": futureTask,
      });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.later.length).toBe(1);
      expect(data.later[0].entityId).toBe("task-later");
      expect(data.upNext.length).toBe(0);
      expect(data.needsAttention.length).toBe(0);
    });
  });

  describe("2. Checklist Progress Metadata", () => {
    it("projects progress metadata for checklist in Alert Center", async () => {
      const now = Date.now();
      const soonTime = now + 1 * 60 * 60 * 1000;

      const checklist: Checklist = {
        id: "chk-grocery",
        workspaceId: "ws-1",
        title: "Weekly Groceries",
        items: [
          { id: "1", title: "Oat Milk", completed: true },
          { id: "2", title: "Apples", completed: true },
          { id: "3", title: "Spinach", completed: false },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: soonTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
        "chk-grocery": checklist,
      });

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.upNext.length).toBe(1);
      const chkAlert = data.upNext[0];
      expect(chkAlert.entityType).toBe("checklist");
      expect(chkAlert.meta?.completedCount).toBe(2);
      expect(chkAlert.meta?.totalCount).toBe(3);
    });
  });

  describe("3. Habit Streak Metadata", () => {
    it("projects habit streak metadata in Alert Center", async () => {
      const now = Date.now();
      const habit: Habit = {
        id: "habit-run",
        workspaceId: "ws-1",
        title: "Morning Run",
        categoryId: "health",
        recurrence: { frequency: "daily", interval: 1 },
        completionHistory: [],
        streak: 7,
        bestStreak: 14,
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: now + 3600000,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({
        "habit-run": habit,
      });
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.upNext.length).toBe(1);
      const habitAlert = data.upNext[0];
      expect(habitAlert.entityType).toBe("habit");
      expect(habitAlert.meta?.streak).toBe(7);
    });
  });

  describe("4. Canonical Actions", () => {
    it("completes task via EntityCommandService", async () => {
      await AlertCenterService.completeTask("task-123", "ws-1");
      expect(EntityCommandService.completeTask).toHaveBeenCalledWith("task-123", "ws-1");
    });

    it("completes habit via EntityCommandService", async () => {
      await AlertCenterService.completeHabit("habit-123", "ws-1");
      expect(EntityCommandService.completeHabit).toHaveBeenCalledWith("habit-123", "ws-1");
    });

    it("cancels reminder via EntityCommandService update", async () => {
      await AlertCenterService.cancelReminder("checklist", "chk-123", "ws-1");
      expect(EntityCommandService.updateChecklist).toHaveBeenCalledWith("chk-123", "ws-1", {
        reminder: undefined,
      });
    });
  });
});
