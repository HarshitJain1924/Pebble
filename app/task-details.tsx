import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { getDateKey } from "@/services/scheduling/recurrence.service";
import { TaskDetailContent } from "@/features/details/task/TaskDetailContent";
import { HabitDetailContent } from "@/features/details/habit/HabitDetailContent";

/**
 * Route orchestrator for the entity detail screens. Reads the route parameters,
 * selects the correct entity implementation, and owns navigation-level
 * concerns (back + post-conversion replace). All entity-specific state,
 * presentation, and mutations live in the Task/Habit DetailContent
 * components.
 */
export default function TaskDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    type?: "task" | "habit";
    workspaceId?: string;
    date?: string;
    hour?: string;
    time?: string;
  }>();
  const itemId = params.id;
  const itemType = params.type || (params.id?.startsWith("habit-") ? "habit" : "task");
  const isTask = itemType === "task";
  const selectedOccurrenceDate = params.date || getDateKey();

  let initialStartTime: string | undefined;
  if (params.time) {
    initialStartTime = params.time;
  } else if (params.hour !== undefined && params.hour !== "") {
    const parsedHour = Number(params.hour);
    if (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
      initialStartTime = `${String(parsedHour).padStart(2, "0")}:00`;
    }
  }

  if (isTask) {
    return (
      <TaskDetailContent
        taskId={itemId}
        workspaceId={params.workspaceId}
        selectedOccurrenceDate={selectedOccurrenceDate}
        initialStartTime={initialStartTime}
        onBack={() => router.back()}
        onConvertedToHabit={(habitId) =>
          router.replace(`/task-details?id=${habitId}&type=habit`)
        }
      />
    );
  }

  return (
    <HabitDetailContent
      habitId={itemId}
      workspaceId={params.workspaceId}
      selectedOccurrenceDate={selectedOccurrenceDate}
      onBack={() => router.back()}
      onConvertedToTask={(taskId) =>
        router.replace(`/task-details?id=${taskId}&type=task`)
      }
    />
  );
}
