import { AlertCenterService } from "../AlertCenterService";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { TaskRepository } from "@/repositories/TaskRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { Task, Habit, Checklist } from "@/shared/types/domain.types";
import { getRouteForPayload } from "@/services/scheduling/notification-routes";

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

  describe("1. Real Coexistence of Task, Habit, and Checklist", () => {
    it("simultaneously projects Task, Habit, and Checklist into Up Next sorted by triggerAt", async () => {
      const now = Date.now();
      const habitTime = now + 1 * 60 * 60 * 1000; // 1 hour from now
      const taskTime = now + 2 * 60 * 60 * 1000;  // 2 hours from now
      const checklistTime = now + 3 * 60 * 60 * 1000; // 3 hours from now

      const habit: Habit = {
        id: "habit-meditation",
        workspaceId: "ws-1",
        title: "Meditation",
        recurrence: { frequency: "daily", interval: 1 },
        completionHistory: [],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
        reminder: {
          enabled: true,
          triggerAt: habitTime,
        },
      };

      const task: Task = {
        id: "task-k8s",
        workspaceId: "ws-1",
        title: "Study Kubernetes",
        status: "todo",
        priority: "high",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
        reminder: {
          enabled: true,
          triggerAt: taskTime,
        },
      };

      const checklist: Checklist = {
        id: "chk-shopping",
        workspaceId: "ws-1",
        title: "Shopping",
        items: [
          { id: "i-1", title: "Milk", completed: false },
          { id: "i-2", title: "Bread", completed: false },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
        reminder: {
          enabled: true,
          triggerAt: checklistTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-k8s": task });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({ "habit-meditation": habit });
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({ "chk-shopping": checklist });

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.upNext.length).toBe(3);

      // Verify chronological ordering: Meditation (1h) -> Study Kubernetes (2h) -> Shopping (3h)
      expect(data.upNext[0].title).toBe("Meditation");
      expect(data.upNext[0].entityType).toBe("habit");
      expect(data.upNext[0].entityId).toBe("habit-meditation");

      expect(data.upNext[1].title).toBe("Study Kubernetes");
      expect(data.upNext[1].entityType).toBe("task");
      expect(data.upNext[1].entityId).toBe("task-k8s");

      expect(data.upNext[2].title).toBe("Shopping");
      expect(data.upNext[2].entityType).toBe("checklist");
      expect(data.upNext[2].entityId).toBe("chk-shopping");
      expect(data.upNext[2].meta?.completedCount).toBe(0);
      expect(data.upNext[2].meta?.totalCount).toBe(2);
    });

    it("allows Task and Checklist with the same title to coexist without collision", async () => {
      const now = Date.now();
      const taskTime = now + 1 * 60 * 60 * 1000;
      const checklistTime = now + 2 * 60 * 60 * 1000;

      const task: Task = {
        id: "task-shop",
        workspaceId: "ws-1",
        title: "Shopping",
        status: "todo",
        priority: "medium",
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
        reminder: { enabled: true, triggerAt: taskTime },
      };

      const checklist: Checklist = {
        id: "chk-shop",
        workspaceId: "ws-1",
        title: "Shopping",
        items: [{ id: "i-1", title: "Apples", completed: false }],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: now,
        updatedAt: now,
        reminder: { enabled: true, triggerAt: checklistTime },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-shop": task });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({ "chk-shop": checklist });

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.upNext.length).toBe(2);
      expect(data.upNext.some((item) => item.entityType === "task" && item.id === "task:task-shop")).toBe(true);
      expect(data.upNext.some((item) => item.entityType === "checklist" && item.id === "checklist:chk-shop")).toBe(true);
    });
  });

  describe("2. Data Partitioning & Status Calculation", () => {
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
      expect(data.needsAttention[0].entityType).toBe("task");
      expect(data.upNext.length).toBe(0);
      expect(data.later.length).toBe(0);
    });

    it("partitions overdue checklist into needsAttention group", async () => {
      const now = Date.now();
      const pastTime = now - 3 * 60 * 60 * 1000;

      const overdueChecklist: Checklist = {
        id: "chk-overdue",
        workspaceId: "ws-1",
        title: "Overdue Shopping",
        items: [{ id: "1", title: "Milk", completed: false }],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: {
          enabled: true,
          triggerAt: pastTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({
        "chk-overdue": overdueChecklist,
      });

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.needsAttention.length).toBe(1);
      expect(data.needsAttention[0].entityId).toBe("chk-overdue");
      expect(data.needsAttention[0].status).toBe("overdue");
      expect(data.needsAttention[0].entityType).toBe("checklist");
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

    it("projects recurring task with past initial trigger to next occurrence without false overdue", async () => {
      const now = Date.now();
      const pastTime = now - 5 * 24 * 60 * 60 * 1000; // 5 days ago

      const recurringTask: Task = {
        id: "task-rec",
        workspaceId: "ws-1",
        title: "Daily Standup",
        status: "todo",
        priority: "high",
        recurrence: { frequency: "daily", interval: 1 },
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: pastTime,
        updatedAt: pastTime,
        reminder: {
          enabled: true,
          triggerAt: pastTime,
        },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({ "task-rec": recurringTask });
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({});

      const data = await AlertCenterService.getAlertCenterData();

      expect(data.needsAttention.length).toBe(0); // NOT overdue!
      expect(data.upNext.length + data.later.length).toBe(1);
      const projected = data.upNext[0] || data.later[0];
      expect(projected.triggerAt).toBeGreaterThan(now);
    });
  });

  describe("3. Checklist & Habit Metadata & Completion", () => {
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

    it("excludes fully completed non-recurring checklists", async () => {
      const now = Date.now();
      const checklist: Checklist = {
        id: "chk-done",
        workspaceId: "ws-1",
        title: "Done Shopping",
        items: [
          { id: "1", title: "Milk", completed: true },
          { id: "2", title: "Bread", completed: true },
        ],
        revision: 1,
        lifecycleGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
        reminder: { enabled: true, triggerAt: now + 3600000 },
      };

      (TaskRepository.getTasks as jest.Mock).mockResolvedValue({});
      (HabitRepository.getHabits as jest.Mock).mockResolvedValue({});
      (ChecklistRepository.getChecklists as jest.Mock).mockResolvedValue({ "chk-done": checklist });

      const data = await AlertCenterService.getAlertCenterData();
      expect(data.all.length).toBe(0);
    });

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

  describe("4. Canonical Actions & Route Mapping", () => {
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

    it("routes checklist notification payload to /checklist-details", () => {
      const route = getRouteForPayload({ type: "checklist", itemId: "chk-123" });
      expect(route).toBe("/checklist-details?id=chk-123");
    });

    it("routes task notification payload to /task-details with type=task", () => {
      const route = getRouteForPayload({ type: "task", itemId: "task-123" });
      expect(route).toBe("/task-details?id=task-123&type=task");
    });

    it("routes habit notification payload to /task-details with type=habit", () => {
      const route = getRouteForPayload({ type: "habit", itemId: "habit-123" });
      expect(route).toBe("/task-details?id=habit-123&type=habit");
    });
  });
});
