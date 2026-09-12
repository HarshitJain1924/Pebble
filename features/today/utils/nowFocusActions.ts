import type { Task, Habit, Checklist } from "@/shared/types/domain.types";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import { parseDurationMinutes } from "@/services/scheduling/scheduling.service";
import { launchFocusSession } from "@/features/focus/services/FocusLaunchService";
import type { NowFocusResult } from "@/features/today/utils/getNowFocus";

export interface CreateNowFocusActionsOptions {
  completeTodoFromDashboard: (id: string, notify?: boolean, folderId?: string) => Promise<unknown>;
  completeHabitFromDashboard: (id: string, notify?: boolean, folderId?: string) => Promise<unknown>;
  toggleChecklistItemFromDashboard: (
    checklistId: string,
    itemId: string,
    folderId: string,
    dateKey?: string,
  ) => Promise<unknown>;
  launchFocus?: typeof launchFocusSession;
  router?: { push: (url: any) => void; navigate?: (url: any) => void };
  getCurrentNow?: () => Date;
}

/**
 * Action adapter linking Pebble's NOW surface on Today to the canonical
 * task completion, habit completion, checklist item toggling, and Focus Mode launch services.
 *
 * Contract:
 * - ACTIVE scheduled Task/Habit: exact remaining scheduled allocation (in seconds) -> Focus
 * - RECOMMENDED unscheduled Task/Habit: explicit duration if present, else 25m preset -> Focus
 * - CHECKLIST: stays in Today, completed via canonical toggleChecklistItem; never enters Focus
 * - UPCOMING (UP NEXT): informational only, navigates to details; never enters Focus
 */
export function createNowFocusActionHandlers({
  completeTodoFromDashboard,
  completeHabitFromDashboard,
  toggleChecklistItemFromDashboard,
  launchFocus = launchFocusSession,
  router,
  getCurrentNow = () => new Date(),
}: CreateNowFocusActionsOptions) {
  const handleStartNowFocus = async (focus: NowFocusResult): Promise<void> => {
    // 1. Guard: Checklists and missing items never enter Focus
    if (!focus.item || focus.type === "checklist") return;

    // 2. Guard: UP NEXT is informational only, never starts Focus
    if (focus.state === "upcoming") return;

    // 3. Resolve duration in seconds based on canonical contract
    let durationSeconds: number;

    if (
      focus.state === "active" &&
      focus.remainingSeconds !== undefined &&
      focus.remainingSeconds > 0
    ) {
      // Exact remaining scheduled allocation in seconds
      durationSeconds = focus.remainingSeconds;
    } else if (focus.state === "recommended") {
      const explicitDuration = parseDurationMinutes(
        focus.item.schedule?.durationMinutes,
      );
      if (explicitDuration !== undefined && explicitDuration > 0) {
        durationSeconds = explicitDuration * 60;
      } else {
        durationSeconds = 25 * 60; // 25-minute default preset
      }
    } else {
      const explicitDuration = parseDurationMinutes(
        focus.item.schedule?.durationMinutes,
      );
      durationSeconds =
        explicitDuration && explicitDuration > 0 ? explicitDuration * 60 : 25 * 60;
    }

    // Ensure durationSeconds is a positive integer
    const finalDurationSeconds =
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? Math.round(durationSeconds)
        : 25 * 60;

    await launchFocus({
      targetId: focus.item.id,
      durationSeconds: finalDurationSeconds,
    });
  };

  const handleCompleteNowFocus = async (focus: NowFocusResult): Promise<void> => {
    if (!focus.item || focus.state === "upcoming") return;
    if (focus.type === "task") {
      await completeTodoFromDashboard(
        focus.item.id,
        undefined,
        (focus.item as Task).workspaceId,
      );
    } else if (focus.type === "habit") {
      await completeHabitFromDashboard(
        focus.item.id,
        undefined,
        (focus.item as Habit).workspaceId,
      );
    }
  };

  const handleCompleteNowChecklistItem = async (
    focus: NowFocusResult,
    itemId: string,
  ): Promise<void> => {
    if (!focus.item || focus.type !== "checklist" || focus.state === "upcoming") return;
    const checklist = focus.item as Checklist;
    const currentNow = getCurrentNow();
    const dateKey = checklist.recurrence
      ? dateKeyFromDate(currentNow)
      : undefined;
    await toggleChecklistItemFromDashboard(
      checklist.id,
      itemId,
      checklist.workspaceId,
      dateKey,
    );
  };

  const handlePressNowCard = (focus: NowFocusResult): void => {
    if (!focus.item || !router) return;
    if (focus.type === "task") {
      router.push(`/task-details?id=${focus.item.id}&type=task`);
    } else if (focus.type === "habit") {
      router.push(`/task-details?id=${focus.item.id}&type=habit`);
    } else if (focus.type === "checklist") {
      router.push(`/checklist-details?id=${focus.item.id}`);
    }
  };

  const handleViewFocus = (focus: NowFocusResult): void => {
    handlePressNowCard(focus);
  };

  return {
    handleStartNowFocus,
    handleCompleteNowFocus,
    handleCompleteNowChecklistItem,
    handlePressNowCard,
    handleViewFocus,
  };
}
