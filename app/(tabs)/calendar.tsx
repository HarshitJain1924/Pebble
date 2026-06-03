import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  
  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { SegmentedSwitcher } from "@/components/ui/SegmentedSwitcher";
import { Spacing } from "@/constants/spacing";
import { Colors } from "@/constants/theme";
import { Typography } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  DailyHistory,
  getHistoryForMonth,
  historyForDate,
} from "@/services/productivityHistory";
import { addStateListener } from "@/services/stateEvents";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthKey = (date = new Date()) => ({
  year: date.getFullYear(),
  month: date.getMonth(),
});

const MONTH_NAMES = [
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

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarScreen() {
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

  // Drag and Drop rescheduling states
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<any | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  const touchStartRef = useRef({ x: 0, y: 0 });
  const monthGridRef = useRef<View>(null);
  const weekStripRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);

  const [monthGridBounds, setMonthGridBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [weekStripBounds, setWeekStripBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const measureMonthGrid = () => {
    monthGridRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setMonthGridBounds({ x, y, width, height });
      }
    });
  };

  const measureWeekStrip = () => {
    weekStripRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setWeekStripBounds({ x, y, width, height });
      }
    });
  };

  // Re-measure when calendar view mode changes or active screen focus
  useEffect(() => {
    const timer = setTimeout(() => {
      measureMonthGrid();
      measureWeekStrip();
    }, 400);
    return () => clearTimeout(timer);
  }, [month, calendarViewMode]);

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
      } else {
        setAllTodos([]);
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

  // Load data on focus and when month changes
  useFocusEffect(
    useCallback(() => {
      void loadMonth(month.year, month.month);
      void loadDataFromStorage();
    }, [loadMonth, loadDataFromStorage, month.month, month.year])
  );

  useEffect(() => {
    const unsubTasks = addStateListener("tasks_changed", () => {
      loadDataFromStorage();
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
      cells.push({ type: "empty", key: `empty-${i}` });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        type: "day",
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

  // Drag and Drop checking boundaries
  const checkHoveredDate = (x: number, y: number) => {
    if (calendarViewMode === "month" && monthGridBounds) {
      const { x: gx, y: gy, width: gw, height: gh } = monthGridBounds;
      if (x >= gx && x <= gx + gw && y >= gy && y <= gy + gh) {
        const localX = x - gx;
        const localY = y - gy;
        const colWidth = gw / 7;
        const numRows = Math.ceil(calendarCells.length / 7);
        const rowHeight = gh / numRows;

        const col = Math.floor(localX / colWidth);
        const row = Math.floor(localY / rowHeight);
        const idx = row * 7 + col;

        if (idx >= 0 && idx < calendarCells.length) {
          const cell = calendarCells[idx];
          if (cell.type === "day" && cell.dateString) {
            if (hoveredDate !== cell.dateString) {
              setHoveredDate(cell.dateString);
              Haptics.selectionAsync().catch(() => {});
            }
            return;
          }
        }
      }
    } else if (calendarViewMode === "week" && weekStripBounds) {
      const { x: wx, y: wy, width: ww, height: wh } = weekStripBounds;
      if (x >= wx && x <= wx + ww && y >= wy - 30 && y <= wy + wh + 30) {
        const localX = x - wx;
        const cellWidth = ww / 7;
        const col = Math.floor(localX / cellWidth);

        if (col >= 0 && col < weekDaysStrip.length) {
          const day = weekDaysStrip[col];
          if (hoveredDate !== day.dateString) {
            setHoveredDate(day.dateString);
            Haptics.selectionAsync().catch(() => {});
          }
          return;
        }
      }
    }
    setHoveredDate(null);
  };

  // Reschedule Persistence on Drop
  const handleDrop = async () => {
    if (activeDragItem && hoveredDate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      try {
        if (activeDragItem.type === "task") {
          const rawTodos = await AsyncStorage.getItem("todoapp:v1");
          if (rawTodos) {
            const state = JSON.parse(rawTodos);
            const updatedTodos = { ...state.todos };

            let found = false;
            for (const listId in updatedTodos) {
              updatedTodos[listId] = updatedTodos[listId].map((todo: any) => {
                if (todo.id === activeDragItem.id) {
                  found = true;
                  return { ...todo, scheduledDate: hoveredDate };
                }
                return todo;
              });
            }

            if (found) {
              await AsyncStorage.setItem("todoapp:v1", JSON.stringify({ ...state, todos: updatedTodos }));
            }
          }
        } else if (activeDragItem.type === "habit") {
          const dateParts = hoveredDate.split("-").map(Number);
          const selDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
          const dayOfWeek = selDate.getDay();

          const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
          if (rawHabits) {
            const state = JSON.parse(rawHabits);
            const updatedHabits = state.dailyHabits.map((habit: any) => {
              if (habit.id === activeDragItem.id) {
                const reminderDays = habit.reminderDays || [];
                if (!reminderDays.includes(dayOfWeek)) {
                  return { ...habit, reminderDays: [...reminderDays, dayOfWeek] };
                }
              }
              return habit;
            });
            await AsyncStorage.setItem("todoapp:daily:v1", JSON.stringify({ ...state, dailyHabits: updatedHabits }));
          }
        }

        setSelectedDate(hoveredDate);
        await loadDataFromStorage();
        void loadMonth(month.year, month.month);
      } catch (err) {
        console.warn("Failed to update item scheduled date after drag drop", err);
      }
    }

    setIsDragging(false);
    setActiveDragItem(null);
    setHoveredDate(null);
  };

  // Reanimated style for the absolute floating item
  const floatingCardStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      left: dragX.value - 120,
      top: dragY.value - 30,
      width: 240,
      opacity: 0.9,
      transform: [{ scale: 1.05 }],
      zIndex: 9999,
    };
  });

  const hoursRange = Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Animated.View entering={FadeInDown.duration(450).springify()} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!isDragging}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Screen Header */}
          <View style={[styles.header, { marginBottom: 8 }]}>
            <Text style={[styles.kicker, { color: colors.primary }]}>SCHEDULE</Text>
            <Text style={[styles.title, { color: colors.text }]}>Agenda Planner</Text>
          </View>

          {/* View Switcher segment */}
          <View style={{ marginVertical: 4 }}>
            <SegmentedSwitcher
              options={[
                { key: "month", label: "Month View" },
                { key: "week", label: "Week Agenda" },
              ]}
              activeKey={calendarViewMode}
              onChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setCalendarViewMode(val as any);
              }}
            />
          </View>

          {/* Calendar Navigation Card */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: colorScheme === "light" ? 0.04 : 0.15,
              shadowRadius: 16,
              elevation: 4,
              padding: 18,
              marginTop: Platform.OS === "ios" ? 12 : 8,
            }}
          >
            {/* Month View: Direct Calendar Grid Navigation */}
            {calendarViewMode === "month" && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Pressable
                    onPress={handlePrevMonth}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="chevron-left" size={18} color={colors.textMuted} />
                  </Pressable>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                    {MONTH_NAMES[month.month]} {month.year}
                  </Text>
                  <Pressable
                    onPress={handleNextMonth}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isLight ? "#F1F5F9" : "rgba(255,255,255,0.04)",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                {/* Weekday Headers */}
                <View
                  style={{
                    flexDirection: "row",
                    marginBottom: 6,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  {WEEKDAY_NAMES.map((name) => (
                    <Text key={name} style={{ flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>
                      {name.charAt(0)}
                    </Text>
                  ))}
                </View>

                {/* Days Grid */}
                <View
                  ref={monthGridRef}
                  onLayout={measureMonthGrid}
                  style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 4 }}
                >
                  {calendarCells.map((cell) => {
                    if (cell.type === "empty") {
                      return <View key={cell.key} style={{ width: "14.28%", height: 38 }} />;
                    }
                    const dateStr = cell.dateString || "";
                    const isSelected = selectedDate === dateStr;
                    const isToday = dateStr === getDateKey();
                    const isHovered = hoveredDate === dateStr;

                    const taskCount = allTodos.filter((t) => {
                      const hasDate = t.scheduledDate === dateStr;
                      const hasAlarm = t.alarmTime && getDateKey(new Date(t.alarmTime)) === dateStr;
                      return (hasDate || hasAlarm) && t.scheduledDate !== "inbox";
                    }).length;

                    return (
                      <Pressable
                        key={cell.key}
                        onPress={() => setSelectedDate(dateStr)}
                        style={{
                          width: "14.28%",
                          height: 38,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected
                              ? colors.primary
                              : isHovered
                              ? `${colors.primary}33`
                              : "transparent",
                            borderWidth: (isToday && !isSelected) || isHovered ? 1.5 : 0,
                            borderColor: isHovered
                              ? colors.primary
                              : isToday && !isSelected
                              ? colors.primary
                              : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              color: isSelected ? "#FFFFFF" : isToday ? colors.primary : colors.text,
                              fontSize: 13,
                              fontWeight: isSelected || isToday || isHovered ? "800" : "500",
                            }}
                          >
                            {cell.dayNum}
                          </Text>
                        </View>
                        {taskCount > 0 && !isSelected && (
                          <View
                            style={{
                              position: "absolute",
                              bottom: 2,
                              width: 4,
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: colors.primary,
                            }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Week View: Fixed 7-day Strip (Responsive Grid) */}
            {calendarViewMode === "week" && (
              <View
                ref={weekStripRef}
                onLayout={measureWeekStrip}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginHorizontal: -4,
                }}
              >
                {weekDaysStrip.map((day) => {
                  const isSelected = selectedDate === day.dateString;
                  const isHovered = hoveredDate === day.dateString;
                  return (
                    <Pressable
                      key={day.dateString}
                      onPress={() => setSelectedDate(day.dateString)}
                      style={[
                        styles.weekDayCell,
                        { flex: 1, marginHorizontal: 4 },
                        isSelected
                          ? {
                              backgroundColor: colors.primary,
                              borderColor: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.15)",
                            }
                          : isHovered
                          ? {
                              backgroundColor: `${colors.primary}33`,
                              borderColor: colors.primary,
                            }
                          : {
                              backgroundColor: colorScheme === "light" ? "#FFFFFF" : "rgba(255, 255, 255, 0.02)",
                              borderColor: colors.border,
                            },
                      ]}
                    >
                      <Text style={[styles.weekDayNameText, { color: isSelected ? "#ffffff" : colors.textMuted }]}>
                        {day.dayName}
                      </Text>
                      <Text style={[styles.weekDayNumText, { color: isSelected ? "#ffffff" : colors.text }]}>
                        {day.dayNum}
                      </Text>
                      {isSelected && <View style={[styles.activeDot, { backgroundColor: "#ffffff" }]} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Selected Date Info Strip */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 4,
              marginTop: 16,
              marginBottom: 4,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{headerDateLabel}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>
              {timelineItems.length} item{timelineItems.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Redesigned Planner Time-Block Section */}
          <View style={styles.plannerContainer}>
            {/* All Day / Anytime Section */}
            {allDayItems.length > 0 && (
              <View style={styles.allDaySection}>
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>ALL DAY</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}
                >
                  {allDayItems.map((item, idx) => (
                    <Pressable
                      key={item.id || idx}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        setActiveDragItem(item);
                        setIsDragging(true);
                        dragX.value = touchStartRef.current.x;
                        dragY.value = touchStartRef.current.y;
                        measureMonthGrid();
                        measureWeekStrip();
                      }}
                      onPressIn={(e) => {
                        touchStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        router.push(`/task-details?id=${item.id}&type=${item.type}&date=${selectedDate}`);
                      }}
                      style={[
                        styles.allDayCard,
                        {
                          marginRight: 4,
                          backgroundColor: item.completed
                            ? isLight
                              ? "#F1F5F9"
                              : "rgba(255, 255, 255, 0.03)"
                            : isLight
                            ? "#E2E8F0"
                            : "rgba(255, 255, 255, 0.08)",
                          borderColor: item.completed ? colors.border : colors.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.allDayCardText,
                          {
                            color: item.completed ? colors.textMuted : colors.text,
                            textDecorationLine: item.completed ? "line-through" : "none",
                          },
                        ]}
                      >
                        {item.type === "habit" ? `⚡ ${item.title}` : item.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Hourly Planner Visual Blocks */}
            <View style={styles.timelineGridWrapper}>
              {/* Background Hours & Lines */}
              {hoursRange.map((hr) => {
                const displayHour = hr === 12 ? 12 : hr % 12;
                const ampm = hr >= 12 ? "PM" : "AM";
                const timeStr = `${displayHour}:00 ${ampm}`;

                return (
                  <View key={hr} style={styles.hourRow}>
                    <View style={styles.hourLabelCol}>
                      <Text style={[styles.hourLabelText, { color: colors.textMuted }]}>{timeStr}</Text>
                    </View>
                    <View style={[styles.hourLineCol, { borderColor: colors.border }]} />
                  </View>
                );
              })}

              {/* Absolutely positioned task blocks */}
              <View style={styles.absoluteBlocksContainer}>
                {timedItemsWithLayout.map((item, idx) => {
                  const startMin = 0;
                  const startMinutes = item.reminderHour * 60 + item.reminderMinute;

                  const top = (startMinutes / 60) * 80;
                  const height = (item.durationMinutes / 60) * 80;

                  const widthPercent = 100 / item.totalCols;
                  const leftPercent = item.colIdx * widthPercent;

                  const isHabit = item.type === "habit";
                  let cardBg = isLight ? "#E2E8F0" : "rgba(255, 255, 255, 0.06)";
                  let textColor = colors.text;
                  let accentColor = isHabit ? colors.warning : colors.primary;

                  if (item.completed) {
                    cardBg = isLight ? "#F1F5F9" : "rgba(255, 255, 255, 0.02)";
                    textColor = colors.textMuted;
                  } else {
                    if (idx % 4 === 0) {
                      cardBg = isLight ? "#E0F2FE" : "rgba(56, 189, 248, 0.12)";
                      textColor = isLight ? "#0369A1" : "#7DD3FC";
                      accentColor = "#38BDF8";
                    } else if (idx % 4 === 1) {
                      cardBg = isLight ? "#F3E8FF" : "rgba(168, 85, 247, 0.12)";
                      textColor = isLight ? "#581C87" : "#D8B4FE";
                      accentColor = "#A855F7";
                    } else if (idx % 4 === 2) {
                      cardBg = isLight ? "#D1FAE5" : "rgba(16, 185, 129, 0.12)";
                      textColor = isLight ? "#064E3B" : "#6EE7B7";
                      accentColor = "#10B981";
                    } else {
                      cardBg = isLight ? "#FFE4E6" : "rgba(244, 63, 94, 0.12)";
                      textColor = isLight ? "#9F1239" : "#FDA4AF";
                      accentColor = "#F43F5E";
                    }
                  }

                  return (
                    <Pressable
                      key={item.id || idx}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        setActiveDragItem(item);
                        setIsDragging(true);
                        dragX.value = touchStartRef.current.x;
                        dragY.value = touchStartRef.current.y;
                        measureMonthGrid();
                        measureWeekStrip();
                      }}
                      onPressIn={(e) => {
                        touchStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        router.push(`/task-details?id=${item.id}&type=${item.type}&date=${selectedDate}`);
                      }}
                      style={[
                        styles.timedBlockCard,
                        {
                          top,
                          height: Math.max(36, height - 2),
                          left: `${leftPercent}%`,
                          width: `${widthPercent - 1}%`,
                          backgroundColor: cardBg,
                          borderLeftColor: accentColor,
                          borderLeftWidth: 3,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, padding: 6, justifyContent: "space-between" }}>
                        <View>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 9, fontWeight: "800", color: textColor, textTransform: "uppercase" }}>
                              {item.timeLabel} ({item.durationMinutes}m)
                            </Text>
                            {item.priority && item.priority !== "medium" && (
                              <Text
                                style={{
                                  fontSize: 8,
                                  fontWeight: "900",
                                  color: item.priority === "high" ? colors.error : colors.success,
                                }}
                              >
                                {item.priority.toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <Text
                            numberOfLines={height < 50 ? 1 : 2}
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: textColor,
                              marginTop: 2,
                              textDecorationLine: item.completed ? "line-through" : "none",
                            }}
                          >
                            {isHabit ? `⚡ ${item.title}` : item.title}
                          </Text>
                        </View>

                        {height >= 60 && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name={isHabit ? "zap" : "clock"} size={10} color={textColor} />
                            <Text style={{ fontSize: 9, color: textColor, opacity: 0.8 }}>
                              {isHabit ? "Habit" : "Task"}
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Floating Drag Overlay element */}
      {isDragging && activeDragItem && (
        <Animated.View style={floatingCardStyle} pointerEvents="none">
          <View
            style={{
              backgroundColor: activeDragItem.type === "habit" ? colors.warning : colors.primary,
              borderRadius: 14,
              padding: 12,
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 2 }}>
              {activeDragItem.timeLabel || "All Day"}
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
              {activeDragItem.title}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Full-screen gesture event responder overlay */}
      {isDragging && (
        <View
          style={[StyleSheet.absoluteFill, { zIndex: 9998, backgroundColor: "transparent" }]}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderMove={(evt) => {
            const { pageX, pageY } = evt.nativeEvent;
            dragX.value = pageX;
            dragY.value = pageY;
            checkHoveredDate(pageX, pageY);
          }}
          onResponderRelease={() => {
            void handleDrop();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
    paddingBottom: 110,
  },
  header: { gap: 4 },
  kicker: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontSize: Typography.sizes.display,
    fontWeight: "700",
    lineHeight: 38,
  },

  // Fixed week strip
  weekDayCell: {
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    gap: 5,
    position: "relative",
  },
  weekDayNameText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  weekDayNumText: { fontSize: 16, fontWeight: "800" },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 8,
  },

  // Planner Visual styles
  plannerContainer: {
    marginTop: 8,
    gap: 16,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  allDaySection: {
    gap: 4,
  },
  allDayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  allDayCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  allDayCardText: {
    fontSize: 12,
    fontWeight: "600",
  },
  timelineGridWrapper: {
    position: "relative",
    flexDirection: "column",
    marginTop: 10,
  },
  hourRow: {
    flexDirection: "row",
    height: 80,
  },
  hourLabelCol: {
    width: 65,
    alignItems: "flex-end",
    paddingRight: 10,
    paddingTop: 0,
  },
  hourLabelText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  hourLineCol: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  absoluteBlocksContainer: {
    position: "absolute",
    top: 0,
    left: 65,
    right: 0,
    bottom: 0,
  },
  timedBlockCard: {
    position: "absolute",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});
