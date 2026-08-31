import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository } from "@/repositories/TaskRepository";
import { ChecklistRepository } from "@/repositories/ChecklistRepository";
import { HabitRepository } from "@/repositories/HabitRepository";
import { WorkspaceRepository } from "@/repositories/WorkspaceRepository";
import { AlertCenterService } from "@/services/notifications/AlertCenterService";
import { parseProductivityText } from "@/features/capture/services/nlp-parser.service";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import { Task, Checklist, Habit, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";
import * as remindersService from "@/services/scheduling/reminders.service";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));

jest.mock("@/services/scheduling/reminders.service", () => {
  const actual = jest.requireActual("@/services/scheduling/reminders.service");
  return {
    ...actual,
    scheduleReminderBatch: jest.fn().mockResolvedValue({ ids: ["mock-os-notif-1"] }),
    cancelReminderIds: jest.fn().mockResolvedValue(undefined),
  };
});

describe("Schedule and Reminder Relationship Hardening", () => {
  let taskStore: Record<string, Task> = {};
  let checklistStore: Record<string, Checklist> = {};
  let habitStore: Record<string, Habit> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    taskStore = {};
    checklistStore = {};
    habitStore = {};

    jest.spyOn(WorkspaceRepository, "getWorkspaces").mockResolvedValue([
      { id: INBOX_WORKSPACE_ID, name: "Inbox", revision: 1, lifecycleGeneration: 1, createdAt: 1, updatedAt: 1 },
    ]);

    // Mock TaskRepository
    jest.spyOn(TaskRepository, "getTasks").mockImplementation(async () => ({ ...taskStore }));
    jest.spyOn(TaskRepository, "getTask").mockImplementation(async (id: string) => taskStore[id] || null);
    jest.spyOn(TaskRepository, "saveTaskUnlocked").mockImplementation(async (t: Task) => {
      taskStore[t.id] = { ...t };
      return taskStore[t.id];
    });
    jest.spyOn(TaskRepository, "updateNotificationIds").mockImplementation(async (id: string, _ws: string, ids?: string[]) => {
      if (taskStore[id] && taskStore[id].reminder) {
        taskStore[id].reminder!.notificationIds = ids;
      }
      return "updated";
    });

    // Mock ChecklistRepository
    jest.spyOn(ChecklistRepository, "getChecklists").mockImplementation(async () => ({ ...checklistStore }));
    jest.spyOn(ChecklistRepository, "getChecklist").mockImplementation(async (id: string) => checklistStore[id] || null);
    jest.spyOn(ChecklistRepository, "saveChecklistUnlocked").mockImplementation(async (c: Checklist) => {
      checklistStore[c.id] = { ...c };
      return checklistStore[c.id];
    });
    jest.spyOn(ChecklistRepository, "updateNotificationIds").mockImplementation(async (id: string, _ws: string, ids?: string[]) => {
      if (checklistStore[id] && checklistStore[id].reminder) {
        checklistStore[id].reminder!.notificationIds = ids;
      }
      return "updated";
    });

    // Mock HabitRepository
    jest.spyOn(HabitRepository, "getHabits").mockImplementation(async () => ({ ...habitStore }));
    jest.spyOn(HabitRepository, "getHabit").mockImplementation(async (id: string) => habitStore[id] || null);
    jest.spyOn(HabitRepository, "saveHabitUnlocked").mockImplementation(async (h: Habit) => {
      habitStore[h.id] = { ...h };
      return habitStore[h.id];
    });
    jest.spyOn(HabitRepository, "updateNotificationIds").mockImplementation(async (id: string, _ws: string, ids?: string[]) => {
      if (habitStore[id] && habitStore[id].reminder) {
        habitStore[id].reminder!.notificationIds = ids;
      }
      return "updated";
    });
  });

  describe("A. Quick Capture timed Task creates reminder", () => {
    it("creates scheduled Task with matching reminder and schedules OS notification", async () => {
      const parsed = parseProductivityText("Study Kubernetes at 10 PM");
      expect(parsed.type).toBe("task");
      expect(parsed.time).toBe("22:00");

      const savedTask = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Task;

      expect(savedTask.title).toBe("Study Kubernetes");
      expect(savedTask.schedule?.startTime).toBe("22:00");
      expect(savedTask.reminder).toBeDefined();
      expect(savedTask.reminder?.enabled).toBe(true);

      const reminderDate = new Date(savedTask.reminder!.triggerAt);
      expect(reminderDate.getHours()).toBe(22);
      expect(reminderDate.getMinutes()).toBe(0);

      expect(remindersService.scheduleReminderBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("B. Quick Capture timed Checklist creates reminder", () => {
    it("creates scheduled Checklist with matching reminder and schedules OS notification", async () => {
      const parsed = parseProductivityText("Shopping at 6 PM\n- Milk\n- Bread");
      expect(parsed.type).toBe("checklist");
      expect(parsed.time).toBe("18:00");

      const savedChecklist = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Checklist;

      expect(savedChecklist.title).toBe("Shopping");
      expect(savedChecklist.schedule?.startTime).toBe("18:00");
      expect(savedChecklist.reminder).toBeDefined();
      expect(savedChecklist.reminder?.enabled).toBe(true);

      const reminderDate = new Date(savedChecklist.reminder!.triggerAt);
      expect(reminderDate.getHours()).toBe(18);
      expect(reminderDate.getMinutes()).toBe(0);

      expect(remindersService.scheduleReminderBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("C. Timed Habit preserves reminder behavior", () => {
    it("creates scheduled Habit with matching reminder and recurrence", async () => {
      const parsed = parseProductivityText("Meditation every day at 7:30 AM");
      expect(parsed.type).toBe("habit");
      expect(parsed.time).toBe("07:30");

      const savedHabit = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Habit;

      expect(savedHabit.title).toBe("Meditation");
      expect(savedHabit.schedule?.startTime).toBe("07:30");
      expect(savedHabit.reminder).toBeDefined();
      expect(savedHabit.reminder?.enabled).toBe(true);

      const reminderDate = new Date(savedHabit.reminder!.triggerAt);
      expect(reminderDate.getHours()).toBe(7);
      expect(reminderDate.getMinutes()).toBe(30);

      expect(remindersService.scheduleReminderBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("D. Planner scheduling Task creates reminder", () => {
    it("defaults reminder to scheduled start time when an unscheduled task is planned", async () => {
      // 1. Create unscheduled task
      const unscheduled = await EntityCommandService.createTask(
        {
          id: "task-unscheduled",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Study Kubernetes",
          status: "todo",
          priority: "high",
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        INBOX_WORKSPACE_ID,
      );

      expect(unscheduled.reminder).toBeUndefined();

      // 2. Planner assigns schedule at 10 PM (22:00)
      const planned = await EntityCommandService.updateTask(
        unscheduled.id,
        INBOX_WORKSPACE_ID,
        {
          schedule: {
            date: "2026-09-01",
            startTime: "22:00",
            durationMinutes: 60,
          },
        },
      );

      expect(planned.schedule?.startTime).toBe("22:00");
      expect(planned.reminder).toBeDefined();
      expect(planned.reminder?.enabled).toBe(true);

      const reminderDate = new Date(planned.reminder!.triggerAt);
      expect(reminderDate.getHours()).toBe(22);
      expect(reminderDate.getMinutes()).toBe(0);
    });
  });

  describe("E. Planner scheduling Checklist creates reminder", () => {
    it("defaults reminder to scheduled start time when an unscheduled checklist is planned", async () => {
      const unscheduled = await EntityCommandService.createChecklist(
        {
          id: "chk-unscheduled",
          workspaceId: INBOX_WORKSPACE_ID,
          title: "Weekly Shopping",
          items: [{ id: "1", title: "Milk", completed: false }],
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        INBOX_WORKSPACE_ID,
      );

      expect(unscheduled.reminder).toBeUndefined();

      const planned = await EntityCommandService.updateChecklist(
        unscheduled.id,
        INBOX_WORKSPACE_ID,
        {
          schedule: {
            date: "2026-09-01",
            startTime: "18:00",
            durationMinutes: 45,
          },
        },
      );

      expect(planned.schedule?.startTime).toBe("18:00");
      expect(planned.reminder).toBeDefined();
      expect(planned.reminder?.enabled).toBe(true);

      const reminderDate = new Date(planned.reminder!.triggerAt);
      expect(reminderDate.getHours()).toBe(18);
      expect(reminderDate.getMinutes()).toBe(0);
    });
  });

  describe("F. Rescheduling Task moves reminder", () => {
    it("moves reminder trigger from 8 PM to 10 PM and reschedules OS notification", async () => {
      const parsed = parseProductivityText("Deploy Release at 8 PM");
      const task = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Task;

      expect(new Date(task.reminder!.triggerAt).getHours()).toBe(20);

      // Reschedule to 10 PM
      const updated = await EntityCommandService.updateTask(
        task.id,
        INBOX_WORKSPACE_ID,
        {
          schedule: {
            ...task.schedule,
            startTime: "22:00",
          },
        },
      );

      expect(updated.schedule?.startTime).toBe("22:00");
      expect(new Date(updated.reminder!.triggerAt).getHours()).toBe(22);
      expect(new Date(updated.reminder!.triggerAt).getMinutes()).toBe(0);
    });
  });

  describe("G. Rescheduling Checklist moves reminder", () => {
    it("moves checklist reminder trigger from 6 PM to 7 PM", async () => {
      const parsed = parseProductivityText("Shopping at 6 PM\n- Milk\n- Bread");
      const checklist = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Checklist;

      expect(new Date(checklist.reminder!.triggerAt).getHours()).toBe(18);

      const updated = await EntityCommandService.updateChecklist(
        checklist.id,
        INBOX_WORKSPACE_ID,
        {
          schedule: {
            ...checklist.schedule,
            startTime: "19:00",
          },
        },
      );

      expect(updated.schedule?.startTime).toBe("19:00");
      expect(new Date(updated.reminder!.triggerAt).getHours()).toBe(19);
    });
  });

  describe("H. Explicit No Reminder remains disabled", () => {
    it("does NOT recreate reminder when user explicitly chose no reminder and moves task", async () => {
      // 1. Quick capture with explicit "no reminder"
      const parsed = parseProductivityText("Study Kubernetes at 10 PM no reminder");
      const task = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Task;

      expect(task.schedule?.startTime).toBe("22:00");
      expect(task.reminder).toBeUndefined();

      // 2. Explicitly mark reminder disabled
      const taskWithDisabledReminder = await EntityCommandService.updateTask(
        task.id,
        INBOX_WORKSPACE_ID,
        {
          reminder: { enabled: false, triggerAt: 0 },
        },
      );

      expect(taskWithDisabledReminder.reminder?.enabled).toBe(false);

      // 3. Move task to 11 PM
      const movedTask = await EntityCommandService.updateTask(
        task.id,
        INBOX_WORKSPACE_ID,
        {
          schedule: {
            ...task.schedule,
            startTime: "23:00",
          },
        },
      );

      expect(movedTask.schedule?.startTime).toBe("23:00");
      // Must NOT be recreated or re-enabled!
      expect(movedTask.reminder?.enabled).toBe(false);
    });
  });

  describe("I. Custom reminder offset survives schedule changes", () => {
    it("preserves 30-minute before reminder offset when task is moved from 8 PM to 10 PM", async () => {
      const parsed = parseProductivityText("Study Kubernetes at 8 PM remind me 30 mins before");
      const task = (await saveParsedItem(parsed, INBOX_WORKSPACE_ID)) as Task;

      // 8:00 PM minus 30 mins = 7:30 PM (19:30)
      const initialReminder = new Date(task.reminder!.triggerAt);
      expect(initialReminder.getHours()).toBe(19);
      expect(initialReminder.getMinutes()).toBe(30);

      // Move task to 10 PM (22:00)
      const movedTask = await EntityCommandService.updateTask(
        task.id,
        INBOX_WORKSPACE_ID,
        {
          schedule: {
            ...task.schedule,
            startTime: "22:00",
          },
        },
      );

      // 10:00 PM minus 30 mins = 9:30 PM (21:30)
      const updatedReminder = new Date(movedTask.reminder!.triggerAt);
      expect(updatedReminder.getHours()).toBe(21);
      expect(updatedReminder.getMinutes()).toBe(30);
    });
  });

  describe("J. Alert Center receives all three entities", () => {
    it("projects Task, Habit, and Checklist created through Quick Capture into Alert Center", async () => {
      const taskParsed = parseProductivityText("Study Kubernetes at 10 PM");
      const habitParsed = parseProductivityText("Meditation every day at 7:30 AM");
      const checklistParsed = parseProductivityText("Shopping at 6 PM\n- Milk\n- Bread");

      await saveParsedItem(taskParsed, INBOX_WORKSPACE_ID);
      await saveParsedItem(habitParsed, INBOX_WORKSPACE_ID);
      await saveParsedItem(checklistParsed, INBOX_WORKSPACE_ID);

      const alertCenterData = await AlertCenterService.getAlertCenterData();

      expect(alertCenterData.all.length).toBe(3);
      expect(alertCenterData.all.some((a) => a.title === "Study Kubernetes" && a.entityType === "task")).toBe(true);
      expect(alertCenterData.all.some((a) => a.title === "Meditation" && a.entityType === "habit")).toBe(true);
      expect(alertCenterData.all.some((a) => a.title === "Shopping" && a.entityType === "checklist")).toBe(true);
    });
  });
});
