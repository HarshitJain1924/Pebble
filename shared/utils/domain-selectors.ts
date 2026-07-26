import type { Task, Habit, Checklist } from "@/shared/types/domain.types";

/**
 * Task Derived Selectors
 */
export function isTaskCompleted(task: Task): boolean {
  return task.status === "completed";
}

export function isTaskOverdue(task: Task, referenceDateKey?: string): boolean {
  if (isTaskCompleted(task) || !task.schedule?.date) return false;
  const todayKey = referenceDateKey || getTodayDateKey();
  return task.schedule.date < todayKey;
}

export function isTaskDueToday(task: Task, referenceDateKey?: string): boolean {
  if (!task.schedule?.date) return false;
  const todayKey = referenceDateKey || getTodayDateKey();
  return task.schedule.date === todayKey;
}

export function isTaskScheduled(task: Task): boolean {
  return !!(task.schedule?.date || task.schedule?.startTime);
}

export function hasTaskReminder(task: Task): boolean {
  return !!(task.reminder && task.reminder.enabled && task.reminder.triggerAt);
}

/**
 * Habit Derived Selectors
 */
export function isHabitCompletedToday(habit: Habit, referenceDateKey?: string): boolean {
  const todayKey = referenceDateKey || getTodayDateKey();
  return habit.completionHistory.some((entry) => entry.date === todayKey);
}

export function getHabitLastCompletedDate(habit: Habit): string | undefined {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return undefined;
  const dates = habit.completionHistory.map((c) => c.date).sort();
  return dates[dates.length - 1];
}

export function getHabitCurrentStreak(habit: Habit, referenceDateKey?: string): number {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return 0;
  
  const completedDates = new Set(habit.completionHistory.map((c) => c.date));
  const today = referenceDateKey || getTodayDateKey();
  const yesterday = getOffsetDateKey(1, today);

  let streak = 0;
  let checkOffset = 0;

  if (completedDates.has(today)) {
    streak = 1;
    checkOffset = 1;
    while (true) {
      const key = getOffsetDateKey(checkOffset, today);
      if (completedDates.has(key)) {
        streak++;
        checkOffset++;
      } else {
        break;
      }
    }
  } else if (completedDates.has(yesterday)) {
    streak = 1;
    checkOffset = 2;
    while (true) {
      const key = getOffsetDateKey(checkOffset, today);
      if (completedDates.has(key)) {
        streak++;
        checkOffset++;
      } else {
        break;
      }
    }
  }

  return streak;
}

export function getHabitBestStreak(habit: Habit): number {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return 0;

  const completedDates = Array.from(
    new Set(habit.completionHistory.map((c) => c.date))
  ).sort();

  if (completedDates.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < completedDates.length; i++) {
    const prevDate = new Date(completedDates[i - 1]);
    const currDate = new Date(completedDates[i]);
    const diffTime = currDate.getTime() - prevDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }

  return Math.max(maxStreak, getHabitCurrentStreak(habit));
}

export function getHabitCompletionRate(habit: Habit, windowDays: number = 30): number {
  if (!habit.completionHistory || habit.completionHistory.length === 0) return 0;
  const today = getTodayDateKey();
  let completedCount = 0;

  for (let i = 0; i < windowDays; i++) {
    const dateKey = getOffsetDateKey(i, today);
    if (habit.completionHistory.some((c) => c.date === dateKey)) {
      completedCount++;
    }
  }

  return Math.round((completedCount / windowDays) * 100);
}

/**
 * Checklist Derived Selectors
 */
export function getChecklistStats(checklist: Checklist) {
  const total = checklist.items ? checklist.items.length : 0;
  const completedCount = checklist.items
    ? checklist.items.filter((item) => item.completed).length
    : 0;
  const remainingCount = total - completedCount;
  const completionPercentage =
    total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return {
    total,
    completedCount,
    remainingCount,
    completionPercentage,
  };
}

/**
 * Helper Date Formatting Functions
 */
export function getTodayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getOffsetDateKey(offsetDays: number, fromDateKey?: string): string {
  const d = fromDateKey ? parseDateKey(fromDateKey) : new Date();
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
