import { useState, useCallback } from "react";
import { Task, Workspace } from "@/shared/types/domain.types";
import { EntityCommandService } from "@/services/command/EntityCommandService";

export function useReminderState(
  todos: Record<string, Task[]>,
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>,
  selectedWorkspaceId: string,
  _currentTodos?: Task[],
  _remainingCount?: number,
  _persistState?: (listsToSave: Workspace[], selected: string, todosToSave: Record<string, Task[]>) => Promise<void>,
  _workspaces?: Workspace[],
) {
  const [alarmMenu, setAlarmMenu] = useState<string | null>(null);

  const scheduleAlarm = useCallback(async (todoId: string, minutesFromNow: number) => {
    const todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    const triggerTime = Date.now() + minutesFromNow * 60 * 1000;

    const updatedTask = await EntityCommandService.updateTask(todoId, selectedWorkspaceId, {
      reminder: {
        enabled: true,
        triggerAt: triggerTime,
      },
    });

    const listTodos = todos[selectedWorkspaceId] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId ? updatedTask : item
    );
    const updated = { ...todos, [selectedWorkspaceId]: updatedList };
    setTodos(updated);
  }, [todos, selectedWorkspaceId, setTodos]);

  const scheduleAlarmWithDays = useCallback(async (todoId: string, hour: number, minute: number, days?: number[]) => {
    const todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    const triggerDate = new Date();
    triggerDate.setHours(hour, minute, 0, 0);
    if (triggerDate.getTime() <= Date.now()) {
      triggerDate.setDate(triggerDate.getDate() + 1);
    }

    const updatedTask = await EntityCommandService.updateTask(todoId, selectedWorkspaceId, {
      reminder: {
        enabled: true,
        triggerAt: triggerDate.getTime(),
      },
      ...(days && days.length > 0
        ? {
            recurrence: {
              frequency: "weekly" as const,
              interval: 1,
              daysOfWeek: days,
            },
          }
        : {}),
    });

    const listTodos = todos[selectedWorkspaceId] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId ? updatedTask : item
    );
    const updated = { ...todos, [selectedWorkspaceId]: updatedList };
    setTodos(updated);
    setAlarmMenu(null);
  }, [todos, selectedWorkspaceId, setTodos]);

  const cancelAlarm = useCallback(async (todoId: string) => {
    const todo = (todos[selectedWorkspaceId] ?? []).find((t) => t.id === todoId);
    if (!todo) return;

    const updatedTask = await EntityCommandService.updateTask(todoId, selectedWorkspaceId, {
      reminder: null as any,
    });

    const listTodos = todos[selectedWorkspaceId] ?? [];
    const updatedList = listTodos.map((item) =>
      item.id === todoId ? updatedTask : item
    );
    const updated = { ...todos, [selectedWorkspaceId]: updatedList };
    setTodos(updated);
    setAlarmMenu(null);
  }, [todos, selectedWorkspaceId, setTodos]);

  return {
    alarmMenu,
    setAlarmMenu,
    scheduleAlarm,
    scheduleAlarmWithDays,
    cancelAlarm,
  };
}