import { useRouter, useFocusEffect } from "expo-router";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, ScrollView, Platform, Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  DailyHistory,
  getHistoryForMonth,
  historyForDate,
} from "@/services/productivityHistory";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";
import { cancelReminderIds, rescheduleTodoReminders, rescheduleHabitReminders } from "@/services/reminders";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function useCalendarState() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  
  const [month, setMonth] = useState(getMonthKey());
  const [history, setHistory] = useState<DailyHistory[]>([]);
  const [selectedDate, setSelectedDate] = useState(getDateKey());
  const [allTodos, setAllTodos] = useState<any[]>([]);
  const [allHabits, setAllHabits] = useState<any[]>([]);
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "week">("month");

  // Workspaces list
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [addingTask, setAddingTask] = useState<any | null>(null);

  // Drag and Drop rescheduling states
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<any | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

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
  const monthGridBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const weekStripBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const timelineGridBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
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

  const [monthGridBounds, setMonthGridBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [weekStripBounds, setWeekStripBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [timelineGridBounds, setTimelineGridBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

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
  }, [month, calendarViewMode, measureMonthGrid, measureWeekStrip, measureTimelineGrid]);

  const loadMonth = useCallback(async (year: number, monthIndex: number) => {
    const entries = await getHistoryForMonth(year, monthIndex);
    setHistory(entries);
  }, []);

  const loadDataFromStorage = useCallback(async () => {
    try {
      const rawTodos = await AsyncStorage.getItem("todoapp:v1");
      if (rawTodos) {
        const state = JSON.parse(rawTodos);
        const listTodos = (Object.values(state.todos ?? {}).flat() as any[]).filter(t => !t.archived);
        setAllTodos(listTodos);
        if (state.lists) {
          setLists(state.lists);
        } else {
          setLists([{ id: "default", name: "Default" }]);
        }
      } else {
        setAllTodos([]);
        setLists([{ id: "default", name: "Default" }]);
      }

      const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
      if (rawHabits) {
        const state = JSON.parse(rawHabits);
        const listHabits = (state.dailyHabits ?? []).filter((h: any) => !h.archived);
        setAllHabits(listHabits);
      } else {
        setAllHabits([]);
      }
    } catch (e) {
      console.log("Error loading storage data in calendar", e);
    }
  }, []);

  // Save Quick Add Task
  const onSaveNewTask = async (newTask: any) => {
    if (!newTask.title || newTask.title.trim() === "") return;
    const targetFolderId = newTask.folderId || "default";
    const taskWithCreatedAt = {
      ...newTask,
      createdAt: newTask.createdAt || Date.now(),
    };

    const rawTodos = await AsyncStorage.getItem("todoapp:v1");
    let stateObj = { todos: {} as Record<string, any[]>, lists: [] as any[] };
    if (rawTodos) {
      stateObj = JSON.parse(rawTodos);
    }
    const listTodos = stateObj.todos[targetFolderId] ?? [];
    const updatedTodos = {
      ...stateObj.todos,
      [targetFolderId]: [{ ...taskWithCreatedAt, folderId: targetFolderId }, ...listTodos],
    };

    await AsyncStorage.setItem("todoapp:v1", JSON.stringify({ ...stateObj, todos: updatedTodos }));

    // Reschedule alarms if alarmTime is set
    await rescheduleTodoReminders(taskWithCreatedAt);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await loadDataFromStorage();
    void loadMonth(month.year, month.month);
    emitStateChange("tasks_changed");
    setAddingTask(null);
  };

  // Load data on focus and when month changes
  useFocusEffect(
    useCallback(() => {
      void loadMonth(month.year, month.month);
      void loadDataFromStorage();
      AsyncStorage.getItem("todoapp:calendar:selectedDate").then((storedDate) => {
        if (storedDate) setSelectedDate(storedDate);
      });
    }, [loadMonth, loadDataFromStorage, month.month, month.year])
  );

  useEffect(() => {
    const unsubTasks = addStateListener("tasks_changed", () => {
      loadDataFromStorage();
      AsyncStorage.getItem("todoapp:calendar:selectedDate").then((storedDate) => {
        if (storedDate) setSelectedDate(storedDate);
      });
    });
    const unsubHabits = addStateListener("habits_changed", () => {
      loadDataFromStorage();
    });
    return () => {
      unsubTasks();
      unsubHabits();
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
        const matchesDate = isRecurringOccurrenceForDate(todo, selectedDate) ||
          (todo.alarmTime && getDateKey(new Date(todo.alarmTime)) === selectedDate);
        return matchesDate && todo.scheduledDate !== "inbox";
      })
      .map((todo) => {
        let timeLabel = "All Day";
        let rawHours = 24;
        let hour = todo.reminderHour;
        let minute = todo.reminderMinute;

        if (hour !== undefined && minute !== undefined) {
          const mins = String(minute).padStart(2, "0");
          const ampm = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 || 12;
          timeLabel = `${displayHour}:${mins} ${ampm}`;
          rawHours = hour;
        } else if (todo.alarmTime) {
          const d = new Date(todo.alarmTime);
          hour = d.getHours();
          minute = d.getMinutes();
          const mins = String(minute).padStart(2, "0");
          const ampm = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 || 12;
          timeLabel = `${displayHour}:${mins} ${ampm}`;
          rawHours = hour;
        }

        return {
          id: todo.id,
          title: todo.title,
          timeLabel,
          rawHours,
          completed: todo.completed,
          type: "task",
          streak: undefined,
          category: todo.category,
          priority: todo.priority,
          reminderHour: hour,
          reminderMinute: minute,
          durationMinutes: todo.durationMinutes || 60,
        };
      });

    const dateParts = selectedDate.split("-").map(Number);
    const selDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = selDate.getDay();
    const isTodaySelected = selectedDate === getDateKey(new Date());

    const habits = allHabits
      .filter((habit) => {
        if (habit.recurrence) {
          return isRecurringOccurrenceForDate(habit, selectedDate);
        }
        return (
          !habit.reminderDays ||
          habit.reminderDays.length === 0 ||
          habit.reminderDays.includes(dayOfWeek)
        );
      })
      .map((habit) => {
        let completed = false;
        if (isTodaySelected) {
          completed = habit.completedToday;
        } else if (selectedHistory) {
          completed = selectedHistory.completedHabitTitles?.includes(habit.title) ?? false;
        }

        let timeLabel = "Anytime";
        let rawHours = 25;
        let hour = habit.reminderHour;
        let minute = habit.reminderMinute;

        if (hour !== undefined && minute !== undefined) {
          const mins = String(minute).padStart(2, "0");
          const ampm = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 || 12;
          timeLabel = `${displayHour}:${mins} ${ampm}`;
          rawHours = hour;
        }

        return {
          id: habit.id,
          title: habit.title,
          timeLabel,
          rawHours,
          completed,
          type: "habit",
          streak: habit.streak || 0,
          category: undefined,
          priority: habit.priority,
          reminderHour: hour,
          reminderMinute: minute,
          durationMinutes: habit.durationMinutes || 30,
        };
      });

    return [...tasks, ...habits].sort((a, b) => a.rawHours - b.rawHours);
  }, [allTodos, allHabits, selectedDate, selectedHistory]);

  // Split allDay vs timed items
  const allDayItems = useMemo(() => {
    return timelineItems.filter(
      (item) => item.reminderHour === undefined || item.reminderMinute === undefined
    );
  }, [timelineItems]);

  // Advanced Overlapping task layout columns computation
  const timedItemsWithLayout = useMemo(() => {
    const timed = timelineItems.filter(
      (item) => item.reminderHour !== undefined && item.reminderMinute !== undefined
    );

    const sorted = [...timed].sort((a, b) => {
      const startA = a.reminderHour! * 60 + a.reminderMinute!;
      const startB = b.reminderHour! * 60 + b.reminderMinute!;
      return startA - startB;
    });

    const clusters: (typeof sorted)[] = [];
    for (const item of sorted) {
      const start = item.reminderHour! * 60 + item.reminderMinute!;
      const end = start + item.durationMinutes;

      let placed = false;
      for (const cluster of clusters) {
        const overlaps = cluster.some((cItem) => {
          const cStart = cItem.reminderHour! * 60 + cItem.reminderMinute!;
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
        const start = item.reminderHour! * 60 + item.reminderMinute!;
        const end = start + item.durationMinutes;

        let colIdx = 0;
        while (true) {
          if (!columns[colIdx]) {
            columns[colIdx] = [item];
            itemCols.set(item.id, colIdx);
            break;
          }

          const overlaps = columns[colIdx].some((cItem) => {
            const cStart = cItem.reminderHour! * 60 + cItem.reminderMinute!;
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

  const calendarCells = useMemo(() => {
    const cells = [];
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const startOffset = new Date(month.year, month.month, 1).getDay();

    for (let i = 0; i < startOffset; i++) {
      cells.push({ type: "empty" as const, key: `empty-${i}`, dateString: "" as string | undefined, dayNum: undefined as number | undefined });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        type: "day" as const,
        dateString: dateKey,
        dayNum: d,
        key: `day-${d}`,
      });
    }
    return cells;
  }, [month]);

  const handlePrevMonth = () => {
    setMonth((prev) => {
      let nextMonth = prev.month - 1;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const handleNextMonth = () => {
    setMonth((prev) => {
      let nextMonth = prev.month + 1;
      let nextYear = prev.year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

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

  const handleDragStart = useCallback((item: any, absoluteX: number, absoluteY: number) => {
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
  }, [measureMonthGrid, measureWeekStrip, measureTimelineGrid]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  // Drag and Drop checking boundaries (Unified check for dates and hours)
  const checkHoveredDate = useCallback((x: number, y: number) => {
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
      if (x >= gx && x <= gx + gw && y >= adjustedGy && y <= adjustedGy + gh) {
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
      if (x >= wx && x <= wx + ww && y >= adjustedWy - 30 && y <= adjustedWy + wh + 30) {
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
      if (x >= tx && x <= tx + tw && y >= adjustedTy && y <= adjustedTy + th) {
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
  }, [stopAutoScroll]);

  // Reschedule Persistence on Drop
  const handleDrop = useCallback(async (x?: number, y?: number) => {
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        try {
          if (dragItem.type === "task") {
            const rawTodos = await AsyncStorage.getItem("todoapp:v1");
            if (rawTodos) {
              const state = JSON.parse(rawTodos);
              const updatedTodos = { ...state.todos };

              let found = false;
              for (const listId in updatedTodos) {
                updatedTodos[listId] = await Promise.all(
                  updatedTodos[listId].map(async (todo: any) => {
                    if (todo.id === dragItem.id) {
                      found = true;
                      await cancelReminderIds(todo.notificationIds || []);

                      // Re-set alarm time using current selectedDate + hoveredHour
                      const [year, monthVal, dayVal] = selDate.split("-").map(Number);
                      const newAlarmDate = new Date(year, monthVal - 1, dayVal, hHour, 0, 0, 0);

                      const todoToReschedule = {
                        ...todo,
                        reminderHour: hHour,
                        reminderMinute: 0,
                        alarmTime: newAlarmDate.getTime(),
                        scheduledDate: selDate,
                      };

                      const rescheduled = await rescheduleTodoReminders(todoToReschedule);
                      return rescheduled;
                    }
                    return todo;
                  })
                );
              }

              if (found) {
                await AsyncStorage.setItem("todoapp:v1", JSON.stringify({ ...state, todos: updatedTodos }));
              }
            }
          } else if (dragItem.type === "habit") {
            const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
            if (rawHabits) {
              const state = JSON.parse(rawHabits);
              const updatedHabits = await Promise.all(
                state.dailyHabits.map(async (habit: any) => {
                  if (habit.id === dragItem.id) {
                    await cancelReminderIds(habit.notificationIds || []);
                    const rescheduled = await rescheduleHabitReminders({
                      ...habit,
                      reminderHour: hHour,
                      reminderMinute: 0,
                    });
                    return rescheduled;
                  }
                  return habit;
                })
              );
              await AsyncStorage.setItem("todoapp:daily:v1", JSON.stringify({ ...state, dailyHabits: updatedHabits }));
            }
          }

          await loadDataFromStorage();
          void loadMonth(month.year, month.month);

          if (dragItem.type === "task") {
            emitStateChange("tasks_changed");
          } else if (dragItem.type === "habit") {
            emitStateChange("habits_changed");
          }
        } catch (err) {
          console.warn("Failed to update item scheduled time after drag drop", err);
        }
      }
      // 2. Reschedule Date (keeps hour settings or defaults)
      else if (hDate) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        try {
          if (dragItem.type === "task") {
            const rawTodos = await AsyncStorage.getItem("todoapp:v1");
            if (rawTodos) {
              const state = JSON.parse(rawTodos);
              const updatedTodos = { ...state.todos };

              let found = false;
              for (const listId in updatedTodos) {
                updatedTodos[listId] = await Promise.all(
                  updatedTodos[listId].map(async (todo: any) => {
                    if (todo.id === dragItem.id) {
                      found = true;

                      // Cancel old reminders
                      await cancelReminderIds(todo.notificationIds || []);

                      // Reschedule alarm time if it exists
                      let newAlarmTime = todo.alarmTime;
                      if (todo.alarmTime) {
                        const alarmDate = new Date(todo.alarmTime);
                        const [hours, minutes] = [alarmDate.getHours(), alarmDate.getMinutes()];
                        const [year, monthVal, dayVal] = hDate.split("-").map(Number);
                        const newAlarmDate = new Date(year, monthVal - 1, dayVal, hours, minutes, 0, 0);
                        newAlarmTime = newAlarmDate.getTime();
                      }

                      const todoToReschedule = {
                        ...todo,
                        scheduledDate: hDate,
                        alarmTime: newAlarmTime,
                      };

                      const rescheduled = await rescheduleTodoReminders(todoToReschedule);
                      return rescheduled;
                    }
                    return todo;
                  })
                );
              }

              if (found) {
                await AsyncStorage.setItem("todoapp:v1", JSON.stringify({ ...state, todos: updatedTodos }));
              }
            }
          } else if (dragItem.type === "habit") {
            const dateParts = hDate.split("-").map(Number);
            const selDateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            const dayOfWeek = selDateObj.getDay();

            const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
            if (rawHabits) {
              const state = JSON.parse(rawHabits);
              const updatedHabits = await Promise.all(
                state.dailyHabits.map(async (habit: any) => {
                  if (habit.id === dragItem.id) {
                    const reminderDays = habit.reminderDays || [];
                    let updatedDays = reminderDays;
                    if (!reminderDays.includes(dayOfWeek)) {
                      updatedDays = [...reminderDays, dayOfWeek];
                    }

                    // Cancel old reminders
                    await cancelReminderIds(habit.notificationIds || []);

                    // Reschedule
                    const rescheduled = await rescheduleHabitReminders({
                      ...habit,
                      reminderDays: updatedDays,
                    });
                    return rescheduled;
                  }
                  return habit;
                })
              );
              await AsyncStorage.setItem("todoapp:daily:v1", JSON.stringify({ ...state, dailyHabits: updatedHabits }));
            }
          }

          setSelectedDate(hDate);
          await loadDataFromStorage();
          void loadMonth(month.year, month.month);

          if (dragItem.type === "task") {
            emitStateChange("tasks_changed");
          } else if (dragItem.type === "habit") {
            emitStateChange("habits_changed");
          }
        } catch (err) {
          console.warn("Failed to update item scheduled date after drag drop", err);
        }
      }
    }

    setIsDragging(false);
    setActiveDragItem(null);
    setHoveredDate(null);
    setHoveredHour(null);
    hoveredDateRef.current = null;
    hoveredHourRef.current = null;
  }, [selectedDate, month.year, month.month, loadDataFromStorage, loadMonth, stopAutoScroll]);

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
    history,
    lists,
    addingTask,
    setAddingTask,
    onSaveNewTask,
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
  };
}
