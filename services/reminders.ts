import { Alert, Platform } from "react-native";

import { getNotificationPayload } from "./notificationRoutes";
import { DAY_MS } from "./storage";

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
  recurrence?: {
    type: "daily" | "weekdays" | "weekly" | "monthly" | "interval";
    interval?: number;
    unit?: "hours" | "days";
    days?: number[];
    dayOfMonth?: number;
  };
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
) {
  return {
    type: kind,
    itemId,
    escalationLevel,
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

export async function cancelReminderIds(ids?: string[]) {
  if (!ids?.length) {
    return;
  }

  await Promise.all(
    ids.map(async (id) => {
      if (id.startsWith("web-timeout-")) {
        clearTimeout(Number(id.replace("web-timeout-", "")));
        return;
      }

      if (id.startsWith("web-interval-")) {
        clearInterval(Number(id.replace("web-interval-", "")));
        return;
      }

      const Notifications = await loadNotifications();
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    }),
  );
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
  const escalationMinutes = options.escalationMinutes?.length
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
    const settingsService = require("./settingsService");
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
    const data = buildNotificationData(options.kind, options.itemId, index);

    if (options.oneTimeAt) {
      const triggerDate = new Date(
        options.oneTimeAt.getTime() + offset * 60 * 1000,
      );
      if (settings && isCurrentlyInQuietHours && isCurrentlyInQuietHours(settings, triggerDate.getHours())) {
        console.log(`[scheduleReminderBatch] Skipping offset ${offset} for oneTimeAt because it falls inside Quiet Hours.`);
        continue;
      }
      if (isWeb) {
        const canNotify = await ensureWebPermission();
        const delay = triggerDate.getTime() - Date.now();
        if (delay <= 0) {
          continue;
        }

        const timeoutId = setTimeout(() => {
          if (canNotify) {
            notifyFallback("Todo reminder", body);
            return;
          }
          notifyFallback("Todo reminder", body);
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
            options.kind === "habit" ? "Daily habit reminder" : "Todo reminder",
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
          const timeoutId = setTimeout(() => {
            notifyFallback("Interval reminder", body);
            const intervalId = setInterval(() => {
              notifyFallback("Interval reminder", body);
            }, seconds * 1000);
            ids.push(`web-interval-${String(intervalId)}`);
          }, seconds * 1000);
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
            title: options.kind === "habit" ? "Daily habit reminder" : "Todo reminder",
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
          const timeoutId = setTimeout(() => {
            notifyFallback("Daily reminder", body);
            const intervalId = setInterval(() => {
              notifyFallback("Daily reminder", body);
            }, DAY_MS);
            ids.push(`web-interval-${String(intervalId)}`);
          }, initialDelay);
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
            title: options.kind === "habit" ? "Daily habit reminder" : "Todo reminder",
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
            const timeoutId = setTimeout(() => {
              notifyFallback("Weekly reminder", body);
              const intervalId = setInterval(() => {
                notifyFallback("Weekly reminder", body);
              }, 7 * DAY_MS);
              ids.push(`web-interval-${String(intervalId)}`);
            }, initialDelay);
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

          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: options.kind === "habit" ? "Daily habit reminder" : "Todo reminder",
              body,
              data,
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
            title: options.kind === "habit" ? "Daily habit reminder" : "Todo reminder",
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

          const timeoutId = setTimeout(() => {
            notifyFallback("Daily reminder", body);
            const intervalId = setInterval(() => {
              notifyFallback("Daily reminder", body);
            }, 7 * DAY_MS);
            ids.push(`web-interval-${String(intervalId)}`);
          }, initialDelay);

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
                : "Todo reminder",
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

      const timeoutId = setTimeout(() => {
        notifyFallback("Daily reminder", body);
        const intervalId = setInterval(() => {
          notifyFallback("Daily reminder", body);
        }, DAY_MS);
        ids.push(`web-interval-${String(intervalId)}`);
      }, initialDelay);

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
          options.kind === "habit" ? "Daily habit reminder" : "Todo reminder",
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

import { type Todo, type Habit } from "@/modules/types";

export async function rescheduleTodoReminders(todo: Todo): Promise<Todo> {
  const updatedTodo = { ...todo };
  try {
    if (todo.alarmTime && todo.alarmTime > Date.now()) {
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: todo.id,
        title: todo.title,
        oneTimeAt: new Date(todo.alarmTime),
        category: todo.category,
      });
      updatedTodo.alarmId = batch.primaryId;
      updatedTodo.notificationIds = batch.ids;
    } else if (todo.reminderHour !== undefined && todo.reminderMinute !== undefined) {
      const batch = await scheduleReminderBatch({
        kind: "todo",
        itemId: todo.id,
        title: todo.title,
        dailyTime: { hour: todo.reminderHour, minute: todo.reminderMinute },
        dailyDays: todo.reminderDays,
        recurrence: todo.recurrence,
        category: todo.category,
      });
      updatedTodo.notificationIds = batch.ids;
    }
  } catch (e) {
    console.warn("Failed to reschedule todo reminders", e);
  }
  return updatedTodo;
}

export async function rescheduleHabitReminders(habit: Habit): Promise<Habit> {
  const updatedHabit = { ...habit };
  try {
    if (habit.reminderHour !== undefined && habit.reminderMinute !== undefined) {
      const batch = await scheduleReminderBatch({
        kind: "habit",
        itemId: habit.id,
        title: habit.title,
        dailyTime: { hour: habit.reminderHour, minute: habit.reminderMinute },
        dailyDays: habit.reminderDays,
        recurrence: habit.recurrence,
        category: habit.category,
      });
      updatedHabit.notificationIds = batch.ids;
    }
  } catch (e) {
    console.warn("Failed to reschedule habit reminders", e);
  }
  return updatedHabit;
}

