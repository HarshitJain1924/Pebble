import {
  ChecklistRepository,
  HabitRepository,
  TaskRepository,
  UiStateRepository,
  WorkspaceRepository,
} from "@/repositories";
import { INBOX_WORKSPACE_ID, Workspace, Task, Habit, Checklist } from "@/shared/types/domain.types";
import { deduplicateEntities } from "@/shared/utils/deduplication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, ScrollView, View } from "react-native";
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import {
  DailyHistory,
  getHistoryForMonth,
  historyForDate,
} from "@/services/analytics/productivity-history.service";
import {
  addStateListener,
  emitStateChange,
} from "@/services/events/state-events";
import { isRecurringOccurrenceForDate } from "@/services/scheduling/recurrence.service";
import {
  getChecklistCompletedItemsCountForDate,
  isChecklistCompletedForDate,
  isHabitCompletedToday,
  isTaskCompleted,
} from "@/shared/utils/domain-selectors";
import { dateKeyFromDate, parseDateKey } from "@/shared/utils/date-key";

import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import {
  calculateRescheduledTask,
  getStructuredSchedule,
} from "@/services/scheduling/scheduling.service";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

// Public API preserved for callers of this module; delegates to the canonical
// date-key helper (local YYYY-MM-DD).
export const getDateKey = (date = new Date()) => dateKeyFromDate(date);

export const getMonthKey = (date = new Date()) => ({
  year: date.getFullYear(),
  month: date.getMonth(),
});

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface InitialTimelineScrollOptions {
  selectedDate: string;
  currentDate?: string;
  currentHour?: number;
  hourHeight?: number;
  headerOffset?: number;
}

/**
 * Calculates the initial vertical scroll offset for the Day/Timeline viewport.
 * 
 * Rules:
 * 1. If viewing Today and currentHour >= 7: positions the timeline near currentHour
 *    with 1 hour of visual headroom (Math.max(0, currentHour - 1)).
 * 2. If viewing Today and currentHour < 7 (early morning): falls back to 7:00 AM.
 * 3. If viewing a non-today date: falls back to 7:00 AM.
 */
export function calculateInitialTimelineScrollOffset(
  options: InitialTimelineScrollOptions,
): number {
  const {
    selectedDate,
    currentDate = getDateKey(),
    currentHour = new Date().getHours(),
    hourHeight = 80,
    headerOffset = 0,
  } = options;

  const isToday = selectedDate === currentDate;

  let targetHour = 7;
  if (isToday) {
    if (currentHour >= 7) {
      targetHour = Math.max(0, currentHour - 1);
    } else {
      targetHour = 7;
    }
  }

  return Math.max(0, targetHour * hourHeight + headerOffset);
}

/**
 * Calculates the vertical Y coordinate (in pixels) for the Current Time Indicator
 * on the 24-hour Day timeline.
 */
export function calculateCurrentTimePosition(
  hours: number,
  minutes: number,
  hourHeight: number = 80,
): number {
  const clampedHours = Math.max(0, Math.min(23, hours));
  const clampedMinutes = Math.max(0, Math.min(59, minutes));
  const totalMinutes = clampedHours * 60 + clampedMinutes;
  return (totalMinutes / 60) * hourHeight;
}

/**
 * Formats 24-hour wall-clock time (hours, minutes) into standard 12-hour display string.
 * Example: 17:48 -> "5:48 PM", 00:00 -> "12:00 AM", 12:01 -> "12:01 PM"
 */
export function formatCurrentTimeLabel(hours: number, minutes: number): string {
  const clampedHours = Math.max(0, Math.min(23, hours));
  const clampedMinutes = Math.max(0, Math.min(59, minutes));
  const displayHour = clampedHours % 12 === 0 ? 12 : clampedHours % 12;
  const ampm = clampedHours >= 12 ? "PM" : "AM";
  const displayMinutes = clampedMinutes < 10 ? `0${clampedMinutes}` : `${clampedMinutes}`;
  return `${displayHour}:${displayMinutes} ${ampm}`;
}

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function useCalendarState() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const [month, _setMonth] = useState(getMonthKey());
  const [history, setHistory] = useState<DailyHistory[]>([]);
  const [selectedDate, _setSelectedDate] = useState(getDateKey());
  const [allTodos, setAllTodos] = useState<any[]>([]);
  const [allHabits, setAllHabits] = useState<any[]>([]);
  const [allChecklists, setAllChecklists] = useState<Checklist[]>([]);
  const [calendarViewMode, setCalendarViewMode] = useState<
    "month" | "week" | "timeline"
  >("month");

  const setSelectedDate = useCallback(
    (action: string | ((prev: string) => string)) => {
      _setSelectedDate((prev) => {
        const nextDate = typeof action === "function" ? action(prev) : action;
        if (nextDate && typeof nextDate === "string") {
          const [y, m] = nextDate.split("-").map(Number);
          if (!isNaN(y) && !isNaN(m)) {
            _setMonth((prevMonth) => {
              if (prevMonth.year !== y || prevMonth.month !== m - 1) {
                return { year: y, month: m - 1 };
              }
              return prevMonth;
            });
          }
        }
        return nextDate;
      });
    },
    [],
  );

  const setMonth = useCallback(
    (
      action:
        | { year: number; month: number }
        | ((prev: { year: number; month: number }) => {
            year: number;
            month: number;
          }),
    ) => {
      _setMonth((prev) => {
        const nextMonthObj =
          typeof action === "function" ? action(prev) : action;
        if (
          nextMonthObj &&
          (nextMonthObj.year !== prev.year || nextMonthObj.month !== prev.month)
        ) {
          _setSelectedDate((currDate) => {
            const currentDateObj = parseDateKey(currDate);
            const currentYear = currentDateObj.getFullYear();
            const currentMonth = currentDateObj.getMonth();
            if (
              currentYear === nextMonthObj.year &&
              currentMonth === nextMonthObj.month
            ) {
              return currDate;
            }
            const currentDay = currentDateObj.getDate();
            const maxDaysInTargetMonth = new Date(
              nextMonthObj.year,
              nextMonthObj.month + 1,
              0,
            ).getDate();
            const targetDay = Math.min(currentDay, maxDaysInTargetMonth);
            return dateKeyFromDate(
              new Date(nextMonthObj.year, nextMonthObj.month, targetDay),
            );
          });
        }
        return nextMonthObj;
      });
    },
    [],
  );

  // Workspaces list
  const [lists, setLists] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  // Drag and Drop rescheduling states
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<any | null>(null);
  const [hoveredDate, _setHoveredDate] = useState<string | null>(null);
  const [hoveredHour, _setHoveredHour] = useState<number | null>(null);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  const touchStartRef = useRef({ x: 0, y: 0 });
  const monthGridRef = useRef<View>(null);
  const weekStripRef = useRef<View>(null);
  const timelineGridRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const hasScrolledRef = useRef(false);

  // Refs to avoid stale closures in gesture handlers
  const hoveredDateRef = useRef<string | null>(null);
  const hoveredHourRef = useRef<number | null>(null);

  const setHoveredDate = useCallback((date: string | null) => {
    hoveredDateRef.current = date;
    _setHoveredDate(date);
  }, []);

  const setHoveredHour = useCallback((hour: number | null) => {
    hoveredHourRef.current = hour;
    _setHoveredHour(hour);
  }, []);
  const monthGridBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const weekStripBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const timelineGridBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const activeDragItemRef = useRef<any | null>(null);
  const selectedDateRef = useRef<string | null>(null);
  const calendarCellsRef = useRef<any[]>([]);
  const weekDaysStripRef = useRef<any[]>([]);
  const calendarViewModeRef = useRef<string>("month");

  // Auto-scroll refs
  const autoScrollTimerRef = useRef<any>(null);
  const lastDragXRef = useRef(0);
  const lastDragYRef = useRef(0);
  const initialScrollYRef = useRef(0);

  const [monthGridBounds, setMonthGridBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [weekStripBounds, setWeekStripBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [timelineGridBounds, setTimelineGridBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const measureMonthGrid = useCallback(() => {
    monthGridRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        monthGridBoundsRef.current = { x, y, width, height };
        setMonthGridBounds({ x, y, width, height });
      }
    });
  }, []);

  const measureWeekStrip = useCallback(() => {
    weekStripRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        weekStripBoundsRef.current = { x, y, width, height };
        setWeekStripBounds({ x, y, width, height });
      }
    });
  }, []);

  const measureTimelineGrid = useCallback(() => {
    timelineGridRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        timelineGridBoundsRef.current = { x, y, width, height };
        setTimelineGridBounds({ x, y, width, height });
      }
    });
  }, []);

  // Re-measure when calendar view mode changes or active screen focus
  useEffect(() => {
    const timer = setTimeout(() => {
      measureMonthGrid();
      measureWeekStrip();
      measureTimelineGrid();
    }, 400);
    return () => clearTimeout(timer);
  }, [
    month,
    calendarViewMode,
    measureMonthGrid,
    measureWeekStrip,
    measureTimelineGrid,
  ]);

  const loadGenerationRef = useRef(0);

  const loadMonth = useCallback(async (year: number, monthIndex: number) => {
    const entries = await getHistoryForMonth(year, monthIndex);
    setHistory(entries);
  }, []);

  const loadDataFromStorage = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    try {
      const [uiState, currentLists] = await Promise.all([
        UiStateRepository.getUiState(),
        WorkspaceRepository.getWorkspaces(),
      ]);
      if (generation !== loadGenerationRef.current) return;
      setActiveWorkspaceId(uiState.activeWorkspaceId || null);
      setLists(currentLists);

      const workspaceIds = Array.from(
        new Set([INBOX_WORKSPACE_ID, ...currentLists.map((f) => f.id)]),
      );

      const workspaceResults = await Promise.all(
        workspaceIds.map(async (wsId) => {
          const [tasksMap, habitsMap, checklistsMap] = await Promise.all([
            TaskRepository.getTasks(wsId),
            HabitRepository.getHabits(wsId),
            ChecklistRepository.getChecklists(wsId),
          ]);
          return { tasksMap, habitsMap, checklistsMap };
        }),
      );

      if (generation !== loadGenerationRef.current) return;

      const allTasksList: Task[] = [];
      const allHabitsList: Habit[] = [];
      const allChecklistsList: Checklist[] = [];

      for (const { tasksMap, habitsMap, checklistsMap } of workspaceResults) {
        Object.values(tasksMap).forEach((t) => {
          if (!t.archivedAt) {
            allTasksList.push(t);
          }
        });
        Object.values(habitsMap).forEach((h) => {
          if (!h.archivedAt) {
            allHabitsList.push(h);
          }
        });
        Object.values(checklistsMap).forEach((c) => {
          if (!c.archivedAt) {
            allChecklistsList.push(c);
          }
        });
      }

      const dedupTasks = deduplicateEntities(allTasksList);
      const dedupHabits = deduplicateEntities(allHabitsList);
      const dedupChecklists = deduplicateEntities(allChecklistsList);

      if (generation !== loadGenerationRef.current) return;

      setAllTodos(dedupTasks as any[]);
      setAllHabits(dedupHabits as any[]);
      setAllChecklists(dedupChecklists as Checklist[]);
    } catch (e) {
      console.log("Error loading storage data in calendar current", e);
    }
  }, []);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      void loadDataFromStorage();
      AsyncStorage.getItem("todoapp:calendar:selectedDate").then(
        (storedDate) => {
          if (storedDate) {
            setSelectedDate(storedDate);
            const [year, monthVal] = storedDate.split("-").map(Number);
            setMonth({ year, month: monthVal - 1 });
            AsyncStorage.removeItem("todoapp:calendar:selectedDate");
          }
        },
      );
    }, [loadDataFromStorage, setMonth, setSelectedDate]),
  );

  // Load productivity history when displayed month changes
  useEffect(() => {
    void loadMonth(month.year, month.month);
  }, [loadMonth, month.year, month.month]);

  useEffect(() => {
    const unsubTasks = addStateListener("tasks_changed", () => {
      loadDataFromStorage();
      AsyncStorage.getItem("todoapp:calendar:selectedDate").then(
        (storedDate) => {
          if (storedDate) {
            setSelectedDate(storedDate);
            const [year, monthVal] = storedDate.split("-").map(Number);
            setMonth({ year, month: monthVal - 1 });
            AsyncStorage.removeItem("todoapp:calendar:selectedDate");
          }
        },
      );
    });
    const unsubHabits = addStateListener("habits_changed", () => {
      loadDataFromStorage();
    });
    const unsubChecklists = addStateListener("checklists_changed", () => {
      loadDataFromStorage();
    });
    const unsubWorkspace = addStateListener("workspace_changed", () => {
      loadDataFromStorage();
    });
    return () => {
      unsubTasks();
      unsubHabits();
      unsubChecklists();
      unsubWorkspace();
    };
  }, [loadDataFromStorage]);

  const selectedHistory = useMemo(
    () => historyForDate(history, selectedDate),
    [history, selectedDate],
  );

  const weekDaysStrip = useMemo(() => {
    const list = [];
    const current = new Date(selectedDate);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(current);
      d.setDate(current.getDate() + i);
      list.push({
        dateString: getDateKey(d),
        dayNum: String(d.getDate()).padStart(2, "0"),
        dayName: WEEKDAY_NAMES[d.getDay()],
        isToday: getDateKey(d) === getDateKey(new Date()),
      });
    }
    return list;
  }, [selectedDate]);

  // Unified timeline items parser with detailed scheduling properties
  const timelineItems = useMemo(() => {
    const tasks = allTodos
      .filter((todo) => {
        const matchesDate = isRecurringOccurrenceForDate(todo, selectedDate);
        return matchesDate && todo.schedule?.date !== "inbox";
      })
      .map((todo) => {
        const sched = getStructuredSchedule(todo, 60);
        const timeLabel = sched.startTime
          ? formatReminderTime(sched.startTime.hour, sched.startTime.minute) ||
            "All Day"
          : "All Day";

        return {
          id: todo.id,
          workspaceId: todo.workspaceId || INBOX_WORKSPACE_ID,
          title: todo.title,
          timeLabel,
          rawHours: sched.startTime ? sched.sortKey / 60 : 24,
          completed: isTaskCompleted(todo),
          type: "task",
          streak: undefined,
          category: todo.category,
          priority: todo.priority,
          startHour: sched.startTime?.hour,
          startMinute: sched.startTime?.minute,
          reminderHour: sched.startTime?.hour,
          reminderMinute: sched.startTime?.minute,
          durationMinutes: sched.duration,
        };
      });

    const habits = allHabits
      .filter((habit) => {
        return isRecurringOccurrenceForDate(habit, selectedDate);
      })
      .map((habit) => {
        // Canonical per-date completion: read the habit's completionHistory for
        // the selected date instead of the legacy completedToday field or the
        // history-title heuristic.
        const completed = isHabitCompletedToday(habit, selectedDate);

        const sched = getStructuredSchedule(habit, 30);
        const timeLabel = sched.startTime
          ? formatReminderTime(sched.startTime.hour, sched.startTime.minute) ||
            "Anytime"
          : "Anytime";

        return {
          id: habit.id,
          workspaceId: habit.workspaceId || INBOX_WORKSPACE_ID,
          title: habit.title,
          timeLabel,
          rawHours: sched.startTime ? sched.sortKey / 60 : 25,
          completed,
          type: "habit",
          streak: habit.streak || 0,
          category: undefined,
          priority: habit.priority,
          startHour: sched.startTime?.hour,
          startMinute: sched.startTime?.minute,
          reminderHour: sched.startTime?.hour,
          reminderMinute: sched.startTime?.minute,
          durationMinutes: sched.duration,
        };
      });

    const checklists = allChecklists
      .filter((checklist) => {
        const matchesDate = isRecurringOccurrenceForDate(checklist, selectedDate);
        return matchesDate && checklist.schedule?.date !== "inbox";
      })
      .map((checklist) => {
        const sched = getStructuredSchedule(checklist, 45);
        const timeLabel = sched.startTime
          ? formatReminderTime(sched.startTime.hour, sched.startTime.minute) ||
            "All Day"
          : "All Day";

        const completed = isChecklistCompletedForDate(checklist, selectedDate);
        const completedItemsCount = getChecklistCompletedItemsCountForDate(
          checklist,
          selectedDate,
        );
        const totalItemsCount = checklist.items ? checklist.items.length : 0;

        return {
          id: checklist.id,
          workspaceId: checklist.workspaceId || INBOX_WORKSPACE_ID,
          title: checklist.title,
          timeLabel,
          rawHours: sched.startTime ? sched.sortKey / 60 : 24,
          completed,
          type: "checklist" as const,
          streak: undefined,
          category: checklist.categoryId,
          priority: "none" as const,
          startHour: sched.startTime?.hour,
          startMinute: sched.startTime?.minute,
          reminderHour: sched.startTime?.hour,
          reminderMinute: sched.startTime?.minute,
          durationMinutes: sched.duration,
          itemsCount: totalItemsCount,
          completedItemsCount,
        };
      });

    return [...tasks, ...habits, ...checklists].sort((a, b) => a.rawHours - b.rawHours);
  }, [allTodos, allHabits, allChecklists, selectedDate, selectedHistory]);

  // Split allDay vs timed items
  const allDayItems = useMemo(() => {
    return timelineItems.filter(
      (item) =>
        item.startHour === undefined || item.startMinute === undefined,
    );
  }, [timelineItems]);

  // Advanced Overlapping task layout columns computation
  const timedItemsWithLayout = useMemo(() => {
    const timed = timelineItems.filter(
      (item) =>
        item.startHour !== undefined && item.startMinute !== undefined,
    );

    const sorted = [...timed].sort((a, b) => {
      const startA = a.startHour! * 60 + a.startMinute!;
      const startB = b.startHour! * 60 + b.startMinute!;
      return startA - startB;
    });

    const clusters: (typeof sorted)[] = [];
    for (const item of sorted) {
      const start = item.startHour! * 60 + item.startMinute!;
      const end = start + item.durationMinutes;

      let placed = false;
      for (const cluster of clusters) {
        const overlaps = cluster.some((cItem) => {
          const cStart = cItem.startHour! * 60 + cItem.startMinute!;
          const cEnd = cStart + cItem.durationMinutes;
          return start < cEnd && cStart < end;
        });
        if (overlaps) {
          cluster.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        clusters.push([item]);
      }
    }

    return clusters.flatMap((cluster) => {
      const columns: (typeof sorted)[] = [];
      const itemCols = new Map<string, number>();

      for (const item of cluster) {
        const start = item.startHour! * 60 + item.startMinute!;
        const end = start + item.durationMinutes;

        let colIdx = 0;
        while (true) {
          if (!columns[colIdx]) {
            columns[colIdx] = [item];
            itemCols.set(item.id, colIdx);
            break;
          }

          const overlaps = columns[colIdx].some((cItem) => {
            const cStart = cItem.startHour! * 60 + cItem.startMinute!;
            const cEnd = cStart + cItem.durationMinutes;
            return start < cEnd && cStart < end;
          });

          if (!overlaps) {
            columns[colIdx].push(item);
            itemCols.set(item.id, colIdx);
            break;
          }
          colIdx++;
        }
      }

      const totalCols = columns.length;
      return cluster.map((item) => {
        const colIdx = itemCols.get(item.id) || 0;
        return {
          ...item,
          colIdx,
          totalCols,
        };
      });
    });
  }, [timelineItems]);

  // ─── Daily Planner Derived State & Actions ─────────────────────────
  const pendingTasks = useMemo(() => {
    const currentWs = activeWorkspaceId || INBOX_WORKSPACE_ID;
    return allTodos.filter((todo) => {
      // 1. Must belong to the active workspace (or INBOX if active workspace is inbox/null)
      const matchesWs =
        todo.workspaceId === currentWs ||
        (currentWs === INBOX_WORKSPACE_ID &&
          (!todo.workspaceId || todo.workspaceId === INBOX_WORKSPACE_ID));
      if (!matchesWs) return false;

      // 2. Active incomplete tasks only (exclude recycled/archived and completed)
      if (todo.archivedAt || isTaskCompleted(todo)) return false;

      // 3. Exclude tasks already scheduled for the selectedDate (or recurring on selectedDate)
      const isScheduledForSelectedDate =
        isRecurringOccurrenceForDate(todo, selectedDate) ||
        todo.schedule?.date === selectedDate;
      if (isScheduledForSelectedDate) return false;

      return true;
    });
  }, [allTodos, activeWorkspaceId, selectedDate]);

  const plannerHabits = useMemo(() => {
    const currentWs = activeWorkspaceId || INBOX_WORKSPACE_ID;
    return allHabits.filter((habit) => {
      if (habit.archivedAt) return false;
      const matchesWs =
        habit.workspaceId === currentWs ||
        (currentWs === INBOX_WORKSPACE_ID &&
          (!habit.workspaceId || habit.workspaceId === INBOX_WORKSPACE_ID));
      if (!matchesWs) return false;
      return isRecurringOccurrenceForDate(habit, selectedDate);
    });
  }, [allHabits, activeWorkspaceId, selectedDate]);

  const pendingChecklists = useMemo(() => {
    const currentWs = activeWorkspaceId || INBOX_WORKSPACE_ID;
    return allChecklists.filter((checklist) => {
      const matchesWs =
        checklist.workspaceId === currentWs ||
        (currentWs === INBOX_WORKSPACE_ID &&
          (!checklist.workspaceId || checklist.workspaceId === INBOX_WORKSPACE_ID));
      if (!matchesWs) return false;

      if (checklist.archivedAt || isChecklistCompletedForDate(checklist, selectedDate)) return false;

      const isScheduledForSelectedDate =
        isRecurringOccurrenceForDate(checklist, selectedDate) ||
        checklist.schedule?.date === selectedDate;
      if (isScheduledForSelectedDate) return false;

      return true;
    });
  }, [allChecklists, activeWorkspaceId, selectedDate]);

  // ─── Free Time Gaps Calculator ──────────────────────────────────
  const freeTimeGaps = useMemo(() => {
    const timed = timelineItems.filter(
      (item) =>
        item.startHour !== undefined && item.startMinute !== undefined,
    );
    const sorted = [...timed].sort((a, b) => {
      const startA = a.startHour! * 60 + a.startMinute!;
      const startB = b.startHour! * 60 + b.startMinute!;
      return startA - startB;
    });

    const gaps: { startMinutes: number; durationMinutes: number }[] = [];
    let currentStart = 0; // 00:00 (Midnight)
    const dayEnd = 24 * 60; // 24:00 (End of day = 1440 min)

    for (const item of sorted) {
      const start = item.startHour! * 60 + item.startMinute!;
      const end = start + (item.durationMinutes || 60);

      if (start > currentStart) {
        const gapDuration = start - currentStart;
        if (gapDuration >= 30) {
          gaps.push({
            startMinutes: currentStart,
            durationMinutes: gapDuration,
          });
        }
      }
      if (end > currentStart) {
        currentStart = end;
      }
    }

    if (dayEnd > currentStart) {
      const gapDuration = dayEnd - currentStart;
      if (gapDuration >= 30) {
        gaps.push({
          startMinutes: currentStart,
          durationMinutes: gapDuration,
        });
      }
    }

    return gaps;
  }, [timelineItems]);

  const planTask = useCallback(
    async (
      taskId: string,
      options?: { hour?: number; minute?: number; isAllDay?: boolean; date?: string },
    ) => {
      try {
        const uiState = await UiStateRepository.getUiState();
        const targetWs =
          activeWorkspaceId || uiState.activeWorkspaceId || INBOX_WORKSPACE_ID;
        const task =
          allTodos.find((t) => t.id === taskId) ||
          (await TaskRepository.getTask(taskId, targetWs));
        if (!task) return false;

        const targetWorkspace = task.workspaceId || targetWs;
        const selDate = options?.date || selectedDate || getDateKey();
        const {
          EntityCommandService,
        } = require("@/services/command/EntityCommandService");

        let updates: Partial<Task>;
        if (
          options?.hour !== undefined &&
          options.hour !== null &&
          !options.isAllDay
        ) {
          updates = calculateRescheduledTask(
            task,
            { hour: options.hour, minute: options.minute, date: selDate },
            selDate,
          );
        } else if (options?.isAllDay) {
          // Explicit user choice to place in All-Day / Anytime: clears time
          updates = {
            schedule: {
              ...(task.schedule || {}),
              date: selDate,
              startTime: undefined,
              endTime: undefined,
            },
          };
        } else {
          // Safe move/assign to selected date while PRESERVING existing time and duration
          updates = {
            schedule: {
              ...(task.schedule || {}),
              date: selDate,
            },
          };
        }

        await EntityCommandService.updateTask(
          task.id,
          targetWorkspace,
          updates,
          { source: "daily_planner", skipEvents: false },
        );

        await loadDataFromStorage();
        return true;
      } catch (err) {
        console.warn("Failed to plan task in daily planner", err);
        return false;
      }
    },
    [activeWorkspaceId, allTodos, loadDataFromStorage, selectedDate],
  );

  const planChecklist = useCallback(
    async (
      checklistId: string,
      options?: { hour?: number; minute?: number; isAllDay?: boolean; date?: string },
    ) => {
      try {
        const uiState = await UiStateRepository.getUiState();
        const targetWs =
          activeWorkspaceId || uiState.activeWorkspaceId || INBOX_WORKSPACE_ID;
        const checklist =
          allChecklists.find((c) => c.id === checklistId) ||
          (await ChecklistRepository.getChecklist(checklistId, targetWs));
        if (!checklist) return false;

        const targetWorkspace = checklist.workspaceId || targetWs;
        const selDate = options?.date || selectedDate || getDateKey();
        const {
          EntityCommandService,
        } = require("@/services/command/EntityCommandService");

        let updates: Partial<Checklist>;
        if (
          options?.hour !== undefined &&
          options.hour !== null &&
          !options.isAllDay
        ) {
          const rescheduled = calculateRescheduledTask(
            checklist as any,
            { hour: options.hour, minute: options.minute, date: selDate },
            selDate,
          );
          const duration = checklist.schedule?.durationMinutes || 45;
          updates = {
            ...rescheduled,
            schedule: {
              ...(rescheduled.schedule || {}),
              durationMinutes: duration,
              allDay: undefined,
            },
          };
        } else if (options?.isAllDay) {
          updates = {
            schedule: {
              ...(checklist.schedule || {}),
              date: selDate,
              startTime: undefined,
              endTime: undefined,
              durationMinutes: undefined,
              allDay: true,
            },
          };
        } else {
          updates = {
            schedule: {
              ...(checklist.schedule || {}),
              date: selDate,
            },
          };
        }

        await EntityCommandService.updateChecklist(
          checklist.id,
          targetWorkspace,
          updates,
          { source: "daily_planner", skipEvents: false },
        );

        await loadDataFromStorage();
        return true;
      } catch (err) {
        console.warn("Failed to plan checklist in daily planner", err);
        return false;
      }
    },
    [activeWorkspaceId, allChecklists, loadDataFromStorage, selectedDate],
  );

  const calendarCells = useMemo(() => {
    const cells = [];
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const startOffset = new Date(month.year, month.month, 1).getDay();

    for (let i = 0; i < startOffset; i++) {
      cells.push({
        type: "empty" as const,
        key: `empty-${i}`,
        dateString: "" as string | undefined,
        dayNum: undefined as number | undefined,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = dateKeyFromDate(new Date(month.year, month.month, d));
      cells.push({
        type: "day" as const,
        dateString: dateKey,
        dayNum: d,
        key: `day-${d}`,
      });
    }
    return cells;
  }, [month]);

  const handlePrevMonth = useCallback(() => {
    setMonth((prev) => {
      let nextMonth = prev.month - 1;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  }, [setMonth]);

  const handleNextMonth = useCallback(() => {
    setMonth((prev) => {
      let nextMonth = prev.month + 1;
      let nextYear = prev.year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  }, [setMonth]);

  const headerDateLabel = useMemo(() => {
    const d = new Date(selectedDate);
    const m = MONTH_NAMES[d.getMonth()];
    const day = String(d.getDate()).padStart(2, "0");
    return `${m} ${day}`;
  }, [selectedDate]);

  // Synchronize refs with states/memos immediately when they change to avoid stale closures in gesture handlers
  useEffect(() => {
    activeDragItemRef.current = activeDragItem;
  }, [activeDragItem]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    calendarCellsRef.current = calendarCells;
  }, [calendarCells]);

  useEffect(() => {
    weekDaysStripRef.current = weekDaysStrip;
  }, [weekDaysStrip]);

  useEffect(() => {
    calendarViewModeRef.current = calendarViewMode;
  }, [calendarViewMode]);

  useEffect(() => {
    hoveredHourRef.current = hoveredHour;
  }, [hoveredHour]);

  useEffect(() => {
    hoveredDateRef.current = hoveredDate;
  }, [hoveredDate]);

  const handleDragStart = useCallback(
    (item: any, absoluteX: number, absoluteY: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      activeDragItemRef.current = item;
      setActiveDragItem(item);
      setIsDragging(true);
      dragX.value = absoluteX;
      dragY.value = absoluteY;

      hoveredDateRef.current = null;
      hoveredHourRef.current = null;
      setHoveredDate(null);
      setHoveredHour(null);

      initialScrollYRef.current = scrollYRef.current;
      lastDragXRef.current = absoluteX;
      lastDragYRef.current = absoluteY;

      measureMonthGrid();
      measureWeekStrip();
      measureTimelineGrid();
    },
    [measureMonthGrid, measureWeekStrip, measureTimelineGrid],
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  // Drag and Drop checking boundaries (Unified check for dates and hours)
  const checkHoveredDate = useCallback(
    (x: number, y: number) => {
      lastDragXRef.current = x;
      lastDragYRef.current = y;

      const currentViewMode = calendarViewModeRef.current;
      const mBounds = monthGridBoundsRef.current;
      const wBounds = weekStripBoundsRef.current;
      const tBounds = timelineGridBoundsRef.current;
      const cells = calendarCellsRef.current;
      const strip = weekDaysStripRef.current;

      // Calculate how much the ScrollView has scrolled since the drag started
      const scrollDelta = scrollYRef.current - initialScrollYRef.current;

      // 1. Check Date Grid over Month view
      if (currentViewMode === "month" && mBounds) {
        const adjustedGy = mBounds.y - scrollDelta;
        const { x: gx, width: gw, height: gh } = mBounds;
        if (
          x >= gx &&
          x <= gx + gw &&
          y >= adjustedGy &&
          y <= adjustedGy + gh
        ) {
          const localX = x - gx;
          const localY = y - adjustedGy;
          const colWidth = gw / 7;
          const numRows = Math.ceil(cells.length / 7);
          const rowHeight = gh / numRows;

          const col = Math.floor(localX / colWidth);
          const row = Math.floor(localY / rowHeight);
          const idx = row * 7 + col;

          if (idx >= 0 && idx < cells.length) {
            const cell = cells[idx];
            if (cell.type === "day" && cell.dateString) {
              if (hoveredHourRef.current !== null) {
                hoveredHourRef.current = null;
                setHoveredHour(null);
              }
              if (hoveredDateRef.current !== cell.dateString) {
                hoveredDateRef.current = cell.dateString;
                setHoveredDate(cell.dateString);
                Haptics.selectionAsync().catch(() => {});
              }
              stopAutoScroll();
              return;
            }
          }
        }
      }
      // 2. Check Week Strip view
      else if (currentViewMode === "week" && wBounds) {
        const adjustedWy = wBounds.y - scrollDelta;
        const { x: wx, width: ww, height: wh } = wBounds;
        if (
          x >= wx &&
          x <= wx + ww &&
          y >= adjustedWy - 30 &&
          y <= adjustedWy + wh + 30
        ) {
          const localX = x - wx;
          const cellWidth = ww / 7;
          const col = Math.floor(localX / cellWidth);

          if (col >= 0 && col < strip.length) {
            const day = strip[col];
            if (hoveredHourRef.current !== null) {
              hoveredHourRef.current = null;
              setHoveredHour(null);
            }
            if (hoveredDateRef.current !== day.dateString) {
              hoveredDateRef.current = day.dateString;
              setHoveredDate(day.dateString);
              Haptics.selectionAsync().catch(() => {});
            }
            stopAutoScroll();
            return;
          }
        }
      }

      // 3. Check Hourly Timeline Grid
      let hoveredTimeline = false;
      if (tBounds) {
        const adjustedTy = tBounds.y - scrollDelta;
        const { x: tx, width: tw, height: th } = tBounds;
        if (
          x >= tx &&
          x <= tx + tw &&
          y >= adjustedTy &&
          y <= adjustedTy + th
        ) {
          hoveredTimeline = true;
          const localY = y - adjustedTy;
          const hourRowIndex = Math.floor(localY / 80);
          const clampedHour = Math.max(0, Math.min(23, hourRowIndex));

          if (hoveredDateRef.current !== null) {
            hoveredDateRef.current = null;
            setHoveredDate(null);
          }
          if (hoveredHourRef.current !== clampedHour) {
            hoveredHourRef.current = clampedHour;
            setHoveredHour(clampedHour);
            Haptics.selectionAsync().catch(() => {});
          }
        }
      }

      if (!hoveredTimeline) {
        if (hoveredDateRef.current !== null) {
          hoveredDateRef.current = null;
          setHoveredDate(null);
        }
        if (hoveredHourRef.current !== null) {
          hoveredHourRef.current = null;
          setHoveredHour(null);
        }
      }

      // Auto-scroll ScrollView when dragging near top/bottom boundaries
      if (y < 220) {
        if (!autoScrollTimerRef.current) {
          autoScrollTimerRef.current = setInterval(() => {
            const currentScroll = scrollYRef.current;
            if (currentScroll > 0) {
              const newScroll = Math.max(0, currentScroll - 15);
              scrollRef.current?.scrollTo({ y: newScroll, animated: false });
              scrollYRef.current = newScroll;
              checkHoveredDate(lastDragXRef.current, lastDragYRef.current);
            } else {
              stopAutoScroll();
            }
          }, 30);
        }
      } else if (y > SCREEN_HEIGHT - 160) {
        if (!autoScrollTimerRef.current) {
          autoScrollTimerRef.current = setInterval(() => {
            const currentScroll = scrollYRef.current;
            const newScroll = currentScroll + 15;
            scrollRef.current?.scrollTo({ y: newScroll, animated: false });
            scrollYRef.current = newScroll;
            checkHoveredDate(lastDragXRef.current, lastDragYRef.current);
          }, 30);
        }
      } else {
        stopAutoScroll();
      }
    },
    [stopAutoScroll],
  );

  // Reschedule Persistence on Drop
  const handleDrop = useCallback(
    async (x?: number, y?: number) => {
      stopAutoScroll();
      if (x !== undefined && y !== undefined) {
        checkHoveredDate(x, y);
      }

      const dragItem = activeDragItemRef.current;
      const hHour = hoveredHourRef.current;
      const hDate = hoveredDateRef.current;
      const selDate = selectedDateRef.current || selectedDate || getDateKey();

      if (dragItem) {
        // 1. Reschedule Hour (on selectedDate)
        if (hHour !== null) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
          try {
            const uiState = await UiStateRepository.getUiState();
            const targetWorkspace =
              dragItem.workspaceId ||
              uiState.activeWorkspaceId ||
              INBOX_WORKSPACE_ID;
            if (dragItem.type === "task") {
              const taskMap = await TaskRepository.getTasks(targetWorkspace);
              const todo = taskMap[dragItem.id] as any;
              if (todo) {
                const { EntityCommandService } = require("@/services/command/EntityCommandService");
                if (todo.recurrence) {
                  await EntityCommandService.rescheduleRecurringOccurrence(
                    todo.id,
                    targetWorkspace,
                    selDate,
                    { hour: hHour },
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                } else {
                  const updates = calculateRescheduledTask(
                    todo,
                    { hour: hHour },
                    selDate,
                  );
                  await EntityCommandService.updateTask(
                    todo.id,
                    targetWorkspace,
                    updates,
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                }
              }
            } else if (dragItem.type === "habit") {
              const habitMap = await HabitRepository.getHabits(targetWorkspace);
              const habit = habitMap[dragItem.id] as any;
              if (habit) {
                // Update habit reminder time to match the dropped hour
                const [year, monthVal, dayVal] = selDate.split("-").map(Number);
                const newReminderDate = new Date(
                  year,
                  monthVal - 1,
                  dayVal,
                  hHour,
                  0,
                  0,
                  0,
                );
                const { EntityCommandService } = require("@/services/command/EntityCommandService");
                await EntityCommandService.updateHabit(habit.id, targetWorkspace, {
                  reminder: {
                    ...(habit.reminder || { enabled: true }),
                    enabled: true,
                    triggerAt: newReminderDate.getTime(),
                  },
                }, { source: "calendar_drag_drop", skipEvents: true });
              }
            } else if (dragItem.type === "checklist") {
              const checklistMap = await ChecklistRepository.getChecklists(targetWorkspace);
              const checklist = checklistMap[dragItem.id] as any;
              if (checklist) {
                const { EntityCommandService } = require("@/services/command/EntityCommandService");
                if (checklist.recurrence) {
                  await EntityCommandService.rescheduleChecklistRecurringOccurrence(
                    checklist.id,
                    targetWorkspace,
                    selDate,
                    { hour: hHour },
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                } else {
                  const updates = calculateRescheduledTask(
                    checklist,
                    { hour: hHour },
                    selDate,
                  );
                  await EntityCommandService.updateChecklist(
                    checklist.id,
                    targetWorkspace,
                    updates,
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                }
              }
            }

            await loadDataFromStorage();
            void loadMonth(month.year, month.month);

            if (dragItem.type === "task") {
              emitStateChange("tasks_changed");
            } else if (dragItem.type === "habit") {
              emitStateChange("habits_changed");
            } else if (dragItem.type === "checklist") {
              emitStateChange("checklists_changed");
            }
          } catch (err) {
            console.warn(
              "Failed to update item scheduled time after drag drop",
              err,
            );
          }
        }
        // 2. Reschedule Date (keeps hour settings or defaults)
        else if (hDate) {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
          try {
            const uiState = await UiStateRepository.getUiState();
            const targetWorkspace =
              dragItem.workspaceId ||
              uiState.activeWorkspaceId ||
              INBOX_WORKSPACE_ID;
            if (dragItem.type === "task") {
              const taskMap = await TaskRepository.getTasks(targetWorkspace);
              const todo = taskMap[dragItem.id] as any;
              if (todo) {
                const { EntityCommandService } = require("@/services/command/EntityCommandService");
                if (todo.recurrence) {
                  await EntityCommandService.rescheduleRecurringOccurrence(
                    todo.id,
                    targetWorkspace,
                    selDate,
                    { date: hDate },
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                } else {
                  const updates = calculateRescheduledTask(todo, { date: hDate });
                  await EntityCommandService.updateTask(
                    todo.id,
                    targetWorkspace,
                    updates,
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                }
              }
            } else if (dragItem.type === "habit") {
              const habitMap = await HabitRepository.getHabits(targetWorkspace);
              const habit = habitMap[dragItem.id] as any;
              if (habit) {
                // Update habit reminder date to the dropped date, preserve time if any
                const [year, monthVal, dayVal] = hDate.split("-").map(Number);
                const existingReminderDate = habit.reminder?.triggerAt
                  ? new Date(habit.reminder.triggerAt)
                  : new Date();
                const newReminderDate = new Date(
                  year,
                  monthVal - 1,
                  dayVal,
                  existingReminderDate.getHours(),
                  existingReminderDate.getMinutes(),
                  0,
                  0,
                );
                const { EntityCommandService } = require("@/services/command/EntityCommandService");
                await EntityCommandService.updateHabit(habit.id, targetWorkspace, {
                  reminder: {
                    ...(habit.reminder || { enabled: true }),
                    enabled: true,
                    triggerAt: newReminderDate.getTime(),
                  },
                }, { source: "calendar_drag_drop", skipEvents: true });
              }
            } else if (dragItem.type === "checklist") {
              const checklistMap = await ChecklistRepository.getChecklists(targetWorkspace);
              const checklist = checklistMap[dragItem.id] as any;
              if (checklist) {
                const { EntityCommandService } = require("@/services/command/EntityCommandService");
                if (checklist.recurrence) {
                  await EntityCommandService.rescheduleChecklistRecurringOccurrence(
                    checklist.id,
                    targetWorkspace,
                    selDate,
                    { date: hDate },
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                } else {
                  const updates = calculateRescheduledTask(checklist, { date: hDate });
                  await EntityCommandService.updateChecklist(
                    checklist.id,
                    targetWorkspace,
                    updates,
                    { source: "calendar_drag_drop", skipEvents: true },
                  );
                }
              }
            }

            setSelectedDate(hDate);
            await loadDataFromStorage();
            void loadMonth(month.year, month.month);

            if (dragItem.type === "task") {
              emitStateChange("tasks_changed");
            } else if (dragItem.type === "habit") {
              emitStateChange("habits_changed");
            } else if (dragItem.type === "checklist") {
              emitStateChange("checklists_changed");
            }
          } catch (err) {
            console.warn(
              "Failed to update item scheduled date after drag drop",
              err,
            );
          }
        }
      }

      setIsDragging(false);
      setActiveDragItem(null);
      setHoveredDate(null);
      setHoveredHour(null);
      hoveredDateRef.current = null;
      hoveredHourRef.current = null;
    },
    [
      selectedDate,
      month.year,
      month.month,
      loadDataFromStorage,
      loadMonth,
      stopAutoScroll,
    ],
  );

  const handleCancelDrag = useCallback(() => {
    stopAutoScroll();
    setIsDragging(false);
    setActiveDragItem(null);
    setHoveredDate(null);
    setHoveredHour(null);
    hoveredDateRef.current = null;
    hoveredHourRef.current = null;
  }, [stopAutoScroll]);

  // Reanimated style for the absolute floating item (lifted 85px above finger, semi-transparent for visibility)
  const floatingCardStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      left: dragX.value - 80,
      top: dragY.value - 85,
      width: 160,
      opacity: 0.75,
      transform: [{ scale: 1.05 }],
      zIndex: 9999,
    };
  });

  return {
    handleDragStart,
    handleCancelDrag,
    router,
    colors,
    colorScheme,
    isLight,
    month,
    setMonth,
    selectedDate,
    setSelectedDate,
    allTodos,
    allHabits,
    allChecklists,
    history,
    lists,

    calendarViewMode,
    setCalendarViewMode,
    isDragging,
    setIsDragging,
    activeDragItem,
    setActiveDragItem,
    hoveredDate,
    setHoveredDate,
    hoveredHour,
    setHoveredHour,
    dragX,
    dragY,
    touchStartRef,
    monthGridRef,
    weekStripRef,
    timelineGridRef,
    scrollRef,
    scrollYRef,
    hasScrolledRef,
    monthGridBounds,
    weekStripBounds,
    timelineGridBounds,
    measureMonthGrid,
    measureWeekStrip,
    measureTimelineGrid,
    handlePrevMonth,
    handleNextMonth,
    headerDateLabel,
    checkHoveredDate,
    handleDrop,
    floatingCardStyle,
    selectedHistory,
    weekDaysStrip,
    timelineItems,
    allDayItems,
    timedItemsWithLayout,
    calendarCells,
    activeWorkspaceId,
    pendingTasks,
    pendingChecklists,
    plannerHabits,
    freeTimeGaps,
    planTask,
    planChecklist,
  };
}
