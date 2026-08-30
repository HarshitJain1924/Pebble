import { Alert, Platform } from "react-native";

import { getNotificationPayload } from "@/services/scheduling/notification-routes";
import { DAY_MS } from "@/services/storage/storage.service";
import { type SchedulerRecurrence, recurrenceRuleToScheduler } from "@/services/scheduling/recurrence-mapper";
import { type NotificationPurpose, buildNotificationLogicalSignature } from "@/services/notifications/notification-identity";

export type ReminderKind = "todo" | "habit";

export type ReminderContext = {
  title: string;
  remainingCount?: number;
  totalCount?: number;
  streak?: number;
  bestStreak?: number;
};

export type ReminderScheduleOptions = {
  kind: ReminderKind;
  itemId: string;
  title: string;
  channelId?: string;
  category?: string;
  oneTimeAt?: Date;
  dailyTime?: {
    hour: number;
    minute: number;
  };
  dailyDays?: number[]; // 0 = Sunday .. 6 = Saturday
  escalationMinutes?: number[];
  context?: ReminderContext;
  /** Only accepts the scheduler's internal recurrence format. */
  recurrence?: SchedulerRecurrence;
  purpose?: NotificationPurpose;
};

export type ScheduledReminderBatch = {
  primaryId?: string;
  ids: string[];
  alarmTime?: number;
  reminderHour?: number;
  reminderMinute?: number;
  escalationMinutes?: number[];
};

const DEFAULT_ESCALATION_MINUTES = [120, 240];

// ─── Web reminder loop registry ──────────────────────────────────────────────
// Recurring web reminders (interval/daily/weekly) are implemented as an initial
// setTimeout that creates a repeating setInterval on first fire. Because the
// interval only exists after the timeout fires, its raw id cannot be returned
// from scheduleReminderBatch() synchronously. To keep every handle cancellable
// we register the loop under a stable key and return `web-interval-<key>`
// immediately; cancelReminderIds() resolves the key through this registry and
// clears both the pending initial timeout and (once created) the interval.
type WebReminderLoop = {
  timeoutId: ReturnType<typeof setTimeout>;
  intervalId: ReturnType<typeof setInterval> | null;
};
const webReminderLoops = new Map<string, WebReminderLoop>();
let webReminderLoopSeq = 0;

async function loadNotifications() {
  return import("expo-notifications");
}

function getNotificationBody(
  kind: ReminderKind,
  context: ReminderContext,
  level: number,
) {
  if (kind === "habit") {
    if (level === 0) {
      return `🎯 ${context.title} is waiting for today`;
    }
    if (level === 1 && typeof context.streak === "number") {
      return `🔥 Your ${context.streak}-day streak is at risk`;
    }
    if (level === 2 && typeof context.remainingCount === "number") {
      return `⚠ You still have ${context.remainingCount} habits left today`;
    }
    return `⚡ Final habit reminder: ${context.title}`;
  }

  if (level === 0) {
    return `🎯 Complete ${context.title} before midnight`;
  }
  if (level === 1 && typeof context.remainingCount === "number") {
    return `⚠ You still have ${context.remainingCount} tasks left today`;
  }
  return `🔥 Final warning: ${context.title}`;
}

function getNextOccurrenceDate(hour: number, minute: number) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getNextOccurrenceForWeekday(
  weekdayJs: number,
  hour: number,
  minute: number,
) {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);

  const today = now.getDay(); // 0..6
  let daysAway = (weekdayJs - today + 7) % 7;

  // If it's today but the time already passed, schedule for next week
  if (daysAway === 0 && candidate.getTime() <= now.getTime()) {
    daysAway = 7;
  }

  candidate.setDate(candidate.getDate() + daysAway);
  return candidate;
}

function addMinutesToClock(
  hour: number,
  minute: number,
  offsetMinutes: number,
) {
  const base = new Date(2020, 0, 1, hour, minute, 0, 0);
  base.setMinutes(base.getMinutes() + offsetMinutes);
  return {
    hour: base.getHours(),
    minute: base.getMinutes(),
  };
}

function buildNotificationData(
  kind: ReminderKind,
  itemId: string,
  escalationLevel: number,
  purpose: NotificationPurpose = escalationLevel > 0 ? "escalation" : "reminder",
) {
  const logicalSignature = buildNotificationLogicalSignature(kind, itemId, purpose);
  return {
    type: kind,
    itemId,
    escalationLevel,
    logicalSignature,
    purpose,
  };
}

async function ensureWebPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  const permission = await (Notification as any).requestPermission();
  return permission === "granted";
}

function notifyFallback(title: string, body: string) {
  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body });
      return;
    }
  } catch {
    // ignore
  }

  Alert.alert(title, body);
}

// Schedules a repeating web reminder loop. The returned loopId is stable and
// synchronously available to the caller (unlike the interval handle, which is
// only created after the initial timeout fires), so cancelReminderIds() can
// always cancel both the pending initial timeout and the eventual interval.
function scheduleWebReminderLoop(
  title: string,
  body: string,
  initialDelay: number,
  repeatMs: number,
): { loopId: string; timeoutId: ReturnType<typeof setTimeout> } {
  const loopKey = `loop-${++webReminderLoopSeq}`;
  const timeoutId = setTimeout(() => {
    notifyFallback(title, body);
    const intervalId = setInterval(() => {
      notifyFallback(title, body);
    }, repeatMs);
    const loop = webReminderLoops.get(loopKey);
    if (loop) {
      loop.intervalId = intervalId;
    } else {
      // Cancelled between scheduling and the initial fire — stop the interval
      // we just created so no orphan loop keeps notifying.
      clearInterval(intervalId);
    }
  }, initialDelay);
  webReminderLoops.set(loopKey, { timeoutId, intervalId: null });
  return { loopId: `web-interval-${loopKey}`, timeoutId };
}

export async function cancelReminderIds(
  ids?: string[],
  options?: { throwOnError?: boolean }
) {
  if (!ids?.length) {
    return;
  }

  try {
    await Promise.all(
      ids.map(async (id) => {
        if (id.startsWith("web-timeout-")) {
          clearTimeout(Number(id.replace("web-timeout-", "")));
          return;
        }

        if (id.startsWith("web-interval-")) {
          const loopKey = id.replace("web-interval-", "");
          const loop = webReminderLoops.get(loopKey);
          if (loop) {
            clearTimeout(loop.timeoutId);
            if (loop.intervalId) clearInterval(loop.intervalId);
            webReminderLoops.delete(loopKey);
            return;
          }
          // Legacy numeric handle (pre-registry format) or a dead handle left
          // over from a previous page session after a reload.
          if (/^\d+$/.test(loopKey)) clearInterval(Number(loopKey));
          return;
        }

        const Notifications = await loadNotifications();
        await Notifications.cancelScheduledNotificationAsync(id);
      }),
    );
  } catch (e) {
    if (options?.throwOnError) {
      console.warn("[cancelReminderIds] Failed (strict mode):", e);
      throw e;
    } else {
      console.warn("[cancelReminderIds] Swallowed error (tolerant mode):", e);
    }
  }
}

// Request Android exact-alarm permission (best-effort). Opens settings/intent.
export async function requestExactAlarmPermission(): Promise<boolean> {
  try {
    if (Platform.OS !== "android") return true;
    const IntentLauncher = await import("expo-intent-launcher");

    // ACTION to request exact alarm permission introduced in Android 12
    // Best-effort: launch the request action; fall back to app notification settings
    try {
      // This action may not be available on all Android versions/devices.
      // If it fails, fall back to app notification settings screen.
      // Note: startActivityAsync accepts a string action.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await IntentLauncher.startActivityAsync(
        "android.app.action.REQUEST_SCHEDULE_EXACT_ALARM",
      );
      return true;
    } catch {
      // Fallback: open app settings where user can toggle exact alarm permission.
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await IntentLauncher.startActivityAsync(
          (IntentLauncher as any).ACTION_APPLICATION_DETAILS_SETTINGS || "android.settings.APPLICATION_DETAILS_SETTINGS",
          {
            data: `package:${require("expo-application").default?.nativeApplicationId || ""}`,
          },
        );
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

// Debug helpers: list scheduled notifications and cancel them all.
export async function listScheduledNotifications(): Promise<any[]> {
  try {
    const Notifications = await loadNotifications();
    if (typeof Notifications.getAllScheduledNotificationsAsync === "function") {
      return await Notifications.getAllScheduledNotificationsAsync();
    }
    return [];
  } catch {
    return [];
  }
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    if (
      typeof Notifications.cancelAllScheduledNotificationsAsync === "function"
    ) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch {
    // ignore
  }
}

export async function scheduleReminderBatch(
  options: ReminderScheduleOptions,
): Promise<ScheduledReminderBatch> {
  const escalationMinutes = options.escalationMinutes !== undefined
    ? options.escalationMinutes
    : DEFAULT_ESCALATION_MINUTES;

  const resolvedChannelId =
    options.channelId ||
    (Platform.OS === "android"
      ? options.kind === "habit"
        ? "daily-habits"
        : "todo-reminders"
      : undefined);

  // Integrate settings checks (Quiet Hours and Category subscriptions)
  let settings: any = null;
  let isCurrentlyInQuietHours: any = null;
  try {
    const settingsService = require("@/features/settings/services/settings.service");
    isCurrentlyInQuietHours = settingsService.isCurrentlyInQuietHours;
    settings = await settingsService.getSettings();

    // 1. Check if category is subscribed
    const categoryKey = options.category || options.kind;
    if (settings && settings.categories && settings.categories[categoryKey] === false) {
      return { ids: [], escalationMinutes };
    }

    // 2. Check if oneTimeAt falls in quiet hours
    if (options.oneTimeAt) {
      if (isCurrentlyInQuietHours && isCurrentlyInQuietHours(settings, options.oneTimeAt.getHours())) {
        return { ids: [], escalationMinutes };
      }
    }

    // 3. Check if dailyTime falls in quiet hours
    if (options.dailyTime) {
      if (isCurrentlyInQuietHours && isCurrentlyInQuietHours(settings, options.dailyTime.hour)) {
        return { ids: [], escalationMinutes };
      }
    }
  } catch {
    // fallback if service isn't initialized yet
  }

  const offsets = options.recurrence?.type === "interval" ? [0] : [0, ...escalationMinutes];
  const ids: string[] = [];
  const isWeb = Platform.OS === "web";

  for (const [index, offset] of offsets.entries()) {
    const body = getNotificationBody(
      options.kind,
      options.context ?? { title: options.title },
      index,
    );
    const purpose = index === 0 ? (options.purpose || "reminder") : "escalation";
    const data = buildNotificationData(
      options.kind,
      options.itemId,
      index,
      purpose,
    );

    if (options.oneTimeAt) {
      const triggerDate = new Date(
        options.oneTimeAt.getTime() + offset * 60 * 1000,
      );
      if (settings && isCurrentlyInQuietHours && isCurrentlyInQuietHours(settings, triggerDate.getHours())) {
        console.log(`[scheduleReminderBatch] Skipping offset ${offset} for oneTimeAt because it falls inside Quiet Hours.`);
        continue;
      }
      const delay = triggerDate.getTime() - Date.now();
      if (delay <= 0) {
        continue;
      }

      if (isWeb) {
        const canNotify = await ensureWebPermission();

        const timeoutId = setTimeout(() => {
          if (canNotify) {
            notifyFallback("Task reminder", body);
            return;
          }
          notifyFallback("Task reminder", body);
        }, delay);

        ids.push(`web-timeout-${String(timeoutId)}`);
        continue;
      }

      const Notifications = await loadNotifications();
      const triggerObj: any = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: resolvedChannelId,
      };

      console.log("[scheduleReminderBatch] [Native Date] Scheduling request:", {
        kind: options.kind,
        itemId: options.itemId,
        title: options.title,
        triggerDate: triggerDate.toISOString(),
        triggerTimestamp: triggerDate.getTime(),
        channelId: resolvedChannelId,
      });

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title:
            options.kind === "habit" ? "Daily habit reminder" : "Task reminder",
          body,
          data,
        },
        trigger: triggerObj as any,
      });
      console.log("[scheduleReminderBatch] [Native Date] Expo Notification Scheduled. ID:", notificationId);
      ids.push(notificationId);
      continue;
    }

    if (options.recurrence) {
      if (options.recurrence.type === "interval") {
        const seconds = options.recurrence.unit === "hours"
          ? (options.recurrence.interval || 1) * 3600
          : (options.recurrence.interval || 1) * 86400;

        if (isWeb) {
          const { loopId, timeoutId } = scheduleWebReminderLoop(
            "Interval reminder",
            body,
            seconds * 1000,
            seconds * 1000,
          );
          ids.push(loopId);
          ids.push(`web-timeout-${String(timeoutId)}`);
          continue;
        }

        const Notifications = await loadNotifications();
        const triggerObj: any = {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          repeats: true,
          channelId: resolvedChannelId,
        };

        console.log("[scheduleReminderBatch] [Native Interval] Scheduling request:", {
          kind: options.kind,
          itemId: options.itemId,
          title: options.title,
          seconds,
          channelId: resolvedChannelId,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: options.kind === "habit" ? "Daily habit reminder" : "Task reminder",
            body,
            data,
          },
          trigger: triggerObj,
        });
        console.log("[scheduleReminderBatch] [Native Interval] Expo Notification Scheduled. ID:", notificationId);
        ids.push(notificationId);
        continue;
      }

      if (!options.dailyTime) {
        continue;
      }

      const adjusted = addMinutesToClock(
        options.dailyTime.hour,
        options.dailyTime.minute,
        offset,
      );

      if (settings && isCurrentlyInQuietHours && isCurrentlyInQuietHours(settings, adjusted.hour)) {
        console.log(`[scheduleReminderBatch] Skipping offset ${offset} for recurrence because it falls inside Quiet Hours.`);
        continue;
      }

      const Notifications = await loadNotifications();

      if (options.recurrence.type === "daily") {
        if (isWeb) {
          const nextTrigger = getNextOccurrenceDate(adjusted.hour, adjusted.minute);
          const initialDelay = nextTrigger.getTime() - Date.now();
          const { loopId, timeoutId } = scheduleWebReminderLoop(
            "Daily reminder",
            body,
            initialDelay,
            DAY_MS,
          );
          ids.push(loopId);
          ids.push(`web-timeout-${String(timeoutId)}`);
          continue;
        }

        const triggerObj: any = {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: adjusted.hour,
          minute: adjusted.minute,
          channelId: resolvedChannelId,
        };

        console.log("[scheduleReminderBatch] [Native Daily Recurrence] Scheduling request:", {
          kind: options.kind,
          itemId: options.itemId,
          title: options.title,
          hour: adjusted.hour,
          minute: adjusted.minute,
          channelId: resolvedChannelId,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: options.kind === "habit" ? "Daily habit reminder" : "Task reminder",
            body,
            data,
          },
          trigger: triggerObj,
        });
        console.log("[scheduleReminderBatch] [Native Daily Recurrence] Expo Notification Scheduled. ID:", notificationId);
        ids.push(notificationId);
        continue;
      }

      if (options.recurrence.type === "weekdays" || options.recurrence.type === "weekly") {
        const targetDays = options.recurrence.type === "weekdays"
          ? [1, 2, 3, 4, 5]
          : (options.recurrence.days && options.recurrence.days.length > 0
              ? options.recurrence.days
              : [new Date().getDay()]);

        for (const weekday of targetDays) {
          if (isWeb) {
            const nextTrigger = getNextOccurrenceForWeekday(weekday, adjusted.hour, adjusted.minute);
            const initialDelay = nextTrigger.getTime() - Date.now();
            const { loopId, timeoutId } = scheduleWebReminderLoop(
              "Weekly reminder",
              body,
              initialDelay,
              7 * DAY_MS,
            );
            ids.push(loopId);
            ids.push(`web-timeout-${String(timeoutId)}`);
            continue;
          }

          const platformWeekday = Math.min(Math.max(1 + weekday, 1), 7);
          const triggerObj: any = {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: platformWeekday,
            hour: adjusted.hour,
            minute: adjusted.minute,
            channelId: resolvedChannelId,
          };

          console.log("[scheduleReminderBatch] [Native Weekly Recurrence] Scheduling request:", {
            kind: options.kind,
            itemId: options.itemId,
            title: options.title,
            weekday: platformWeekday,
            hour: adjusted.hour,
            minute: adjusted.minute,
            channelId: resolvedChannelId,
          });

          const notifData = {
            ...data,
            weekday: platformWeekday,
          };

          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: options.kind === "habit" ? "Daily habit reminder" : "Task reminder",
              body,
              data: notifData,
            },
            trigger: triggerObj,
          });
          console.log("[scheduleReminderBatch] [Native Weekly Recurrence] Expo Notification Scheduled. ID:", notificationId);
          ids.push(notificationId);
        }
        continue;
      }

      if (options.recurrence.type === "monthly") {
        const dayOfMonth = options.recurrence.dayOfMonth || 1;
        
        if (isWeb) {
          const timeoutId = setTimeout(() => {
            notifyFallback("Monthly reminder", body);
          }, 30 * DAY_MS);
          ids.push(`web-timeout-${String(timeoutId)}`);
          continue;
        }

        const triggerObj: any = {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: dayOfMonth,
          hour: adjusted.hour,
          minute: adjusted.minute,
          channelId: resolvedChannelId,
        };

        console.log("[scheduleReminderBatch] [Native Monthly Recurrence] Scheduling request:", {
          kind: options.kind,
          itemId: options.itemId,
          title: options.title,
          day: dayOfMonth,
          hour: adjusted.hour,
          minute: adjusted.minute,
          channelId: resolvedChannelId,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: options.kind === "habit" ? "Daily habit reminder" : "Task reminder",
            body,
            data,
          },
          trigger: triggerObj,
        });
        console.log("[scheduleReminderBatch] [Native Monthly Recurrence] Expo Notification Scheduled. ID:", notificationId);
        ids.push(notificationId);
        continue;
      }
    }

    if (!options.dailyTime) {
      continue;
    }

    const adjusted = addMinutesToClock(
      options.dailyTime.hour,
      options.dailyTime.minute,
      offset,
    );

    if (settings && isCurrentlyInQuietHours && isCurrentlyInQuietHours(settings, adjusted.hour)) {
      console.log(`[scheduleReminderBatch] Skipping offset ${offset} for fallback daily/weekly because it falls inside Quiet Hours.`);
      continue;
    }

    // If the caller provided explicit weekdays, schedule each weekday separately.
    if (options.dailyDays && options.dailyDays.length > 0) {
      for (const weekday of options.dailyDays) {
        if (isWeb) {
          const canNotify = await ensureWebPermission();
          const nextTrigger = getNextOccurrenceForWeekday(
            weekday,
            adjusted.hour,
            adjusted.minute,
          );
          const initialDelay = nextTrigger.getTime() - Date.now();

          const { loopId, timeoutId } = scheduleWebReminderLoop(
            "Daily reminder",
            body,
            initialDelay,
            7 * DAY_MS,
          );

          ids.push(loopId);
          ids.push(`web-timeout-${String(timeoutId)}`);
          continue;
        }

        const Notifications = await loadNotifications();
        const platformWeekday = Math.min(Math.max(1 + weekday, 1), 7);
        const triggerObj: any = {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: platformWeekday,
          hour: adjusted.hour,
          minute: adjusted.minute,
          channelId: resolvedChannelId,
        };

        console.log("[scheduleReminderBatch] [Native Weekly] Scheduling request:", {
          kind: options.kind,
          itemId: options.itemId,
          title: options.title,
          weekday: platformWeekday,
          hour: adjusted.hour,
          minute: adjusted.minute,
          channelId: resolvedChannelId,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title:
              options.kind === "habit"
                ? "Daily habit reminder"
                : "Task reminder",
            body,
            data,
          },
          trigger: triggerObj as any,
        });
        console.log("[scheduleReminderBatch] [Native Weekly] Expo Notification Scheduled. ID:", notificationId);
        ids.push(notificationId);
      }
      continue;
    }

    // Fallback: daily every day
    if (isWeb) {
      const canNotify = await ensureWebPermission();
      const nextTrigger = getNextOccurrenceDate(adjusted.hour, adjusted.minute);
      const initialDelay = nextTrigger.getTime() - Date.now();

      const { loopId, timeoutId } = scheduleWebReminderLoop(
        "Daily reminder",
        body,
        initialDelay,
        DAY_MS,
      );

      ids.push(loopId);
      ids.push(`web-timeout-${String(timeoutId)}`);
      continue;
    }

    const Notifications = await loadNotifications();
    const triggerObj: any = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: adjusted.hour,
      minute: adjusted.minute,
      channelId: resolvedChannelId,
    };

    console.log("[scheduleReminderBatch] [Native Daily] Scheduling request:", {
      kind: options.kind,
      itemId: options.itemId,
      title: options.title,
      hour: adjusted.hour,
      minute: adjusted.minute,
      channelId: resolvedChannelId,
    });

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title:
          options.kind === "habit" ? "Daily habit reminder" : "Task reminder",
        body,
        data,
      },
      trigger: triggerObj as any,
    });
    console.log("[scheduleReminderBatch] [Native Daily] Expo Notification Scheduled. ID:", notificationId);
    ids.push(notificationId);
  }

  return {
    primaryId: ids[0],
    ids,
    alarmTime: options.oneTimeAt?.getTime(),
    reminderHour: options.dailyTime?.hour,
    reminderMinute: options.dailyTime?.minute,
    escalationMinutes,
  };
}

export function hasNotificationPayload(data: unknown) {
  return Boolean(getNotificationPayload(data));
}

import { type Task, type Habit } from "@/shared/types/domain.types";

export async function rescheduleTodoReminders(todo: Task): Promise<Task> {
  try {
    if (
      todo.reminder &&
      todo.reminder.enabled &&
      (todo.reminder.triggerAt > Date.now() || todo.recurrence)
    ) {
      // Cancel any previously scheduled notifications first so re-scheduling
      // never accumulates duplicate timers (exactly one active schedule per
      // reminder instance, even across reloads).
      if (todo.reminder.notificationIds?.length) {
        await cancelReminderIds(todo.reminder.notificationIds);
      }

      const triggerDate = new Date(todo.reminder.triggerAt);
      const hour = triggerDate.getHours();
      const minute = triggerDate.getMinutes();

      // If the task has recurrence, schedule as recurring (dailyTime + recurrence)
      // instead of one-time. This preserves recurring reminder semantics so
      // rescheduled notifications repeat according to the original recurrence rule.
      if (todo.recurrence) {
        const batch = await scheduleReminderBatch({
          kind: "todo",
          itemId: todo.id,
          title: todo.title,
          category: todo.categoryId,
          dailyTime: { hour, minute },
          dailyDays: todo.recurrence.daysOfWeek,
          recurrence: recurrenceRuleToScheduler(todo.recurrence),
          escalationMinutes: [120, 240],
          channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
        });
        return {
          ...todo,
          reminder: {
            ...todo.reminder,
            notificationIds: batch.ids,
          },
        };
      }

      // No recurrence: schedule as one-time notification (original behavior)
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: todo.id,
        title: todo.title,
        oneTimeAt: new Date(todo.reminder.triggerAt),
        category: todo.categoryId,
        escalationMinutes: [120, 240],
        channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      });
      return {
        ...todo,
        reminder: {
          ...todo.reminder,
          notificationIds: batch.ids,
        },
      };
    }
    return todo;
  } catch (e) {
    console.warn("Failed to reschedule todo reminders", e);
    return todo;
  }
}

export async function rescheduleHabitReminders(habit: Habit): Promise<Habit> {
  try {
    if (
      habit.reminder &&
      habit.reminder.enabled &&
      (habit.reminder.triggerAt > Date.now() || habit.recurrence)
    ) {
      // Cancel any previously scheduled notifications first so re-scheduling
      // never accumulates duplicate timers (exactly one active schedule per
      // reminder instance, even across reloads).
      if (habit.reminder.notificationIds?.length) {
        await cancelReminderIds(habit.reminder.notificationIds);
      }

      const triggerDate = new Date(habit.reminder.triggerAt);
      const hour = triggerDate.getHours();
      const minute = triggerDate.getMinutes();

      // If the habit has recurrence, schedule as recurring (dailyTime + recurrence)
      // instead of one-time. This preserves recurring reminder semantics so
      // rescheduled notifications repeat daily/weekly/monthly according to
      // the original recurrence rule, rather than firing once and stopping.
      if (habit.recurrence) {
        const batch = await scheduleReminderBatch({
          kind: "habit",
          itemId: habit.id,
          title: habit.title,
          category: habit.categoryId,
          dailyTime: { hour, minute },
          dailyDays: habit.recurrence.daysOfWeek,
          recurrence: recurrenceRuleToScheduler(habit.recurrence),
          escalationMinutes: [120, 240],
          channelId: Platform.OS === "android" ? "daily-habits" : undefined,
        });
        return {
          ...habit,
          reminder: {
            ...habit.reminder,
            notificationIds: batch.ids,
          },
        };
      }

      // No recurrence: schedule as one-time notification (original behavior)
      const batch = await scheduleReminderBatch({
        kind: "habit",
        itemId: habit.id,
        title: habit.title,
        oneTimeAt: new Date(habit.reminder.triggerAt),
        category: habit.categoryId,
        escalationMinutes: [120, 240],
        channelId: Platform.OS === "android" ? "daily-habits" : undefined,
      });
      return {
        ...habit,
        reminder: {
          ...habit.reminder,
          notificationIds: batch.ids,
        },
      };
    }
    return habit;
  } catch (e) {
    console.warn("Failed to reschedule habit reminders", e);
    return habit;
  }
}

/**
 * Web-only: re-arm reminder timers after a page reload. Native notifications
 * survive reloads inside the OS, but JS timers do not, so web reminders must
 * be re-scheduled through the canonical scheduler. The cancel-first semantics
 * of rescheduleTodoReminders() guarantee exactly one active schedule per
 * reminder even when this runs repeatedly (screen focus, state events, reloads).
 */
export async function rearmWebReminders(todos: Task[]): Promise<Task[]> {
  if (Platform.OS !== "web") {
    return todos;
  }
  const rearmed: Task[] = [];
  for (const todo of todos) {
    if (
      todo.reminder?.enabled &&
      todo.reminder.triggerAt &&
      (todo.reminder.triggerAt > Date.now() || todo.recurrence)
    ) {
      rearmed.push(await rescheduleTodoReminders(todo));
    } else {
      rearmed.push(todo);
    }
  }
  return rearmed;
}

