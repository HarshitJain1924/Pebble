import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type Todo, type Habit } from "@/modules/types";
import { TODOS_STORAGE_KEY, DAILY_STORAGE_KEY } from "@/services/storage";
import { emitStateChange } from "@/services/stateEvents";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/reminders";
import { AppCard } from "@/components/AppCard";

export default function ArchiveScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const [loading, setLoading] = useState(true);
  const [archivedTasks, setArchivedTasks] = useState<Todo[]>([]);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({});

  useEffect(() => {
    loadArchivedData();
  }, []);

  const loadArchivedData = async () => {
    setLoading(true);
    try {
      // Load tasks
      const rawTodos = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      const tasks: Todo[] = [];
      const workspaceNames: Record<string, string> = {};
      if (rawTodos) {
        const parsed = JSON.parse(rawTodos);
        if (parsed.lists) {
          parsed.lists.forEach((list: any) => {
            workspaceNames[list.id] = list.name;
          });
        }
        for (const listId in parsed.todos) {
          const listTodos = parsed.todos[listId] || [];
          listTodos.forEach((todo: Todo) => {
            if (todo.archived) {
              tasks.push(todo);
            }
          });
        }
      }
      setWorkspaces(workspaceNames);
      setArchivedTasks(tasks);

      // Load habits
      const rawHabits = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
      const habits: Habit[] = [];
      if (rawHabits) {
        const parsed = JSON.parse(rawHabits);
        const listHabits = parsed.dailyHabits || [];
        listHabits.forEach((habit: Habit) => {
          if (habit.archived) {
            habits.push(habit);
          }
        });
      }
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
      if (item.reminderHour !== undefined && item.reminderMinute !== undefined) {
        const scheduled = await scheduleReminderBatch({
          kind: type === "task" ? "todo" : "habit",
          itemId: item.id,
          title: item.title,
          category: item.category,
          dailyTime: { hour: item.reminderHour, minute: item.reminderMinute },
          dailyDays: item.reminderDays,
          recurrence: item.recurrence,
          escalationMinutes: [120, 240],
          channelId: Platform.OS === "android" ? (isTask ? "todo-reminders" : "daily-habits") : undefined,
        });
        notificationIds = scheduled.ids;
      }
      updatedItem.notificationIds = notificationIds;

      if (isTask) {
        const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
        if (raw) {
          const state = JSON.parse(raw);
          const fId = item.folderId || "default";
          state.todos[fId] = (state.todos[fId] || []).map((t: Todo) =>
            t.id === item.id ? updatedItem : t
          );
          await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
        }
      } else {
        const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
        if (raw) {
          const state = JSON.parse(raw);
          state.dailyHabits = state.dailyHabits.map((h: Habit) =>
            h.id === item.id ? updatedItem : h
          );
          await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      emitStateChange(isTask ? "tasks_changed" : "habits_changed");
      Alert.alert("Success", `"${item.title}" has been restored successfully!`);
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
                const raw = await AsyncStorage.getItem(TODOS_STORAGE_KEY);
                if (raw) {
                  const state = JSON.parse(raw);
                  const fId = item.folderId || "default";
                  state.todos[fId] = (state.todos[fId] || []).filter((t: Todo) => t.id !== item.id);
                  await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(state));
                }
              } else {
                const raw = await AsyncStorage.getItem(DAILY_STORAGE_KEY);
                if (raw) {
                  const state = JSON.parse(raw);
                  state.dailyHabits = state.dailyHabits.filter((h: Habit) => h.id !== item.id);
                  await AsyncStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
                }
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              emitStateChange(isTask ? "tasks_changed" : "habits_changed");
              loadArchivedData();
            } catch (e) {
              console.warn("Failed to delete item permanently", e);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Archived Items</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Archived Tasks */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Archived Tasks</Text>
            {archivedTasks.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>No archived tasks</Text>
              </View>
            ) : (
              archivedTasks.map((todo) => (
                <AppCard key={todo.id} style={[styles.itemCard, { borderColor: colors.border }]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{todo.title}</Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.badge, { backgroundColor: isLight ? "#E2E8F8" : "rgba(255,255,255,0.03)" }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>
                          💼 {workspaces[todo.folderId || ""] || "Default"}
                        </Text>
                      </View>
                      {todo.priority && (
                        <View style={[styles.badge, { backgroundColor: isLight ? "#F8E2E2" : "rgba(255,255,255,0.03)" }]}>
                          <Text style={{ color: todo.priority === "high" ? colors.error : colors.textMuted, fontSize: 10, fontWeight: "700" }}>
                            {todo.priority.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity onPress={() => handleRestore(todo, "task")} style={[styles.actionBtn, { backgroundColor: `${colors.success}15` }]}>
                      <Feather name="rotate-ccw" size={16} color={colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeletePermanently(todo, "task")} style={[styles.actionBtn, { backgroundColor: `${colors.error}15` }]}>
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </AppCard>
              ))
            )}
          </View>

          {/* Archived Habits */}
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Archived Habits</Text>
            {archivedHabits.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>No archived habits</Text>
              </View>
            ) : (
              archivedHabits.map((habit) => (
                <AppCard key={habit.id} style={[styles.itemCard, { borderColor: colors.border }]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{habit.title}</Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.badge, { backgroundColor: isLight ? "#E2E8F8" : "rgba(255,255,255,0.03)" }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>
                          🔥 Streak: {habit.streak}
                        </Text>
                      </View>
                      {habit.priority && (
                        <View style={[styles.badge, { backgroundColor: isLight ? "#F8E2E2" : "rgba(255,255,255,0.03)" }]}>
                          <Text style={{ color: habit.priority === "high" ? colors.error : colors.textMuted, fontSize: 10, fontWeight: "700" }}>
                            {habit.priority.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity onPress={() => handleRestore(habit, "habit")} style={[styles.actionBtn, { backgroundColor: `${colors.success}15` }]}>
                      <Feather name="rotate-ccw" size={16} color={colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeletePermanently(habit, "habit")} style={[styles.actionBtn, { backgroundColor: `${colors.error}15` }]}>
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
  sectionTitle: { fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
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
