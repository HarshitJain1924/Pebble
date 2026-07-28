import { useState, useCallback } from "react";
import { Platform } from "react-native";
import { Task, Workspace } from "@/shared/types/domain.types";
import { isTaskCompleted } from "@/shared/utils/domain-selectors";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { syncWidgetData } from "@/services/analytics/widget-data.service";
import { emitStateChange } from "@/services/events/state-events";

export function useReminderState(
  todos: Record<string, Task[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>,
  selectedWorkspaceId: string,
  currentTodos: Task[],
  remainingCount: number,
  persistState: (listsToSave: Workspace[], selected: string, todosToSave: Record<string, Task[]>) => Promise<void>,
  workspaces: Workspace[],
) {
  const [alarmMenu, setAlarmMenu] = useState<string | null>(null);

  const scheduleAlarm = useCallback(async (todoId: string, minutesFromNow: number) => {
    const todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    if (todo.reminder?.notificationIds) {
      await cancelReminderIds(todo.reminder.notificationIds);
    }

    const triggerTime = Date.now() + minutesFromNow * 60 * 1000;
    const currentRemainingCount = currentTodos.filter((item) => !isTaskCompleted(item)).length;

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      category: todo.categoryId,
      oneTimeAt: new Date(triggerTime),
      escalationMinutes: [120, 240],
      channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      context: {
        title: todo.title,
        remainingCount: currentRemainingCount,
        totalCount: currentTodos.length,
      },
    });

    const listTodos = todos[selectedWorkspaceId] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId
        ? {
            ...item,
            reminder: {
              enabled: true,
              triggerAt: triggerTime,
              notificationIds: scheduled.ids,
            },
            updatedAt: Date.now(),
          }
        : item
    );
    const updated = { ...todos, [selectedWorkspaceId]: updatedList };
    setTodos(updated);
    await persistState(workspaces, selectedWorkspaceId, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  }, [todos, selectedWorkspaceId, currentTodos, persistState, workspaces]);

  const scheduleAlarmWithDays = useCallback(async (todoId: string, hour: number, minute: number, days?: number[]) => {
    const todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    if (todo.reminder?.notificationIds) {
      await cancelReminderIds(todo.reminder.notificationIds);
    }

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      category: todo.categoryId,
      dailyTime: { hour, minute },
      dailyDays: days,
      escalationMinutes: [120, 240],
      channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      context: {
        title: todo.title,
        remainingCount: remainingCount,
        totalCount: currentTodos.length,
      },
    });

    const triggerDate = new Date();
    triggerDate.setHours(hour, minute, 0, 0);

    const listTodos = todos[selectedWorkspaceId] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId
        ? {
            ...item,
            reminder: {
              enabled: true,
              triggerAt: triggerDate.getTime(),
              notificationIds: scheduled.ids,
            },
            updatedAt: Date.now(),
          }
        : item
    );
    const updated = { ...todos, [selectedWorkspaceId]: updatedList };
    setTodos(updated);
    await persistState(workspaces, selectedWorkspaceId, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
    setAlarmMenu(null);
  }, [todos, selectedWorkspaceId, remainingCount, currentTodos, persistState, workspaces]);

  const cancelAlarm = useCallback(async (todoId: string) => {
    const todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
    if (todo?.reminder?.notificationIds) {
      await cancelReminderIds(todo.reminder.notificationIds);
    }
    const listTodos = todos[selectedWorkspaceId] ?? [];
    const updatedList = listTodos.map((t) =>
      t.id === todoId
        ? {
            ...t,
            reminder: undefined,
            updatedAt: Date.now(),
          }
        : t
    );
    const updated = { ...todos, [selectedWorkspaceId]: updatedList };
    setTodos(updated);
    await persistState(workspaces, selectedWorkspaceId, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
    setAlarmMenu(null);
  }, [todos, selectedWorkspaceId, persistState, workspaces]);

  return {
    alarmMenu,
    setAlarmMenu,
    scheduleAlarm,
    scheduleAlarmWithDays,
    cancelAlarm,
  };
}