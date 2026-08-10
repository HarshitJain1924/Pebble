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
import { type Checklist, type Habit, type Resource, Task, INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID } from "@/shared/types/domain.types";

import { getHabitCurrentStreak } from "@/shared/utils/domain-selectors";
import { AppCard } from "@/shared/components/ui/AppCard";
import { cancelReminderIds, scheduleReminderBatch } from "@/services/scheduling/reminders.service";
import { recurrenceRuleToScheduler } from "@/services/scheduling/recurrence-mapper";
import { getDateKey } from "@/services/scheduling/recurrence.service";
import { emitStateChange } from "@/services/events/state-events";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { useUndo } from "@/shared/components/ui/UndoContext";
import {
    TaskRepository,
    HabitRepository,
    ChecklistRepository,
    ResourceRepository,
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
  const [archivedChecklists, setArchivedChecklists] = useState<Checklist[]>([]);
  const [archivedResources, setArchivedResources] = useState<Resource[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({});

  useEffect(() => {
    loadArchivedData();
  }, []);

  const loadArchivedData = async () => {
    setLoading(true);
    try {
      const folderList = await WorkspaceRepository.getWorkspaces();
      const folderIds = Array.from(
        new Set([INBOX_WORKSPACE_ID, MY_PEBBLES_WORKSPACE_ID, ...folderList.map((f) => f.id)]),
      );

      const workspaceNames: Record<string, string> = {};
      folderList.forEach((f) => {
        workspaceNames[f.id] = f.name;
      });
      workspaceNames[INBOX_WORKSPACE_ID] = "Inbox";
      workspaceNames[MY_PEBBLES_WORKSPACE_ID] = "My Pebbles";

      const tasks: Task[] = [];
      const habits: Habit[] = [];
      const checklists: Checklist[] = [];
      const resources: Resource[] = [];

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

        // Load checklists
        const checklistsMap = await ChecklistRepository.getChecklists(fId);
        Object.values(checklistsMap).forEach((c) => {
          if (c.archivedAt) {
            checklists.push(c);
          }
        });

        // Load resources
        const resourcesMap = await ResourceRepository.getResources(fId);
        Object.values(resourcesMap).forEach((r) => {
          if (r.archivedAt) {
            resources.push(r);
          }
        });
      }

      setWorkspaces(workspaceNames);
      setArchivedTasks(tasks);
      setArchivedHabits(habits);
      setArchivedChecklists(checklists);
      setArchivedResources(resources);
    } catch (e) {
      console.warn("Failed to load archived items", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: any, type: "task" | "habit" | "checklist" | "resource") => {
    try {
      const isTask = type === "task";
      const updatedItem = {
        ...item,
        archivedAt: undefined,
        lastUpdated: getDateKey(),
      };

      // Reschedule reminders from canonical `reminder.triggerAt`
      let notificationIds: string[] = [];
      if (item.reminder?.triggerAt) {
        const d = new Date(item.reminder.triggerAt);
        const scheduled = await scheduleReminderBatch({
          kind: type === "task" ? "todo" : "habit",
          itemId: item.id,
          title: item.title,
          category: item.categoryId || item.category || "work",
          dailyTime: { hour: d.getHours(), minute: d.getMinutes() },
          dailyDays: item.recurrence?.daysOfWeek,
          recurrence: recurrenceRuleToScheduler(item.recurrence),
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
      // Write notificationIds into canonical reminder (not top-level legacy)
      if (notificationIds.length > 0) {
        updatedItem.reminder = {
          ...(updatedItem.reminder || { enabled: true, triggerAt: item.reminder?.triggerAt || 0 }),
          notificationIds,
        };
      }

      // Write canonical schedule (no legacy fields)
      if (isTask) {
        // Repository has already normalized via normalizeTask — schedule.date is canonical
        delete updatedItem.scheduledDate;
        delete updatedItem.dueDate;
      }

      // Strip legacy flat reminder fields — canonical only
      delete updatedItem.reminderHour;
      delete updatedItem.reminderMinute;
      delete updatedItem.reminderDays;

      if (type === "task") {
        await TaskRepository.saveTask({
          ...updatedItem,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });
      } else if (type === "habit") {
        await HabitRepository.saveHabit({
          ...updatedItem,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });
      } else if (type === "checklist") {
        await ChecklistRepository.saveChecklist({
          ...updatedItem,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });
      } else if (type === "resource") {
        await ResourceRepository.saveResource({
          ...updatedItem,
          workspaceId: item.workspaceId || INBOX_WORKSPACE_ID,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      emitStateChange(type === "task" ? "tasks_changed" : type === "habit" ? "habits_changed" : type === "checklist" ? "checklists_changed" : "resources_changed");
      showToast(`Restored "${item.title}"`);
      loadArchivedData();
    } catch (e) {
      console.warn("Failed to restore item", e);
    }
  };

  const handleDeletePermanently = (item: any, type: "task" | "habit" | "checklist" | "resource") => {
    const typeLabel = type === "task" ? "Task" : type === "habit" ? "Habit" : type === "checklist" ? "Checklist" : "Resource";
    Alert.alert(
      "Delete Permanently",
      `Are you sure you want to permanently delete this ${typeLabel}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const wsId = item.workspaceId || INBOX_WORKSPACE_ID;

              if (type === "task") {
                await EntityCommandService.permanentlyDeleteTask(item.id, wsId);
              } else {
                await cancelReminderIds(item.reminder?.notificationIds);
                if (type === "habit") {
                  await HabitRepository.deleteHabit(item.id, wsId);
                } else if (type === "checklist") {
                  await ChecklistRepository.deleteChecklist(item.id, wsId);
                } else if (type === "resource") {
                  await ResourceRepository.deleteResource(item.id, wsId);
                }
              }

              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              ).catch(() => {});
              
              if (type !== "task") {
                emitStateChange(type === "habit" ? "habits_changed" : type === "checklist" ? "checklists_changed" : "resources_changed");
              }
              
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
                          💼 {workspaces[todo.workspaceId || ""] || "Inbox"}
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

          {/* Archived Checklists */}
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              Archived Checklists
            </Text>
            {archivedChecklists.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  No archived checklists
                </Text>
              </View>
            ) : (
              archivedChecklists.map((cl) => (
                <AppCard
                  key={cl.id}
                  style={[styles.itemCard, { borderColor: colors.border }]}
                >
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>
                      {cl.title}
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
                          📋 {cl.items?.length || 0} items
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => handleRestore(cl, "checklist")}
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
                      onPress={() => handleDeletePermanently(cl, "checklist")}
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

          {/* Archived Resources */}
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              Archived Resources
            </Text>
            {archivedResources.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  No archived resources
                </Text>
              </View>
            ) : (
              archivedResources.map((res) => (
                <AppCard
                  key={res.id}
                  style={[styles.itemCard, { borderColor: colors.border }]}
                >
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>
                      {res.title}
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
                          {res.type === "link" ? "🔗" : res.type === "note" ? "📝" : "📦"} {res.type}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => handleRestore(res, "resource")}
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
                      onPress={() => handleDeletePermanently(res, "resource")}
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
