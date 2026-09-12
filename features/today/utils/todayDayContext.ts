import { getStructuredSchedule } from "@/services/scheduling/scheduling.service";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import type { Checklist, Habit, Task, TaskPriority } from "@/shared/types/domain.types";
import {
  getChecklistOccurrenceStats,
  getChecklistStats,
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { dateKeyFromDate } from "@/shared/utils/date-key";
import type { NowFocusResult } from "@/features/today/utils/getNowFocus";

export type TodayDayContextEntryType = "task" | "habit" | "checklist";
export type TodayDayContextEntryStatus = "past" | "current" | "upcoming";

export interface TodayDayContextEntry {
  kind: "entry";
  id: string;
  type: TodayDayContextEntryType;
  title: string;
  workspaceId: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  timeLabel: string;
  status: TodayDayContextEntryStatus;
  completed: boolean;
  isNow: boolean;
  priority?: TaskPriority;
  checklistProgress?: {
    completedCount: number;
    totalCount: number;
  };
}

export interface TodayDayContextGap {
  kind: "gap";
  id: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

export type TodayDayContextRow = TodayDayContextEntry | TodayDayContextGap;

export interface TodayDayContextModel {
  rows: TodayDayContextRow[];
  hasMeaningfulSchedule: boolean;
  referenceDateKey: string;
}

interface BuildTodayDayContextOptions {
  now: Date;
  referenceDateKey?: string;
  tasks: Task[];
  habits: Habit[];
  checklists: Checklist[];
  nowFocus?: NowFocusResult;
}

interface CandidateSource<T> {
  type: TodayDayContextEntryType;
  items: T[];
  defaultDuration: number;
}

const RECENT_CONTEXT_WINDOW_MINUTES = 180;
const MIN_MEANINGFUL_GAP_MINUTES = 30;

function formatMinutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return formatReminderTime(hour, minute) || "";
}

function formatTimeRange(startMinutes: number, endMinutes: number): string {
  return `${formatMinutesToTime(startMinutes)} – ${formatMinutesToTime(endMinutes)}`;
}

function getWorkspaceId(item: Task | Habit | Checklist): string {
  return item.workspaceId || "inbox";
}

function getEntryPriority(item: Task | Habit | Checklist): TaskPriority | undefined {
  const priority = (item as { priority?: TaskPriority }).priority;
  return priority && priority !== "none" ? priority : undefined;
}

function getCompletionState(
  item: Task | Habit | Checklist,
  type: TodayDayContextEntryType,
  dateKey: string,
): { completed: boolean; checklistProgress?: TodayDayContextEntry["checklistProgress"] } {
  if (type === "task") {
    return { completed: isTaskCompleted(item as Task) };
  }

  if (type === "habit") {
    return { completed: isHabitCompletedToday(item as Habit, dateKey) };
  }

  const checklist = item as Checklist;
  const stats = checklist.recurrence
    ? getChecklistOccurrenceStats(checklist, dateKey)
    : getChecklistStats(checklist);

  return {
    completed: isChecklistCompletedForDate(checklist, dateKey),
    checklistProgress: {
      completedCount: stats.completedCount,
      totalCount: stats.total,
    },
  };
}

function matchesFocus(
  entry: Pick<TodayDayContextEntry, "id" | "type">,
  nowFocus?: NowFocusResult,
): boolean {
  return Boolean(
    nowFocus?.item &&
      nowFocus.type === entry.type &&
      nowFocus.item.id === entry.id,
  );
}

/**
 * Builds the small temporal projection used by Today.
 *
 * This intentionally consumes the same recurrence and structured-schedule
 * helpers used by Calendar. It only selects a few nearby entries; it does not
 * decide NOW and it does not mutate or reschedule anything.
 */
export function buildTodayDayContext({
  now,
  referenceDateKey = dateKeyFromDate(now),
  tasks,
  habits,
  checklists,
  nowFocus,
}: BuildTodayDayContextOptions): TodayDayContextModel {
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const seen = new Set<string>();
  const entries: TodayDayContextEntry[] = [];

  const sources: Array<CandidateSource<Task | Habit | Checklist>> = [
    { type: "task", items: tasks, defaultDuration: 60 },
    { type: "habit", items: habits, defaultDuration: 30 },
    { type: "checklist", items: checklists, defaultDuration: 45 },
  ];

  for (const source of sources) {
    for (const item of source.items) {
      const key = `${source.type}:${item.id}`;
      if (seen.has(key) || item.archivedAt) continue;
      seen.add(key);

      if (!isRecurringOccurrenceForDate(item, referenceDateKey)) continue;

      const schedule = getStructuredSchedule(item as any, source.defaultDuration);
      if (!schedule.startTime) continue;

      const startMinutes = schedule.sortKey;
      const endMinutes = startMinutes + schedule.duration;
      const completion = getCompletionState(item, source.type, referenceDateKey);
      const isCurrent =
        !completion.completed &&
        nowMinutes >= startMinutes &&
        nowMinutes < endMinutes;

      entries.push({
        kind: "entry",
        id: item.id,
        type: source.type,
        title: item.title,
        workspaceId: getWorkspaceId(item),
        startMinutes,
        endMinutes,
        durationMinutes: schedule.duration,
        timeLabel: formatTimeRange(startMinutes, endMinutes),
        status: isCurrent || nowMinutes < startMinutes ? (isCurrent ? "current" : "upcoming") : "past",
        completed: completion.completed,
        isNow: matchesFocus({ id: item.id, type: source.type }, nowFocus),
        priority: getEntryPriority(item),
        checklistProgress: completion.checklistProgress,
      });
    }
  }

  entries.sort((a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id));

  const currentEntries = entries.filter((entry) => entry.status === "current");
  const currentEntry =
    currentEntries.find((entry) => entry.isNow) || currentEntries[0] || null;

  const upcomingEntries = entries.filter(
    (entry) => entry.status === "upcoming" && !entry.completed,
  );
  const nextEntry = upcomingEntries[0] || null;
  const laterEntry = upcomingEntries[1] || null;

  const recentEntry =
    entries
      .filter(
        (entry) =>
          entry.status === "past" &&
          nowMinutes - entry.endMinutes <= RECENT_CONTEXT_WINDOW_MINUTES,
      )
      .at(-1) || null;

  const selectedIds = new Set(
    [recentEntry, currentEntry, nextEntry, laterEntry]
      .filter((entry): entry is TodayDayContextEntry => Boolean(entry))
      .map((entry) => entry.id),
  );

  const selectedEntries = entries.filter((entry) => selectedIds.has(entry.id));
  const rows: TodayDayContextRow[] = [...selectedEntries];

  if (nextEntry) {
    const gapStart = currentEntry
      ? Math.max(nowMinutes, currentEntry.endMinutes)
      : nowMinutes;
    const gapDuration = nextEntry.startMinutes - gapStart;

    if (gapDuration >= MIN_MEANINGFUL_GAP_MINUTES) {
      rows.push({
        kind: "gap",
        id: `gap-${Math.round(gapStart)}-${nextEntry.startMinutes}`,
        startMinutes: gapStart,
        endMinutes: nextEntry.startMinutes,
        durationMinutes: gapDuration,
      });
    }
  }

  rows.sort((a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id));

  return {
    rows: currentEntry || nextEntry ? rows : [],
    hasMeaningfulSchedule: Boolean(currentEntry || nextEntry),
    referenceDateKey,
  };
}

export function formatTodayDayDuration(durationMinutes: number): string {
  const rounded = Math.max(1, Math.round(durationMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatTodayDayGapLabel(gap: TodayDayContextGap): string {
  return `${formatMinutesToTime(gap.startMinutes)} – ${formatMinutesToTime(gap.endMinutes)}`;
}
