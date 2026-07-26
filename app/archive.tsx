import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { type Habit, Task } from "@/shared/types/domain.types";
import { normalizeTaskCategory } from "@/features/tasks/services/task-categories";

import { getHabitCurrentStreak } from "@/shared/utils/domain-selectors";
import { AppCard } from "@/shared/components/ui/AppCard";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { emitStateChange } from "@/services/events/state-events";
import { useUndo } from "@/shared/components/ui/UndoContext";
import {
    TaskRepository,
    HabitRepository,
    WorkspaceRepository,
} from "@/repositories";

export default function ArchiveScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const { showToast } = useUndo();

  const [loading, setLoading] = useState(true);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({});

  useEffect(() => {
    loadArchivedData();
  }, []);

  const loadArchivedData = async () => {
    setLoading(true);
    try {
      const folderList = await WorkspaceRepository.getWorkspaces();
      const folderIds = Array.from(
        new Set(["default", "unassigned", ...folderList.map((f) => f.id)]),
      );

      const workspaceNames: Record<string, string> = {};
      folderList.forEach((f) => {
        workspaceNames[f.id] = f.name;
      });
      workspaceNames["default"] = "My Pebbles";
      workspaceNames["unassigned"] = "My Pebbles";

      const tasks: Task[] = [];
      const habits: Habit[] = [];
      const todayStr = new Date().toISOString().split("T")[0];

      for (const fId of folderIds) {
        // Load tasks
        const tasksMap = await TaskRepository.getTasks(fId);
        Object.values(tasksMap).forEach((t) => {
          if (t.archivedAt) {
            tasks.push(t);
          }
        });

        // Load habits
        const habitsMap = await HabitRepository.getHabits(fId);
        Object.values(habitsMap).forEach((h) => {
          if (h.archivedAt) {
            habits.push(h);
          }
        });
      }

      setWorkspaces(workspaceNames);
      setArchivedTasks(tasks);
      setArchivedHabits(habits);
    } catch (e) {
      console.warn("Failed to load archived items", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: any, type: "task" | "habit") => {
    try {
      const isTask = type === "task";
      const updatedItem = {
        ...item,
        archived: false,
        lastUpdated: new Date().toISOString().split("T")[0],
      };

      // Reschedule reminders
      let notificationIds: string[] = [];
      if (
        item.reminderHour !== undefined &&
        item.reminderMinute !== undefined
      ) {
        const scheduled = await scheduleReminderBatch({
          kind: type === "task" ? "todo" : "habit",
          itemId: item.id,
          title: item.title,
          category: item.category,
          dailyTime: { hour: item.reminderHour, minute: item.reminderMinute },
          dailyDays: item.reminderDays,
          recurrence: item.recurrence,
          escalationMinutes: [120, 240],
          channelId:
            Platform.OS === "android"
              ? isTask
                ? "todo-reminders"
                : "daily-habits"
              : undefined,
        });
        notificationIds = scheduled.ids;
      }
      updatedItem.notificationIds = notificationIds;

      if (isTask) {
        await TaskRepository.saveTask({
          ...updatedItem,
          folderId: item.folderId || "default",
          scheduledDate: updatedItem.scheduledDate || updatedItem.dueDate,
        });
      } else {
        await HabitRepository.saveHabit({
          ...updatedItem,
          folderId: item.folderId || "default",
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");
      showToast(`Restored "${item.title}"`);
      loadArchivedData();
    } catch (e) {
      console.warn("Failed to restore item", e);
    }
  };

  const handleDeletePermanently = (item: any, type: "task" | "habit") => {
    Alert.alert(
      "Delete Permanently",
      `Are you sure you want to permanently delete "${item.title}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const isTask = type === "task";
              await cancelReminderIds(item.notificationIds || []);

              if (isTask) {
                await TaskRepository.deleteTask(
                  item.id,
                  item.folderId || "default",
                );
              } else {
                await HabitRepository.deleteHabit(
                  item.id,
                  item.folderId || "default",
                );
              }

              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              ).catch(() => {});
              emitStateChange(isTask ? "tasks_changed" : "habits_changed");
              loadArchivedData();
            } catch (e) {
              console.warn("Failed to delete item permanently", e);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Archived Items
        </Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Archived Tasks */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              Archived Tasks
            </Text>
            {archivedTasks.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  No archived tasks
                </Text>
              </View>
            ) : (
              archivedTasks.map((todo) => (
                <AppCard
                  key={todo.id}
                  style={[styles.itemCard, { borderColor: colors.border }]}
                >
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>
                      {todo.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: isLight
                              ? "#E2E8F8"
                              : "rgba(255,255,255,0.03)",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          💼 {workspaces[todo.workspaceId || ""] || "Default"}
                        </Text>
                      </View>
                      {todo.priority && (
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isLight
                                ? "#F8E2E2"
                                : "rgba(255,255,255,0.03)",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color:
                                todo.priority === "high"
                                  ? colors.error
                                  : colors.textMuted,
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            {todo.priority.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => handleRestore(todo, "task")}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: `${colors.success}15` },
                      ]}
                    >
                      <Feather
                        name="rotate-ccw"
                        size={16}
                        color={colors.success}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePermanently(todo, "task")}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: `${colors.error}15` },
                      ]}
                    >
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </AppCard>
              ))
            )}
          </View>

          {/* Archived Habits */}
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              Archived Habits
            </Text>
            {archivedHabits.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  No archived habits
                </Text>
              </View>
            ) : (
              archivedHabits.map((habit) => (
                <AppCard
                  key={habit.id}
                  style={[styles.itemCard, { borderColor: colors.border }]}
                >
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>
                      {habit.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: isLight
                              ? "#E2E8F8"
                              : "rgba(255,255,255,0.03)",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          🔥 Streak: {getHabitCurrentStreak(habit)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => handleRestore(habit, "habit")}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: `${colors.success}15` },
                      ]}
                    >
                      <Feather
                        name="rotate-ccw"
                        size={16}
                        color={colors.success}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePermanently(habit, "habit")}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: `${colors.error}15` },
                      ]}
                    >
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </AppCard>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? 44 : 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  scrollContent: { padding: 18, paddingBottom: 60 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  itemInfo: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 15, fontWeight: "700" },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
