import React, { FC, FunctionComponent, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import type { IPopupRenderContext } from "../typings/motion-tabs";
import { addStateListener, emitStateChange } from "@/services/stateEvents";
import { isRecurringOccurrenceForDate } from "@/services/recurrence";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// Helper functions for Date keys
const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getTodoDateKey = (todo: any) => {
  if (todo.scheduledDate) return todo.scheduledDate;
  if (todo.alarmTime) return getDateKey(new Date(todo.alarmTime));
  const idNum = Number(todo.id);
  if (!isNaN(idNum) && idNum > 100000000000) return getDateKey(new Date(idNum));
  return getDateKey();
};

const PopupBody: FC<IPopupRenderContext> & FunctionComponent<IPopupRenderContext> = ({
  colors,
  route,
  view,
}) => {
  const router = useRouter();
  const routeName = route.name; // "index", "tasks", "calendar", "focus"
  const colorScheme = useColorScheme() ?? "dark";
  const errorColor = Colors[colorScheme].error;

  const [stats, setStats] = useState({
    tasksCompleted: 0,
    tasksTotal: 0,
    habitsCompleted: 0,
    habitsTotal: 0,
  });
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [activePriority, setActivePriority] = useState("all");
  const [loading, setLoading] = useState(true);
  const [activeHabitsList, setActiveHabitsList] = useState<any[]>([]);
  const [overdueTasksList, setOverdueTasksList] = useState<any[]>([]);

  // Data Loading Logic
  const loadData = useCallback(async () => {
    try {
      const todayStr = getDateKey();

      // 1. Load Tasks & stats
      const rawTodos = await AsyncStorage.getItem("todoapp:v1");
      let listFolders: any[] = [];
      let tTotal = 0;
      let tComp = 0;
      const workspaceCounts: Record<string, number> = {};
      let overdueList: any[] = [];

      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        if (parsed.lists) {
          listFolders = parsed.lists;
        }

        Object.entries(parsed.todos || {}).forEach(([wsId, wsTodos]: [string, any]) => {
          let pendingCount = 0;
          wsTodos.forEach((todo: any) => {
            if (todo.archived) return;
            const todoDate = getTodoDateKey(todo);
            const isTodayOrOverdue = todoDate <= todayStr || todo.scheduledDate === "inbox";
            if (isTodayOrOverdue) {
              if (todo.completed) {
                tComp++;
              } else {
                pendingCount++;
              }
              tTotal++;
            }
            const isOverdue = !todo.completed && todoDate < todayStr && todo.scheduledDate !== "inbox";
            if (isOverdue) {
              overdueList.push({
                ...todo,
                folderId: todo.folderId || wsId,
              });
            }
          });
          workspaceCounts[wsId] = pendingCount;
        });
      }

      overdueList.sort((a, b) => {
        const orderA = a.priority === "high" ? 0 : a.priority === "low" ? 2 : 1;
        const orderB = b.priority === "high" ? 0 : b.priority === "low" ? 2 : 1;
        return orderA - orderB;
      });
      setOverdueTasksList(overdueList);

      // 2. Load Habits
      const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
      let hTotal = 0;
      let hComp = 0;
      let todayActiveHabits: any[] = [];
      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const dayOfWeek = new Date().getDay();
        todayActiveHabits = (parsed.dailyHabits || []).filter((h: any) => {
          if (h.archived) return false;
          if (h.recurrence) {
            return isRecurringOccurrenceForDate(h, todayStr);
          }
          return !h.reminderDays || h.reminderDays.length === 0 || h.reminderDays.includes(dayOfWeek);
        });
        hTotal = todayActiveHabits.length;
        hComp = todayActiveHabits.filter((h: any) => h.completedToday).length;
      }
      setActiveHabitsList(todayActiveHabits);

      setStats({
        tasksCompleted: tComp,
        tasksTotal: tTotal,
        habitsCompleted: hComp,
        habitsTotal: hTotal,
      });

      // Standardize Workspaces
      const defaultFolders = [{ id: "default", name: "My Pebbles", emoji: "📋", color: "#6366F1" }];
      const finalFolders = listFolders.length > 0 ? listFolders : defaultFolders;
      setWorkspaces(
        finalFolders.map((lf) => ({
          ...lf,
          pendingTasks: workspaceCounts[lf.id] || 0,
        }))
      );

      // Load Filter States
      const dashboardFilter = await AsyncStorage.getItem("todoapp:dashboard:filter");
      const priorityFilter = await AsyncStorage.getItem("todoapp:dashboard:priority");
      if (dashboardFilter) setActiveFilter(dashboardFilter);
      if (priorityFilter) setActivePriority(priorityFilter);

    } catch (e) {
      console.warn("Failed to load drawer data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listeners to refresh state when items change
  useEffect(() => {
    loadData();

    const unsubTasks = addStateListener("tasks_changed", loadData);
    const unsubHabits = addStateListener("habits_changed", loadData);
    const unsubProfile = addStateListener("profile_changed", loadData);

    return () => {
      unsubTasks();
      unsubHabits();
      unsubProfile();
    };
  }, [loadData]);

  // Today Panel Actions
  const toggleDashboardFilter = async (filter: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveFilter(filter);
    await AsyncStorage.setItem("todoapp:dashboard:filter", filter);
    emitStateChange("dashboard_filter_changed");
  };

  const togglePriorityFilter = async (priority: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActivePriority(priority);
    await AsyncStorage.setItem("todoapp:dashboard:priority", priority);
    emitStateChange("dashboard_filter_changed");
  };

  const toggleHabitInDrawer = async (habitId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const rawHabits = await AsyncStorage.getItem("todoapp:daily:v1");
      if (!rawHabits) return;

      const parsed = JSON.parse(rawHabits);
      const habits = parsed.dailyHabits || [];
      const today = getDateKey();
      const yesterday = getDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const nextHabits = habits.map((h: any) => {
        if (h.id !== habitId) return h;

        const nextCompleted = !h.completedToday;
        let streak = h.streak || 0;
        if (nextCompleted) {
          let nextStreak = 1;
          if (h.lastCompletedDate === today) {
            nextStreak = h.streak || 1;
          } else if (h.lastCompletedDate === yesterday) {
            nextStreak = (h.streak || 0) + 1;
          }
          streak = nextStreak;
        } else {
          streak = Math.max(0, streak - 1);
        }

        return {
          ...h,
          completedToday: nextCompleted,
          streak,
          bestStreak: Math.max(h.bestStreak || 0, streak),
          lastCompletedDate: nextCompleted ? today : (streak > 0 ? yesterday : undefined),
        };
      });

      await AsyncStorage.setItem("todoapp:daily:v1", JSON.stringify({ dailyHabits: nextHabits }));

      try {
        const { recordDailyHistorySnapshot } = require("@/services/productivityHistory");
        void recordDailyHistorySnapshot();
      } catch {}

      try {
        const target = habits.find((h: any) => h.id === habitId);
        const { earnPebble, undoLastPebble } = require("@/services/pebbleService");
        if (target) {
          if (!target.completedToday) {
            await earnPebble("habit");
          } else {
            await undoLastPebble("habit");
          }
        }
      } catch {}

      emitStateChange("habits_changed");
    } catch (e) {
      console.warn("Failed to toggle habit in drawer", e);
    }
  };

  const completeTaskInDrawer = async (taskId: string, folderId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const rawTodos = await AsyncStorage.getItem("todoapp:v1");
      if (!rawTodos) return;

      const parsed = JSON.parse(rawTodos);
      const todos = parsed.todos || {};
      
      const listId = folderId || "default";
      const listTodos = todos[listId] || [];
      
      const nextListTodos = listTodos.map((todo: any) => {
        if (todo.id !== taskId) return todo;
        return { ...todo, completed: true };
      });
      
      todos[listId] = nextListTodos;
      
      await AsyncStorage.setItem("todoapp:v1", JSON.stringify({ ...parsed, todos }));
      
      try {
        const { earnPebble } = require("@/services/pebbleService");
        await earnPebble("task");
      } catch {}

      await loadData();
      emitStateChange("tasks_changed");
    } catch (e) {
      console.warn("Failed to complete task in drawer", e);
    }
  };

  const handleEnterZenMode = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    emitStateChange("zen_mode_toggle");
    emitStateChange("close_drawer");
  };

  const handleOpenReview = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    emitStateChange("review_day_open");
    emitStateChange("close_drawer");
  };

  // Workspace Actions
  const selectWorkspace = (wsId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.navigate({ pathname: "/tasks", params: { folderId: wsId } });
    emitStateChange("close_drawer");
  };

  // Calendar Actions
  const selectScheduleDate = async (offsetDays: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offsetDays);
    const dateStr = getDateKey(targetDate);

    await AsyncStorage.setItem("todoapp:calendar:selectedDate", dateStr);
    emitStateChange("tasks_changed");
    router.navigate("/calendar");
    emitStateChange("close_drawer");
  };

  // Focus Preset Actions
  const startFocusPreset = async (minutes: number, isBreak = false) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const durationSeconds = minutes * 60;

    const sessionObj = {
      type: isBreak ? "break" : "work",
      startTime: Date.now(),
      duration: durationSeconds,
      elapsedBeforeStart: 0,
      isActive: true,
      breakType: isBreak ? (minutes === 5 ? "short" : "long") : "short",
      focusedTaskId: null,
      loggedMinutes: 0,
      lastSaved: Date.now(),
    };

    // If starting a preset, remove any stopwatch states
    await AsyncStorage.removeItem("todoapp:focus:current_stopwatch");
    await AsyncStorage.setItem("todoapp:focus:current_session", JSON.stringify(sessionObj));

    emitStateChange("focus_changed", "popup-body");
    router.navigate("/focus");
    emitStateChange("close_drawer");
  };

  // ---------------- Render Helpers ----------------

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  // 1. TODAY PANEL
  if (routeName === "index") {
    const totalPebbles = stats.tasksTotal + stats.habitsTotal;
    const completedPebbles = stats.tasksCompleted + stats.habitsCompleted;
    const currentHour = new Date().getHours();
    const isEvening = currentHour >= 18;

    return (
      <View style={styles.container}>
        {isEvening ? (
          // Evening Mode (Reflection)
          <View style={{ width: "100%" }}>
            <View style={[styles.headerRow, { marginBottom: 6 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 18 }}>🌙</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Evening Wind Down</Text>
              </View>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                {completedPebbles}/{totalPebbles} pebbles dropped
              </Text>
            </View>

            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 16 }}>
              {completedPebbles > 0
                ? `Wonderful job! You dropped ${completedPebbles} pebbles today and secured your daily streak.`
                : "A quiet day. Take a moment to reflect and set your intentions for tomorrow."}
            </Text>

            <Pressable
              onPress={handleOpenReview}
              style={{
                backgroundColor: "#F59E0B",
                borderRadius: 16,
                paddingVertical: 12,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 4,
                marginBottom: 4,
                shadowColor: "#F59E0B",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 6,
                elevation: 2,
              }}
            >
              <Feather name="edit-3" size={16} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 }}>
                REVIEW MY DAY
              </Text>
            </Pressable>
          </View>
        ) : (
          // Daytime Mode (Focus & Overdue Tasks Check)
          <View style={{ width: "100%" }}>
            <View style={[styles.headerRow, { marginBottom: 12 }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>Today's Focus</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                {completedPebbles}/{totalPebbles} completed
              </Text>
            </View>

            <Pressable
              onPress={handleEnterZenMode}
              style={{
                alignSelf: "center",
                backgroundColor: colors.accent,
                borderRadius: 20,
                paddingVertical: 9,
                paddingHorizontal: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 2,
                marginBottom: 16,
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.12,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Feather name="target" size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 }}>
                ENTER ZEN MODE
              </Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { color: colors.muted, marginTop: 4, marginBottom: 8 }]}>
              OVERDUE TASKS
            </Text>

            {overdueTasksList.length === 0 ? (
              <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 12 }}>
                No overdue tasks. You are all caught up!
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 6, paddingBottom: 4 }}>
                  {overdueTasksList.map((todo) => (
                    <Pressable
                      key={todo.id}
                      onPress={() => completeTaskInDrawer(todo.id, todo.folderId)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        backgroundColor: colors.input,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 1.5,
                            borderColor: errorColor,
                            backgroundColor: "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {/* Circle empty checkbox */}
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: colors.foreground,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {todo.title}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor: `${errorColor}12`,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          borderWidth: 0.5,
                          borderColor: `${errorColor}30`,
                        }}
                      >
                        <Text style={{ fontSize: 8, fontWeight: "800", color: errorColor }}>
                          OVERDUE
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  }

  // 2. WORKSPACES PANEL
  if (routeName === "tasks") {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Quick Switcher</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {workspaces.length} Workspace{workspaces.length !== 1 ? "s" : ""}
          </Text>
        </View>

        <ScrollView style={styles.workspaceScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.workspaceGrid}>
            {workspaces.map((ws) => (
              <Pressable
                key={ws.id}
                onPress={() => selectWorkspace(ws.id)}
                style={[
                  styles.workspaceCard,
                  {
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.workspaceIconContainer, { backgroundColor: `${ws.color || colors.accent}12` }]}>
                  <Text style={styles.workspaceEmoji}>{ws.emoji || "📁"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.workspaceName, { color: colors.foreground }]} numberOfLines={1}>
                    {ws.name}
                  </Text>
                  {ws.pendingTasks > 0 && (
                    <Text style={[styles.workspaceCount, { color: colors.accent }]}>
                      {ws.pendingTasks} pending
                    </Text>
                  )}
                </View>
                <Feather name="chevron-right" size={14} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // 3. SCHEDULE PANEL
  if (routeName === "calendar") {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Jump Schedule</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Quick agenda views</Text>
        </View>

        <View style={styles.agendaGrid}>
          {[
            { label: "Today", offset: 0, desc: "See agenda for today", icon: "calendar" },
            { label: "Tomorrow", offset: 1, desc: "Prepare for tomorrow", icon: "arrow-right" },
            { label: "Day After", offset: 2, desc: "Look further ahead", icon: "chevrons-right" },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => selectScheduleDate(item.offset)}
              style={[
                styles.agendaButton,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: `${colors.accent}12` }]}>
                <Feather name={item.icon as any} size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.agendaLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.agendaDesc, { color: colors.muted }]}>{item.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // 4. FOCUS PANEL
  if (routeName === "focus") {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Start Session</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Launch focus presets</Text>
        </View>

        <View style={styles.focusPresetsGrid}>
          {[
            { label: "25m Focus", duration: 25, isBreak: false, icon: "zap", accent: colors.accent },
            { label: "50m Focus", duration: 50, isBreak: false, icon: "award", accent: colors.accent },
            { label: "5m Break", duration: 5, isBreak: true, icon: "coffee", accent: "#10B981" },
            { label: "15m Break", duration: 15, isBreak: true, icon: "sun", accent: "#F59E0B" },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => startFocusPreset(item.duration, item.isBreak)}
              style={[
                styles.focusPresetCard,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: `${item.accent}12` }]}>
                <Feather name={item.icon as any} size={18} color={item.accent} />
              </View>
              <Text style={[styles.presetLabel, { color: colors.foreground }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  loadingContainer: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    padding: 16,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  workspaceScroll: {
    maxHeight: 180,
  },
  workspaceGrid: {
    gap: 6,
  },
  workspaceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  workspaceIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceEmoji: {
    fontSize: 16,
  },
  workspaceName: {
    fontSize: 13,
    fontWeight: "700",
  },
  workspaceCount: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  agendaGrid: {
    gap: 8,
  },
  agendaButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  agendaLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  agendaDesc: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  focusPresetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  focusPresetCard: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
});

export { PopupBody };
