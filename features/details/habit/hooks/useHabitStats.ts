import { useCallback, useMemo, useState } from "react";

import { getAllHistory } from "@/services/analytics/productivity-history.service";

export type CalendarMarkedDates = Record<
  string,
  { selected: boolean; selectedColor: string; textColor: string }
>;

/**
 * Owns the Habit Detail completion statistics: total completions, completion
 * rate, the set of completed dates, and the marked-dates map for the
 * completion calendar. `loadStats` reproduces the pre-extraction calculations
 * exactly (history entries keyed by habit title); streak values themselves are
 * NOT computed here — they come straight from the habit entity as before.
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
        selectedColor: "#F59E0B",
        textColor: "#FFFFFF",
      };
    });
    return marked;
  }, [completedDates]);

  const loadStats = useCallback(async (habitTitle: string) => {
    try {
      const history = await getAllHistory();
      const relevantEntries = history.filter(
        (entry) => entry.totalHabits > 0,
      );
      const completedEntries = history.filter((entry) =>
        entry.completedHabitTitles?.includes(habitTitle),
      );
      const completedCount = completedEntries.length;
      setTimesCompleted(completedCount);

      // Gather all unique date strings where the habit was completed
      const dates = completedEntries
        .map((entry) => entry.date)
        .filter(Boolean);
      setCompletedDates(dates);

      if (relevantEntries.length > 0) {
        setCompletionRate(
          Math.round((completedCount / relevantEntries.length) * 100),
        );
      } else {
        setCompletionRate(0);
      }
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
