import { useState, useCallback } from "react";
import { Platform } from "react-native";
import { Todo, TaskList } from "../../types";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/reminders";
import { syncWidgetData } from "@/services/widgetData";
import { emitStateChange } from "@/services/stateEvents";
import { formatAlarm } from "../utils/taskUtils";

export function useReminderState(
  todos: Record<string, Todo[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Todo[]>>>,
  selectedList: string,
  currentTodos: Todo[],
  remainingCount: number,
  persistState: (listsToSave: TaskList[], selected: string, todosToSave: Record<string, Todo[]>) => Promise<void>,
  lists: TaskList[],
) {
  const [alarmMenu, setAlarmMenu] = useState<string | null>(null);

  const scheduleAlarm = useCallback(async (todoId: string, minutesFromNow: number) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    await cancelReminderIds(todo.notificationIds ?? (todo.alarmId ? [todo.alarmId] : []));

    const triggerTime = Date.now() + minutesFromNow * 60 * 1000;
    const currentRemainingCount = currentTodos.filter((item) => !item.completed).length;

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      category: todo.category,
      oneTimeAt: new Date(triggerTime),
      escalationMinutes: [120, 240],
      channelId: Platform.OS === "android" ? "todo-reminders" : undefined,
      context: {
        title: todo.title,
        remainingCount: currentRemainingCount,
        totalCount: currentTodos.length,
      },
    });

    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId
        ? {
            ...item,
            alarmId: scheduled.primaryId,
            notificationIds: scheduled.ids,
            alarmTime: triggerTime,
            reminderHour: undefined,
            reminderMinute: undefined,
            escalationMinutes: scheduled.escalationMinutes,
          }
        : item
    );
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  }, [todos, selectedList, currentTodos, persistState, lists]);

  const scheduleAlarmWithDays = useCallback(async (todoId: string, hour: number, minute: number, days?: number[]) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    await cancelReminderIds(todo.notificationIds ?? (todo.alarmId ? [todo.alarmId] : []));

    const scheduled = await scheduleReminderBatch({
      kind: "todo",
      itemId: todoId,
      title: todo.title,
      category: todo.category,
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

    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId
        ? {
            ...item,
            alarmId: scheduled.primaryId,
            notificationIds: scheduled.ids,
            alarmTime: scheduled.alarmTime,
            reminderHour: scheduled.reminderHour,
            reminderMinute: scheduled.reminderMinute,
            reminderDays: days,
            escalationMinutes: scheduled.escalationMinutes,
          }
        : item
    );
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
    setAlarmMenu(null);
  }, [todos, selectedList, remainingCount, currentTodos, persistState, lists]);

  const cancelAlarm = useCallback(async (todoId: string) => {
    const todo = (todos[selectedList] ?? []).find((t) => t.id === todoId);
    await cancelReminderIds(todo?.notificationIds ?? (todo?.alarmId ? [todo.alarmId] : []));
    const listTodos = todos[selectedList] ?? [];
    const updatedList = listTodos.map((t) =>
      t.id === todoId
        ? {
            ...t,
            alarmId: undefined,
            alarmTime: undefined,
            notificationIds: [],
            escalationMinutes: undefined,
          }
        : t
    );
    const updated = { ...todos, [selectedList]: updatedList };
    setTodos(updated);
    await persistState(lists, selectedList, updated);
    void syncWidgetData().catch(() => {});
    emitStateChange("tasks_changed", "tasks_screen");
  }, [todos, selectedList, persistState, lists]);

  return {
    alarmMenu,
    setAlarmMenu,
    scheduleAlarm,
    scheduleAlarmWithDays,
    cancelAlarm,
    formatAlarm,
  };
}