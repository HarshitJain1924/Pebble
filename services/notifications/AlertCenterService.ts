import {
  WorkspaceRepository,
  TaskRepository,
  HabitRepository,
  ChecklistRepository,
} from "@/repositories";
import {
  Task,
  Habit,
  Checklist,
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import {
  AlertCenterItem,
  AlertCenterGroups,
  NotificationStatus,
} from "./notification.types";
import { isHabitCompletedToday } from "@/shared/utils/domain-selectors";
import { dateKeyFromDate, getTodayDateKey } from "@/shared/utils/date-key";
import { EntityCommandService } from "@/services/command/EntityCommandService";

/**
 * AlertCenterService
 * ──────────────────
 * Canonical projection service for the user-facing Alert Center.
 *
 * Invariant: Domain State is Authoritative.
 * Alert Center items are derived directly from domain entities + reminder configurations,
 * never from scattered local state or OS notifications.
 */
export class AlertCenterService {
  /**
   * Computes the next scheduled epoch timestamp for a recurring item whose initial
   * triggerAt timestamp may be in the past.
   */
  private static getNextRecurringTriggerEpoch(
    initialTriggerAt: number,
    recurrenceDays?: number[],
  ): number {
    const now = new Date();
    const triggerDate = new Date(initialTriggerAt);
    const hour = triggerDate.getHours();
    const minute = triggerDate.getMinutes();

    // If specific weekdays are specified
    if (recurrenceDays && recurrenceDays.length > 0) {
      const todayDay = now.getDay();
      // Look ahead up to 7 days to find the next active weekday
      for (let offset = 0; offset <= 7; offset++) {
        const candidateDate = new Date(now);
        candidateDate.setDate(candidateDate.getDate() + offset);
        candidateDate.setHours(hour, minute, 0, 0);

        const candidateDay = candidateDate.getDay();
        if (recurrenceDays.includes(candidateDay)) {
          if (candidateDate.getTime() > now.getTime()) {
            return candidateDate.getTime();
          }
        }
      }
    }

    // Default daily recurrence
    const todayCandidate = new Date(now);
    todayCandidate.setHours(hour, minute, 0, 0);

    if (todayCandidate.getTime() > now.getTime()) {
      return todayCandidate.getTime();
    }

    const tomorrowCandidate = new Date(now);
    tomorrowCandidate.setDate(tomorrowCandidate.getDate() + 1);
    tomorrowCandidate.setHours(hour, minute, 0, 0);
    return tomorrowCandidate.getTime();
  }

  /**
   * Builds human-readable time labels using local date boundaries.
   */
  static formatAlertTime(epochMs: number): string {
    const target = new Date(epochMs);
    const now = new Date();

    const targetDateKey = dateKeyFromDate(target);
    const todayKey = getTodayDateKey();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = dateKeyFromDate(tomorrow);

    const timeStr = target.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    if (targetDateKey === todayKey) {
      return `Today · ${timeStr}`;
    }
    if (targetDateKey === tomorrowKey) {
      return `Tomorrow · ${timeStr}`;
    }

    // Within current week, show weekday
    const dayDiff = Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (dayDiff > 1 && dayDiff < 7) {
      const weekday = target.toLocaleDateString([], { weekday: "long" });
      return `${weekday} · ${timeStr}`;
    }

    // Beyond a week, show month and day
    const monthDay = target.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    return `${monthDay} · ${timeStr}`;
  }

  /**
   * Formats relative duration for upcoming alerts (e.g. "in 2h", "in 30m").
   */
  static formatRelativeUpcoming(epochMs: number): string {
    const diffMs = epochMs - Date.now();
    if (diffMs <= 0) return "Due now";

    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `in ${Math.max(1, minutes)}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `in ${hours}h`;

    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  }

  /**
   * Formats relative duration for overdue alerts (e.g. "20m overdue").
   */
  static formatRelativeOverdue(epochMs: number): string {
    const diffMs = Date.now() - epochMs;
    if (diffMs <= 0) return "Just now";

    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)}m overdue`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h overdue`;

    const days = Math.floor(hours / 24);
    return `${days}d overdue`;
  }

  /**
   * Loads all authoritative domain entities with reminders and projects them into
   * structured Alert Center groups.
   */
  static async getAlertCenterData(): Promise<AlertCenterGroups> {
    const workspaces = await WorkspaceRepository.getWorkspaces();
    const activeWorkspaces = workspaces.filter((w) => !w.archivedAt);
    const workspaceIds = Array.from(
      new Set([
        INBOX_WORKSPACE_ID,
        MY_PEBBLES_WORKSPACE_ID,
        ...activeWorkspaces.map((w) => w.id),
      ]),
    );

    const items: AlertCenterItem[] = [];
    const seenEntities = new Set<string>();
    const now = Date.now();
    const overdueThreshold = now - 60 * 1000; // 1 minute grace period

    for (const wsId of workspaceIds) {
      // 1. Tasks
      const tasksMap = await TaskRepository.getTasks(wsId);
      for (const task of Object.values(tasksMap)) {
        if (task.archivedAt || task.status === "completed") continue;
        if (!task.reminder?.enabled || !task.reminder?.triggerAt) continue;
        const alertId = `todo:${task.id}`;
        if (seenEntities.has(alertId)) continue;
        seenEntities.add(alertId);

        const isRecurring = Boolean(task.recurrence);
        let effectiveTriggerAt = task.reminder.triggerAt;

        if (isRecurring && task.reminder.triggerAt < now) {
          effectiveTriggerAt = this.getNextRecurringTriggerEpoch(
            task.reminder.triggerAt,
            task.recurrence?.daysOfWeek,
          );
        }

        let status: NotificationStatus = "scheduled";
        if (!isRecurring && task.reminder.triggerAt < overdueThreshold) {
          status = "overdue";
        } else if (effectiveTriggerAt <= now + 60 * 60 * 1000) {
          status = "due_soon";
        }

        const recurrenceLabel = task.recurrence
          ? task.recurrence.frequency === "daily"
            ? "Daily"
            : task.recurrence.frequency === "weekly"
              ? "Weekly"
              : "Recurring"
          : undefined;

        items.push({
          id: alertId,
          entityId: task.id,
          entityType: "todo",
          title: task.title,
          triggerAt: effectiveTriggerAt,
          status,
          workspaceId: task.workspaceId,
          categoryId: task.categoryId,
          meta: {
            isRecurring,
            recurrenceLabel,
            timeLabel: this.formatAlertTime(effectiveTriggerAt),
            relativeLabel:
              status === "overdue"
                ? this.formatRelativeOverdue(task.reminder.triggerAt)
                : this.formatRelativeUpcoming(effectiveTriggerAt),
          },
        });
      }

      // 2. Habits
      const habitsMap = await HabitRepository.getHabits(wsId);
      for (const habit of Object.values(habitsMap)) {
        if (habit.archivedAt) continue;
        if (!habit.reminder?.enabled || !habit.reminder?.triggerAt) continue;
        const alertId = `habit:${habit.id}`;
        if (seenEntities.has(alertId)) continue;
        seenEntities.add(alertId);

        const isCompletedToday = isHabitCompletedToday(habit);
        const nextTriggerAt = this.getNextRecurringTriggerEpoch(
          habit.reminder.triggerAt,
          habit.recurrence?.daysOfWeek,
        );

        // For habits, even if past today's alarm, it's a recurring daily commitment
        // not a missed single-shot task. If completed today, scheduled for next cycle.
        const status: NotificationStatus = "scheduled";

        items.push({
          id: alertId,
          entityId: habit.id,
          entityType: "habit",
          title: habit.title,
          triggerAt: nextTriggerAt,
          status,
          workspaceId: habit.workspaceId,
          categoryId: habit.categoryId,
          meta: {
            streak: habit.streak ?? 0,
            bestStreak: habit.bestStreak ?? 0,
            isRecurring: true,
            recurrenceLabel: isCompletedToday ? "Completed today" : "Daily",
            timeLabel: this.formatAlertTime(nextTriggerAt),
            relativeLabel: this.formatRelativeUpcoming(nextTriggerAt),
          },
        });
      }

      // 3. Checklists
      const checklistsMap = await ChecklistRepository.getChecklists(wsId);
      for (const checklist of Object.values(checklistsMap)) {
        if (checklist.archivedAt) continue;
        if (!checklist.reminder?.enabled || !checklist.reminder?.triggerAt) continue;
        const alertId = `checklist:${checklist.id}`;
        if (seenEntities.has(alertId)) continue;
        seenEntities.add(alertId);

        const totalCount = checklist.items?.length ?? 0;
        const completedCount = checklist.items?.filter((i) => i.completed).length ?? 0;
        const isAllCompleted = totalCount > 0 && completedCount === totalCount;
        const isRecurring = Boolean(checklist.recurrence);

        // If non-recurring and all items completed, reminder is satisfied
        if (!isRecurring && isAllCompleted) continue;

        let effectiveTriggerAt = checklist.reminder.triggerAt;
        if (isRecurring && checklist.reminder.triggerAt < now) {
          effectiveTriggerAt = this.getNextRecurringTriggerEpoch(
            checklist.reminder.triggerAt,
            checklist.recurrence?.daysOfWeek,
          );
        }

        let status: NotificationStatus = "scheduled";
        if (!isRecurring && checklist.reminder.triggerAt < overdueThreshold) {
          status = "overdue";
        } else if (effectiveTriggerAt <= now + 60 * 60 * 1000) {
          status = "due_soon";
        }

        items.push({
          id: alertId,
          entityId: checklist.id,
          entityType: "checklist",
          title: checklist.title,
          triggerAt: effectiveTriggerAt,
          status,
          workspaceId: checklist.workspaceId,
          categoryId: checklist.categoryId,
          meta: {
            completedCount,
            totalCount,
            isRecurring,
            recurrenceLabel: isRecurring ? "Recurring" : undefined,
            timeLabel: this.formatAlertTime(effectiveTriggerAt),
            relativeLabel:
              status === "overdue"
                ? this.formatRelativeOverdue(checklist.reminder.triggerAt)
                : this.formatRelativeUpcoming(effectiveTriggerAt),
          },
        });
      }
    }

    // 4. Partition into canonical sections
    const needsAttention: AlertCenterItem[] = [];
    const upNext: AlertCenterItem[] = [];
    const later: AlertCenterItem[] = [];

    const upcomingWindow = now + 24 * 60 * 60 * 1000; // Next 24 hours

    for (const item of items) {
      if (item.status === "overdue") {
        needsAttention.push(item);
      } else if (item.triggerAt <= upcomingWindow) {
        upNext.push(item);
      } else {
        later.push(item);
      }
    }

    // Chronological sorting
    needsAttention.sort((a, b) => a.triggerAt - b.triggerAt);
    upNext.sort((a, b) => a.triggerAt - b.triggerAt);
    later.sort((a, b) => a.triggerAt - b.triggerAt);

    return {
      needsAttention,
      upNext,
      later,
      all: items,
    };
  }

  /**
   * Action: Mark task complete directly through canonical EntityCommandService.
   */
  static async completeTask(taskId: string, workspaceId: string): Promise<void> {
    await EntityCommandService.completeTask(taskId, workspaceId);
  }

  /**
   * Action: Complete habit for today directly through canonical EntityCommandService.
   */
  static async completeHabit(habitId: string, workspaceId: string): Promise<void> {
    await EntityCommandService.completeHabit(habitId, workspaceId);
  }

  /**
   * Action: Cancel reminder directly through canonical EntityCommandService.
   */
  static async cancelReminder(
    entityType: "todo" | "habit" | "checklist",
    entityId: string,
    workspaceId: string,
  ): Promise<void> {
    if (entityType === "todo") {
      await EntityCommandService.updateTask(entityId, workspaceId, {
        reminder: undefined,
      });
    } else if (entityType === "habit") {
      await EntityCommandService.updateHabit(entityId, workspaceId, {
        reminder: undefined,
      });
    } else if (entityType === "checklist") {
      await EntityCommandService.updateChecklist(entityId, workspaceId, {
        reminder: undefined,
      });
    }
  }
}
