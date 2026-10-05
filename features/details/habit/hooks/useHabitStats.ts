import { useCallback, useMemo, useState } from "react";
import { Palette } from "@/shared/constants/theme";
import type { Habit } from "@/shared/types/domain.types";
import { getDateKey, dayDiff, isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { getOffsetDateKey } from "@/shared/utils/date-key";

export type CalendarMarkedDates = Record<
  string,
  { selected: boolean; selectedColor: string; textColor: string }
>;

/**
 * Owns the Habit Detail completion statistics: total completions, completion
 * rate, the set of completed dates, and the marked-dates map for the
 * completion calendar. Statistics are bound to canonical Habit entity identity
 * and its `completionHistory` rather than transient habit titles. Streak values
 * themselves come directly from the habit entity via domain selectors.
 */
export function useHabitStats() {
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const [timesCompleted, setTimesCompleted] = useState<number | null>(null);
  const [completedDates, setCompletedDates] = useState<string[]>([]);

  const calendarMarkedDates = useMemo<CalendarMarkedDates>(() => {
    const marked: CalendarMarkedDates = {};
    completedDates.forEach((dateStr) => {
      marked[dateStr] = {
        selected: true,
        selectedColor: Palette.amber500,
        textColor: Palette.white,
      };
    });
    return marked;
  }, [completedDates]);

  const loadStats = useCallback(async (habit: Habit) => {
    try {
      if (!habit) {
        setTimesCompleted(0);
        setCompletedDates([]);
        setCompletionRate(0);
        return;
      }

      // Authoritative source: habit.completionHistory
      const rawHistory = habit.completionHistory;
      const history: Array<{ date: string; completedAt?: number }> = Array.isArray(rawHistory)
        ? rawHistory
        : Array.isArray((habit as any)?.completedDates)
        ? ((habit as any).completedDates as string[]).map((d: string) => ({ date: d, completedAt: 0 }))
        : [];

      // Unique sorted date strings where the habit was completed
      const dates: string[] = Array.from(
        new Set(
          history
            .map((entry) => entry.date)
            .filter((d): d is string => typeof d === "string" && d.length > 0)
        )
      ).sort();

      const completedCount = dates.length;
      setTimesCompleted(completedCount);
      setCompletedDates(dates);

      if (completedCount === 0) {
        setCompletionRate(0);
        return;
      }

      // Compute completion rate based on scheduled occurrences in the active window (up to 30 days)
      const today: string = getDateKey();
      const startKey: string = habit.createdAt
        ? getDateKey(new Date(habit.createdAt))
        : (dates[0] || today);

      const daysSinceCreation = Math.max(1, dayDiff(startKey, today) + 1);
      const windowDays = Math.min(30, daysSinceCreation);

      let scheduledDays = 0;
      let completedInWindow = 0;
      const completedSet = new Set(dates);

      for (let i = 0; i < windowDays; i++) {
        const dateKey = getOffsetDateKey(i, today);
        const isScheduled = habit.recurrence
          ? isRecurringOccurrenceForDate(habit, dateKey)
          : true;
        if (isScheduled) {
          scheduledDays++;
        }
        if (completedSet.has(dateKey)) {
          completedInWindow++;
        }
      }

      const denominator = Math.max(scheduledDays > 0 ? scheduledDays : windowDays, completedInWindow);
      const rate = Math.min(100, Math.round((completedInWindow / denominator) * 100));
      setCompletionRate(rate);
    } catch (e) {
      console.warn("Failed to load habit completion stats:", e);
    }
  }, []);

  return {
    completionRate,
    timesCompleted,
    completedDates,
    calendarMarkedDates,
    loadStats,
  };
}
