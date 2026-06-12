import AsyncStorage from "@react-native-async-storage/async-storage";
import { TODOS_STORAGE_KEY } from "./storage";

export interface CognitiveFlowStats {
  morningPct: number;
  afternoonPct: number;
  eveningPct: number;
  peakZone: string;
  icon: string;
}

export async function getCognitiveFlowStats(): Promise<CognitiveFlowStats> {
  let morning = 0;
  let afternoon = 0;
  let evening = 0;

  try {
    const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
    if (rawTodos) {
      const parsed = JSON.parse(rawTodos);
      const allTodos = Object.values(parsed.todos || {}).flat() as any[];
      allTodos.forEach((todo) => {
        if (todo.alarmTime) {
          const hour = new Date(todo.alarmTime).getHours();
          if (hour >= 5 && hour < 12) morning++;
          else if (hour >= 12 && hour < 17) afternoon++;
          else evening++;
        } else if (todo.reminderHour !== undefined) {
          const hour = todo.reminderHour;
          if (hour >= 5 && hour < 12) morning++;
          else if (hour >= 12 && hour < 17) afternoon++;
          else evening++;
        }
      });
    }

    const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
    if (rawHabits) {
      const parsed = JSON.parse(rawHabits);
      const allHabits = (parsed.dailyHabits || []) as any[];
      allHabits.forEach((habit) => {
        if (habit.reminderHour !== undefined) {
          const hour = habit.reminderHour;
          if (hour >= 5 && hour < 12) morning++;
          else if (hour >= 12 && hour < 17) afternoon++;
          else evening++;
        }
      });
    }
  } catch (e) {
    console.warn("Failed to calculate cognitive flow stats:", e);
  }

  const total = morning + afternoon + evening || 1;
  let peakZone = "Balanced Flow";
  let icon = "activity";
  if (morning > afternoon && morning > evening) {
    peakZone = "Morning Focus Peak";
    icon = "sun";
  } else if (afternoon > morning && afternoon > evening) {
    peakZone = "Afternoon Steady Flow";
    icon = "award";
  } else if (evening > morning && evening > afternoon) {
    peakZone = "Night Owl Momentum";
    icon = "moon";
  }

  return {
    morningPct: (morning / total) * 100,
    afternoonPct: (afternoon / total) * 100,
    eveningPct: (evening / total) * 100,
    peakZone,
    icon,
  };
}

export async function getOptimalHours(): Promise<number[]> {
  const stats = await getCognitiveFlowStats();
  if (stats.peakZone === "Morning Focus Peak") {
    return [8, 9, 10, 11]; // Morning Peak hours (8 AM - 12 PM)
  } else if (stats.peakZone === "Afternoon Steady Flow") {
    return [13, 14, 15, 16]; // Afternoon Peak hours (1 PM - 5 PM)
  } else if (stats.peakZone === "Night Owl Momentum") {
    return [18, 19, 20, 21]; // Evening/Night Peak hours (6 PM - 10 PM)
  }
  return [9, 10, 14, 15]; // Default balanced focus hours
}
