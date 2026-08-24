import AsyncStorage from "@react-native-async-storage/async-storage";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { TaskRepository, HabitRepository, WorkspaceRepository, ConversionJournalRepository } from "@/repositories";
import { ConversionReconcilerService } from "@/services/storage/ConversionReconcilerService";
import type { Task, Habit, Workspace } from "@/shared/types/domain.types";
import { withLocks } from "@/shared/utils/mutex";
import * as Notifications from "@/services/command/shared/command-notifications";
import * as RemindersService from "@/services/scheduling/reminders.service";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const storage = AsyncStorage as typeof AsyncStorage;

describe("Hostile Conversion Verification (Journal Sequence)", () => {
  beforeEach(async () => {
    await storage.clear();
    jest.restoreAllMocks();
  });

  const ws = (id: string): Workspace => ({ id, name: id, createdAt: 1, updatedAt: 1 } as any);
  const task = (id: string, workspaceId: string): Task => ({ id, workspaceId, title: "Task", status: "todo", priority: "none", createdAt: 1, updatedAt: 1 } as any);
  const habit = (id: string, workspaceId: string): Habit => ({ id, workspaceId, title: "Habit", categoryId: "work", tags: [], recurrence: { frequency: "daily", interval: 1 }, completionHistory: [], createdAt: 1, updatedAt: 1 } as any);

  describe("1. Crash Integrity", () => {
    it("Test A: Crash after PREPARED (Destination Task write fails)", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await HabitRepository.saveHabit(habit("habit-1", "ws-convert"));

      // Intercept the destination write to crash
      const originalSaveTaskUnlocked = TaskRepository.saveTaskUnlocked;
      TaskRepository.saveTaskUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash during destination write"));

      await expect(EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash during destination write");

      // Verify the state immediately after the crash
      const journal = await ConversionJournalRepository.getOperations();
      expect(journal.length).toBe(1);
      expect(journal[0].phase).toBe("PREPARED");

      const tasksPre = await TaskRepository.getTasks("ws-convert");
      const habitsPre = await HabitRepository.getHabits("ws-convert");
      
      expect(Object.keys(tasksPre).length).toBe(0); // Task was NOT written
      expect(Object.keys(habitsPre).length).toBe(1); // Habit is STILL there

      // Now run the Reconciler to fix the state
      await ConversionReconcilerService.reconcileAll();

      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      // Because destination was missing, it rolled back idempotently
      expect(Object.keys(tasksPost).length).toBe(0);
      expect(Object.keys(habitsPost).length).toBe(1);
      expect(journalPost.length).toBe(0); // Journal cleared

      // Restore mock
      TaskRepository.saveTaskUnlocked = originalSaveTaskUnlocked;
    });

    it("Test B: Crash after Destination Write, before updating Journal to DESTINATION_WRITTEN", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await HabitRepository.saveHabit(habit("habit-1", "ws-convert"));

      const originalUpdateOperationUnlocked = ConversionJournalRepository.updateOperationUnlocked;
      ConversionJournalRepository.updateOperationUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash updating journal"));

      await expect(EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash updating journal");

      // State immediately after crash: 
      // Task EXISTS. Habit EXISTS (duplication). Journal is in PREPARED state.
      const journal = await ConversionJournalRepository.getOperations();
      expect(journal.length).toBe(1);
      expect(journal[0].phase).toBe("PREPARED");

      const tasksPre = await TaskRepository.getTasks("ws-convert");
      const habitsPre = await HabitRepository.getHabits("ws-convert");
      
      expect(Object.keys(tasksPre).length).toBe(1); // Task WAS written!
      expect(Object.keys(habitsPre).length).toBe(1); // Habit is STILL there!

      // Run the Reconciler
      await ConversionReconcilerService.reconcileAll();

      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      // Because destination EXISTS, reconciler rolls FORWARD (deletes Habit, clears journal)
      expect(Object.keys(tasksPost).length).toBe(1);
      expect(Object.keys(habitsPost).length).toBe(0); // Habit DELETED!
      expect(journalPost.length).toBe(0); // Journal cleared

      ConversionJournalRepository.updateOperationUnlocked = originalUpdateOperationUnlocked;
    });

    it("Test C: Crash after DESTINATION_WRITTEN, before Source deletion", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await HabitRepository.saveHabit(habit("habit-1", "ws-convert"));

      const originalDeleteHabitUnlocked = HabitRepository.deleteHabitUnlocked;
      HabitRepository.deleteHabitUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash deleting source"));

      await expect(EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash deleting source");

      // State after crash:
      // Task EXISTS. Habit EXISTS. Journal is in DESTINATION_WRITTEN state.
      const journal = await ConversionJournalRepository.getOperations();
      expect(journal.length).toBe(1);
      expect(journal[0].phase).toBe("DESTINATION_WRITTEN");

      const tasksPre = await TaskRepository.getTasks("ws-convert");
      const habitsPre = await HabitRepository.getHabits("ws-convert");
      
      expect(Object.keys(tasksPre).length).toBe(1);
      expect(Object.keys(habitsPre).length).toBe(1);

      // Restore mock BEFORE running Reconciler, so Reconciler can actually fix it
      HabitRepository.deleteHabitUnlocked = originalDeleteHabitUnlocked;

      // Run Reconciler
      await ConversionReconcilerService.reconcileAll();

      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      // Reconciler sees DESTINATION_WRITTEN, so it guarantees roll-forward
      expect(Object.keys(tasksPost).length).toBe(1);
      expect(Object.keys(habitsPost).length).toBe(0);
      expect(journalPost.length).toBe(0);
    });
    it("Test D: Crash during Journal Deletion (Source missing)", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await HabitRepository.saveHabit(habit("habit-1", "ws-convert"));

      const originalRemoveOperationUnlocked = ConversionJournalRepository.removeOperationUnlocked;
      ConversionJournalRepository.removeOperationUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash deleting journal"));

      await expect(EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash deleting journal");

      // State after crash:
      // Task EXISTS. Habit is MISSING. Journal is in DESTINATION_WRITTEN state.
      const journal = await ConversionJournalRepository.getOperations();
      expect(journal.length).toBe(1);
      expect(journal[0].phase).toBe("DESTINATION_WRITTEN");

      const tasksPre = await TaskRepository.getTasks("ws-convert");
      const habitsPre = await HabitRepository.getHabits("ws-convert");
      
      expect(Object.keys(tasksPre).length).toBe(1);
      expect(Object.keys(habitsPre).length).toBe(0);

      // Restore mock
      ConversionJournalRepository.removeOperationUnlocked = originalRemoveOperationUnlocked;

      // Run Reconciler
      await ConversionReconcilerService.reconcileAll();

      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      // Reconciler sees DESTINATION_WRITTEN, executes deleteHabitUnlocked (idempotent), clears journal
      expect(Object.keys(tasksPost).length).toBe(1);
      expect(Object.keys(habitsPost).length).toBe(0);
      expect(journalPost.length).toBe(0);

      // Verify idempotency (run reconciler again)
      await ConversionReconcilerService.reconcileAll();
      const journalPostIdempotency = await ConversionJournalRepository.getOperations();
      expect(journalPostIdempotency.length).toBe(0);
    });

    it("Test E: Task -> Habit Crash after PREPARED (Destination Habit write fails)", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await TaskRepository.saveTask(task("task-1", "ws-convert"));

      const originalSaveHabitUnlocked = HabitRepository.saveHabitUnlocked;
      HabitRepository.saveHabitUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash during destination write"));

      await expect(EntityCommandService.convertTaskToHabit("task-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash during destination write");

      const journal = await ConversionJournalRepository.getOperations();
      expect(journal.length).toBe(1);
      expect(journal[0].phase).toBe("PREPARED");

      await ConversionReconcilerService.reconcileAll();

      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      expect(Object.keys(habitsPost).length).toBe(0);
      expect(Object.keys(tasksPost).length).toBe(1);
      expect(journalPost.length).toBe(0);

      HabitRepository.saveHabitUnlocked = originalSaveHabitUnlocked;
    });

    it("Test F: Task -> Habit Crash after Destination Write, before updating Journal", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await TaskRepository.saveTask(task("task-1", "ws-convert"));

      const originalUpdateOperationUnlocked = ConversionJournalRepository.updateOperationUnlocked;
      ConversionJournalRepository.updateOperationUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash updating journal"));

      await expect(EntityCommandService.convertTaskToHabit("task-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash updating journal");

      ConversionJournalRepository.updateOperationUnlocked = originalUpdateOperationUnlocked;

      await ConversionReconcilerService.reconcileAll();

      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      expect(Object.keys(habitsPost).length).toBe(1);
      expect(Object.keys(tasksPost).length).toBe(0);
      expect(journalPost.length).toBe(0);
    });

    it("Test G: Task -> Habit Crash after DESTINATION_WRITTEN, before Source deletion", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await TaskRepository.saveTask(task("task-1", "ws-convert"));

      const originalDeleteTaskUnlocked = TaskRepository.deleteTaskUnlocked;
      TaskRepository.deleteTaskUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash deleting source"));

      await expect(EntityCommandService.convertTaskToHabit("task-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash deleting source");

      TaskRepository.deleteTaskUnlocked = originalDeleteTaskUnlocked;

      await ConversionReconcilerService.reconcileAll();

      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      expect(Object.keys(habitsPost).length).toBe(1);
      expect(Object.keys(tasksPost).length).toBe(0);
      expect(journalPost.length).toBe(0);
    });

    it("Test H: Task -> Habit Crash during Journal Deletion", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      await TaskRepository.saveTask(task("task-1", "ws-convert"));

      const originalRemoveOperationUnlocked = ConversionJournalRepository.removeOperationUnlocked;
      ConversionJournalRepository.removeOperationUnlocked = jest.fn().mockRejectedValueOnce(new Error("Crash deleting journal"));

      await expect(EntityCommandService.convertTaskToHabit("task-1", "ws-convert", { skipEvents: true, skipAnalytics: true }))
        .rejects.toThrow("Crash deleting journal");

      ConversionJournalRepository.removeOperationUnlocked = originalRemoveOperationUnlocked;

      await ConversionReconcilerService.reconcileAll();

      const habitsPost = await HabitRepository.getHabits("ws-convert");
      const tasksPost = await TaskRepository.getTasks("ws-convert");
      const journalPost = await ConversionJournalRepository.getOperations();

      expect(Object.keys(habitsPost).length).toBe(1);
      expect(Object.keys(tasksPost).length).toBe(0);
      expect(journalPost.length).toBe(0);
    });
  });

  describe("2. Concurrent Edits (Stale Read Prevention)", () => {
    it("If the habit is edited concurrently during the lock queue, the conversion uses the latest state", async () => {
        await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
        await HabitRepository.saveHabit(habit("habit-1", "ws-convert"));
  
        const locksAcquired = new Promise<void>(async (resolve) => {
            await withLocks([`pebble:v1:habits:ws-convert`], async () => {
                resolve();
                const h = habit("habit-1", "ws-convert");
                h.title = "EDITED_TITLE_DURING_CONVERSION";
                await HabitRepository.saveHabitUnlocked(h);
            });
        });
        
        await locksAcquired;
        
        const newTask = await EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true });
        expect(newTask.title).toBe("EDITED_TITLE_DURING_CONVERSION");
    });
  });

  describe("3. Double Conversion Race", () => {
    it("Concurrent calls to convert the same habit only result in exactly ONE task", async () => {
        await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
        await HabitRepository.saveHabit(habit("habit-1", "ws-convert"));

        const req1 = EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true });
        const req2 = EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true });

        const results = await Promise.allSettled([req1, req2]);

        const fulfilled = results.filter(r => r.status === "fulfilled");
        const rejected = results.filter(r => r.status === "rejected");
        console.log("REJECTED:", rejected.map((r: any) => r.reason));

        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        
        if (rejected[0].status === "rejected") {
           expect(rejected[0].reason.message).toContain("not found in workspace");
        }

        const tasks = await TaskRepository.getTasks("ws-convert");
        expect(Object.keys(tasks).length).toBe(1);
    });
  });

  describe("4. Notification Race", () => {
    it("Test A: Habit -> Task conversion vs concurrent Task reminder update", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      
      const h = habit("habit-1", "ws-convert");
      h.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["old-id-1"] };
      await HabitRepository.saveHabit(h);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>(resolve => { pauseConversion = resolve; });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>(resolve => { resumeConversion = resolve; });

      jest.spyOn(Notifications, "scheduleTaskNotifications").mockImplementation(async () => {
        pauseConversion(); // Signal that we are inside OS scheduling phase
        await conversionResume; // Wait for concurrent mutation to finish
        return ["stale-id-1", "stale-id-2"]; // Return stale generated IDs
      });

      const cancelSpy = jest.spyOn(RemindersService, "cancelReminderIds").mockResolvedValue();

      // Start the conversion
      const conversionPromise = EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true });

      // Wait for the conversion to enter OS scheduling phase
      await conversionPaused;

      // Now run the concurrent mutation (user edits the reminder time on the newly converted task)
      // Note: The task ID is generated, so we need to get it from the repository
      const tasks = await TaskRepository.getTasks("ws-convert");
      const taskKeys = Object.keys(tasks);
      expect(taskKeys.length).toBe(1);
      const newTaskId = taskKeys[0];
      const task = tasks[newTaskId];

      // Mutate the task reminder and update notification IDs
      task.reminder = { enabled: true, triggerAt: 2000, notificationIds: ["new-id-1", "new-id-2"] };
      await TaskRepository.saveTask(task); // Simulating the concurrent save

      // Resume conversion
      resumeConversion!();
      
      await conversionPromise;

      // Verify that the concurrent mutation survived
      const updatedTasks = await TaskRepository.getTasks("ws-convert");
      const updatedTask = updatedTasks[newTaskId];
      
      expect(updatedTask.reminder?.triggerAt).toBe(2000);
      expect(updatedTask.reminder?.notificationIds).toEqual(["new-id-1", "new-id-2"]);

      // Verify that the stale IDs were cancelled!
      expect(cancelSpy).toHaveBeenCalledWith(["stale-id-1", "stale-id-2"], expect.anything());
    });

    it("Test B: Task -> Habit conversion vs concurrent Habit reminder update", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      
      const t = task("task-1", "ws-convert");
      t.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["old-id-1"] };
      await TaskRepository.saveTask(t);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>(resolve => { pauseConversion = resolve; });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>(resolve => { resumeConversion = resolve; });

      jest.spyOn(Notifications, "scheduleHabitNotifications").mockImplementation(async () => {
        pauseConversion(); 
        await conversionResume; 
        return ["stale-id-1", "stale-id-2"]; 
      });

      const cancelSpy = jest.spyOn(RemindersService, "cancelReminderIds").mockResolvedValue();

      const conversionPromise = EntityCommandService.convertTaskToHabit("task-1", "ws-convert", { skipEvents: true, skipAnalytics: true });

      await conversionPaused;

      const habits = await HabitRepository.getHabits("ws-convert");
      const habitKeys = Object.keys(habits);
      expect(habitKeys.length).toBe(1);
      const newHabitId = habitKeys[0];
      const h = habits[newHabitId];

      h.reminder = { enabled: true, triggerAt: 2000, notificationIds: ["new-id-1", "new-id-2"] };
      await HabitRepository.saveHabit(h); 

      resumeConversion!();
      
      await conversionPromise;

      const updatedHabits = await HabitRepository.getHabits("ws-convert");
      const updatedHabit = updatedHabits[newHabitId];
      
      expect(updatedHabit.reminder?.triggerAt).toBe(2000);
      expect(updatedHabit.reminder?.notificationIds).toEqual(["new-id-1", "new-id-2"]);

      expect(cancelSpy).toHaveBeenCalledWith(["stale-id-1", "stale-id-2"], expect.anything());
    });

    it("Test C: Edge case - B changes notificationIds ONLY but keeps other reminder fields identical to A's snapshot", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      
      const h = habit("habit-1", "ws-convert");
      h.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["old-id-1"] };
      await HabitRepository.saveHabit(h);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>(resolve => { pauseConversion = resolve; });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>(resolve => { resumeConversion = resolve; });

      jest.spyOn(Notifications, "scheduleTaskNotifications").mockImplementation(async () => {
        pauseConversion(); 
        await conversionResume; 
        return ["stale-id-1", "stale-id-2"]; 
      });

      const cancelSpy = jest.spyOn(RemindersService, "cancelReminderIds").mockResolvedValue();

      const conversionPromise = EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true });

      await conversionPaused;

      const tasks = await TaskRepository.getTasks("ws-convert");
      const taskKeys = Object.keys(tasks);
      const newTaskId = taskKeys[0];
      const task = tasks[newTaskId];

      // Mutate ONLY notificationIds, leaving triggerAt and enabled the same
      // Add a small delay to ensure Date.now() advances for the CAS updatedAt check
      await new Promise(r => setTimeout(r, 5));
      task.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["new-id-1", "new-id-2"] };
      await TaskRepository.saveTask(task); // This will update the updatedAt field!

      resumeConversion!();
      
      await conversionPromise;

      const updatedTasks = await TaskRepository.getTasks("ws-convert");
      const updatedTask = updatedTasks[newTaskId];
      
      // EXPECTATION: The CAS should still detect the mutation and reject the conversion's old IDs,
      // preserving B's new notification IDs.
      expect(updatedTask.reminder?.notificationIds).toEqual(["new-id-1", "new-id-2"]);
      expect(cancelSpy).toHaveBeenCalledWith(["stale-id-1", "stale-id-2"], expect.anything());
    });

    it("Test D: Same-millisecond mutation edge case", async () => {
      await WorkspaceRepository.saveWorkspaces([ws("ws-convert")]);
      
      const fixedTime = 1787590000000;
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(fixedTime);

      const h = habit("habit-1", "ws-convert");
      h.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["old-id-1"] };
      await HabitRepository.saveHabit(h);

      let pauseConversion: () => void;
      const conversionPaused = new Promise<void>(resolve => { pauseConversion = resolve; });
      let resumeConversion: () => void;
      const conversionResume = new Promise<void>(resolve => { resumeConversion = resolve; });

      jest.spyOn(Notifications, "scheduleTaskNotifications").mockImplementation(async () => {
        pauseConversion(); 
        await conversionResume; 
        return ["stale-id-1", "stale-id-2"]; 
      });

      const cancelSpy = jest.spyOn(RemindersService, "cancelReminderIds").mockResolvedValue();

      const conversionPromise = EntityCommandService.convertHabitToTask("habit-1", "ws-convert", { skipEvents: true, skipAnalytics: true });

      await conversionPaused;

      const tasks = await TaskRepository.getTasks("ws-convert");
      const taskKeys = Object.keys(tasks);
      const newTaskId = taskKeys[0];
      const task = tasks[newTaskId];

      // Mutate ONLY notificationIds, leaving triggerAt and enabled the same
      // Because Date.now is mocked to fixedTime, updatedAt will be identical
      task.reminder = { enabled: true, triggerAt: 1000, notificationIds: ["new-id-1", "new-id-2"] };
      await TaskRepository.saveTask(task);

      resumeConversion!();
      
      await conversionPromise;

      const updatedTasks = await TaskRepository.getTasks("ws-convert");
      const updatedTask = updatedTasks[newTaskId];
      
      // Clean up the spy before assertions in case it affects expect
      dateNowSpy.mockRestore();

      expect(updatedTask.reminder?.notificationIds).toEqual(["new-id-1", "new-id-2"]);
      expect(cancelSpy).toHaveBeenCalledWith(["stale-id-1", "stale-id-2"], expect.anything());
    });
  });
});
