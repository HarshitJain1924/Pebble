import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

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
    const { UiStateRepository, TaskRepository, HabitRepository } =
      await import("@/repositories");
    const activeWorkspace =
      (await UiStateRepository.getUiState()).activeWorkspaceId || INBOX_WORKSPACE_ID;

    // Load Tasks
    const tasksMap = await TaskRepository.getTasks(activeWorkspace);
    const allTodos = Object.values(tasksMap).filter((t: any) => !t.archivedAt);
    allTodos.forEach((todo: any) => {
      let hour: number | undefined;
      if (todo.reminder?.triggerAt) {
        hour = new Date(todo.reminder.triggerAt).getHours();
      } else if (todo.schedule?.startTime) {
        const parts = todo.schedule.startTime.split(":").map(Number);
        hour = parts[0];
      }

      if (hour !== undefined) {
        if (hour >= 5 && hour < 12) morning++;
        else if (hour >= 12 && hour < 17) afternoon++;
        else evening++;
      }
    });

    // Load Habits
    const habitsMap = await HabitRepository.getHabits(activeWorkspace);
    const allHabits = Object.values(habitsMap).filter((h: any) => !h.archivedAt);
    allHabits.forEach((habit: any) => {
      let hour: number | undefined;
      if (habit.reminder?.triggerAt) {
        hour = new Date(habit.reminder.triggerAt).getHours();
      }

      if (hour !== undefined) {
        if (hour >= 5 && hour < 12) morning++;
        else if (hour >= 12 && hour < 17) afternoon++;
        else evening++;
      }
    });
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
    return [8, 9, 10, 11];
  } else if (stats.peakZone === "Afternoon Steady Flow") {
    return [13, 14, 15, 16];
  } else if (stats.peakZone === "Night Owl Momentum") {
    return [18, 19, 20, 21];
  }
  return [9, 10, 14, 15];
}
