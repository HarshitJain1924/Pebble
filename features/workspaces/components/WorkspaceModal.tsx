import {
  HabitRepository,
  TaskRepository,
  WorkspaceRepository,
} from "@/repositories";
import { emitStateChange } from "@/services/events/state-events";
import {
  cancelReminderIds,
  rescheduleHabitReminders,
  rescheduleTodoReminders,
} from "@/services/scheduling/reminders.service";
import {
  addToRecycleBin,
  getRecycleBinItems,
  saveRecycleBinItems,
} from "@/services/storage/storage.service";
import { AppCard } from "@/shared/components/ui/AppCard";
import {
  AppText as Text,
  AppTextInput as TextInput,
} from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { styles } from "@/shared/constants/taskStyles";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
  Task,
  Workspace,
  type Habit,
} from "@/shared/types/domain.types";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

async function loadNotifications() {
  return import("expo-notifications");
}

interface WorkspaceModalProps {
  visible: boolean;
  onClose: () => void;
  editingWorkspaceId: string | null;
  workspaces: Workspace[];
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  todos: Record<string, Task[]>;
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>;
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (id: string) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  persistState: (
    workspaces: Workspace[],
    selected: string,
    todos: Record<string, Task[]>,
  ) => Promise<void>;
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits: (nextHabits: Habit[]) => Promise<void>;
}

export function WorkspaceModal({
  visible,
  onClose,
  editingWorkspaceId,
  workspaces,
  setWorkspaces,
  todos,
  setTodos,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
  activeWorkspaceId,
  setActiveWorkspaceId,
  persistState,
  habits,
  setHabits,
  persistHabits,
}: WorkspaceModalProps) {
  const { showUndo } = useUndo();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [workspaceNameInput, setWorkspaceNameInput] = useState("");
  const [workspaceEmojiInput, setWorkspaceEmojiInput] = useState("📚");
  const [workspaceIconTypeInput, setWorkspaceIconTypeInput] = useState<
    "emoji" | "icon"
  >("emoji");
  const [workspaceIconInput, setWorkspaceIconInput] = useState("briefcase");
  const [workspaceColorInput, setWorkspaceColorInput] = useState("#6366F1");
  const [workspaceDescriptionInput, setWorkspaceDescriptionInput] = useState("");

  // Populate inputs when visible or editingWorkspaceId changes
  useEffect(() => {
    if (visible) {
      if (editingWorkspaceId) {
        const workspace = workspaces.find((l) => l.id === editingWorkspaceId);
        if (workspace) {
          setWorkspaceNameInput(workspace.name);
          setWorkspaceEmojiInput(workspace.emoji || "📁");
          setWorkspaceColorInput(workspace.color || "#6366F1");
          setWorkspaceDescriptionInput(workspace.description || "");
        }
      } else {
        setWorkspaceNameInput("");
        setWorkspaceEmojiInput("📚");
        setWorkspaceColorInput("#6366F1");
        setWorkspaceDescriptionInput("");
      }
    }
  }, [visible, editingWorkspaceId, workspaces]);

  const handleSave = () => {
    const trimmed = workspaceNameInput.trim();
    if (!trimmed) return;

    let updatedWorkspaces = [...workspaces];
    let updatedTodos = { ...todos };
    let activeWsId = selectedWorkspaceId;

    if (editingWorkspaceId) {
      updatedWorkspaces = workspaces.map((l) =>
        l.id === editingWorkspaceId
          ? {
              ...l,
              name: trimmed,
              emoji: workspaceEmojiInput,
              color: workspaceColorInput,
              description: workspaceDescriptionInput.trim() || undefined,
              updatedAt: Date.now(),
            }
          : l,
      );
    } else {
      const newId = `list-${Date.now()}`;
      updatedWorkspaces.push({
        id: newId,
        name: trimmed,
        emoji: workspaceEmojiInput,
        color: workspaceColorInput,
        description: workspaceDescriptionInput.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      updatedTodos[newId] = [];
      activeWsId = newId;
    }

    setWorkspaces(updatedWorkspaces);
    setTodos(updatedTodos);
    setSelectedWorkspaceId(activeWsId);
    void persistState(updatedWorkspaces, activeWsId, updatedTodos).then(() => {
      emitStateChange("tasks_changed");
      emitStateChange("habits_changed");
      emitStateChange("workspace_changed");
    });
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  };

  const handleDelete = () => {
    if (!editingWorkspaceId) return;

    if (
      editingWorkspaceId === INBOX_WORKSPACE_ID ||
      editingWorkspaceId === MY_PEBBLES_WORKSPACE_ID
    ) {
      Alert.alert(
        "Cannot Delete",
        "Inbox and My Pebbles are protected workspaces and cannot be deleted.",
      );
      return;
    }

    if (workspaces.filter((l) => !(l as any).archived).length <= 1) {
      Alert.alert(
        "Cannot Delete",
        "You must keep at least one active workspace.",
      );
      return;
    }

    Alert.alert(
      "Delete Workspace",
      "Are you sure you want to delete this workspace? This will permanently delete all tasks and habits in this workspace.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const workspace = workspaces.find((l) => l.id === editingWorkspaceId);
            if (!workspace) return;

            const workspaceTodos = todos[editingWorkspaceId] || [];
            const workspaceHabits = habits.filter(
              (h) => h.workspaceId === editingWorkspaceId,
            );

            // 1. Cancel notifications
            for (const todo of workspaceTodos) {
              if (todo.reminder?.notificationIds) {
                await cancelReminderIds(todo.reminder.notificationIds);
              }
            }

            for (const habit of workspaceHabits) {
              if (habit.reminder?.notificationIds) {
                await cancelReminderIds(habit.reminder.notificationIds);
              }
            }

            // 2. Add to Recycle Bin & Purge current Partitioned Storage Files
            await addToRecycleBin(
              "workspace",
              {
                list: workspace,
                todos: workspaceTodos,
                habits: workspaceHabits,
              },
              "Workspaces",
            );
            try {
              await WorkspaceRepository.deleteWorkspace(editingWorkspaceId);
            } catch (e) {
              console.warn("Failed to clear workspace via repository:", e);
            }

            // 3. Update state
            const updatedWorkspaces = workspaces.filter((l) => l.id !== editingWorkspaceId);
            const updatedTodos = { ...todos };
            delete updatedTodos[editingWorkspaceId];
            const updatedHabits = habits.filter(
              (h) => h.workspaceId !== editingWorkspaceId,
            );

            const fallbackList = updatedWorkspaces[0]?.id || INBOX_WORKSPACE_ID;
            if (!updatedTodos[fallbackList]) {
              updatedTodos[fallbackList] = [];
            }

            setWorkspaces(updatedWorkspaces);
            setTodos(updatedTodos);
            setHabits(updatedHabits);
            setSelectedWorkspaceId(fallbackList);

            await persistState(updatedWorkspaces, fallbackList, updatedTodos);
            await persistHabits(updatedHabits);
            emitStateChange("tasks_changed");
            emitStateChange("habits_changed");
            emitStateChange("workspace_changed");

            if (activeWorkspaceId === editingWorkspaceId) {
              setActiveWorkspaceId(null);
            }
            onClose();
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            ).catch(() => {});

            // 4. Show Undo Toast
            showUndo({
              message: `Deleted "${workspace.name}"`,
              onUndo: async () => {
                // Remove from Recycle Bin
                const binItems = await getRecycleBinItems();
                await saveRecycleBinItems(
                  binItems.filter((item) => item.id !== editingWorkspaceId),
                );

                // Reschedule reminders
                const rescheduledTodos = await Promise.all(
                  workspaceTodos.map((t) => rescheduleTodoReminders(t)),
                );
                const rescheduledHabits = await Promise.all(
                  workspaceHabits.map((h) => rescheduleHabitReminders(h)),
                );

                // Restore state and persist
                const currentLists = await WorkspaceRepository.getWorkspaces();

                const currentTodos: Record<string, Task[]> = {};
                for (const folder of currentLists) {
                  const wsId = folder.id;
                  const tasksMap = await TaskRepository.getTasks(wsId);
                  currentTodos[wsId] = Object.values(tasksMap).map(
                    (t: any) => ({
                      ...t,
                      scheduledDate: t.dueDate,
                    }),
                  ) as Task[];
                }

                const restoredLists = currentLists.some(
                  (l: any) => l.id === editingWorkspaceId,
                )
                  ? currentLists
                  : [...currentLists, workspace];

                const restoredTodos = {
                  ...currentTodos,
                  [editingWorkspaceId]: rescheduledTodos,
                };

                const currentHabits: Habit[] = [];
                for (const folder of currentLists) {
                  const wsId = folder.id;
                  const habitsMap = await HabitRepository.getHabits(wsId);
                  Object.values(habitsMap).forEach((h: any) => {
                    currentHabits.push({
                      ...h,
                      completedToday:
                        h.completedDates?.includes(
                          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
                        ) || false,
                    });
                  });
                }

                const restoredHabits = [
                  ...currentHabits.filter(
                    (h) => h.workspaceId !== editingWorkspaceId,
                  ),
                  ...rescheduledHabits,
                ];

                await persistState(
                  restoredLists,
                  editingWorkspaceId,
                  restoredTodos,
                );
                await persistHabits(restoredHabits);

                setWorkspaces(restoredLists);
                setTodos(restoredTodos);
                setHabits(restoredHabits);

                emitStateChange("tasks_changed");
                emitStateChange("habits_changed");
              },
            });
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <AppCard style={styles.centeredAlarmCard} onPress={() => {}}>
          <View style={styles.modalHeaderRow}>
            <Text
              style={[
                styles.modalTitleText,
                { color: colors.text, fontWeight: "800" },
              ]}
            >
              {editingWorkspaceId ? "Edit Workspace" : "New Workspace"}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 10,
              textTransform: "uppercase",
              fontWeight: "700",
              letterSpacing: 0.8,
              marginBottom: 8,
              marginTop: 4,
            }}
          >
            Workspace Name
          </Text>
          <View
            style={[
              styles.addTaskCard,
              { paddingHorizontal: 12, marginBottom: 16, height: 44 },
            ]}
          >
            <TextInput
              value={workspaceNameInput}
              onChangeText={setWorkspaceNameInput}
              placeholder="E.g. Placement Prep, Gym..."
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 14,
                fontWeight: "600",
              }}
            />
          </View>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 10,
              textTransform: "uppercase",
              fontWeight: "700",
              letterSpacing: 0.8,
              marginBottom: 8,
              marginTop: 4,
            }}
          >
            Workspace Description
          </Text>
          <View
            style={[
              styles.addTaskCard,
              { paddingHorizontal: 12, marginBottom: 16, height: 44 },
            ]}
          >
            <TextInput
              value={workspaceDescriptionInput}
              onChangeText={setWorkspaceDescriptionInput}
              placeholder="E.g. Tasks and notes for my activities..."
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 14,
                fontWeight: "600",
              }}
            />
          </View>

          {/* Selector Tabs for Icon Type */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setWorkspaceIconTypeInput("emoji")}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 8,
                backgroundColor:
                  workspaceIconTypeInput === "emoji"
                    ? `${colors.primary}15`
                    : colors.cardLight,
                borderWidth: 1,
                borderColor:
                  workspaceIconTypeInput === "emoji"
                    ? colors.primary
                    : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color:
                    workspaceIconTypeInput === "emoji"
                      ? colors.primary
                      : colors.textMuted,
                  fontWeight: "600",
                  fontSize: 12,
                }}
              >
                Emoji
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWorkspaceIconTypeInput("icon")}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 8,
                backgroundColor:
                  workspaceIconTypeInput === "icon"
                    ? `${colors.primary}15`
                    : colors.cardLight,
                borderWidth: 1,
                borderColor:
                  workspaceIconTypeInput === "icon"
                    ? colors.primary
                    : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color:
                    workspaceIconTypeInput === "icon"
                      ? colors.primary
                      : colors.textMuted,
                  fontWeight: "600",
                  fontSize: 12,
                }}
              >
                Feather Icon
              </Text>
            </TouchableOpacity>
          </View>

          {workspaceIconTypeInput === "emoji" ? (
            <>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  letterSpacing: 0.8,
                  marginBottom: 8,
                }}
              >
                Select Emoji
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
              >
                {[
                  "📚",
                  "💼",
                  "💪",
                  "🛒",
                  "🏡",
                  "🎯",
                  "🎨",
                  "🚀",
                  "💻",
                  "🧠",
                  "🌱",
                  "🧘",
                ].map((em) => {
                  const isSel = workspaceEmojiInput === em;
                  return (
                    <Pressable
                      key={em}
                      onPress={() => setWorkspaceEmojiInput(em)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSel
                          ? `${colors.primary}18`
                          : colors.cardLight,
                        borderWidth: 1.5,
                        borderColor: isSel ? colors.primary : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{em}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  letterSpacing: 0.8,
                  marginBottom: 8,
                }}
              >
                Select Icon
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
              >
                {[
                  "briefcase",
                  "home",
                  "activity",
                  "book",
                  "shopping-cart",
                  "dollar-sign",
                  "folder",
                  "star",
                  "heart",
                  "gift",
                  "coffee",
                  "tool",
                ].map((ic) => {
                  const isSel = workspaceIconInput === ic;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setWorkspaceIconInput(ic)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSel
                          ? `${colors.primary}18`
                          : colors.cardLight,
                        borderWidth: 1.5,
                        borderColor: isSel ? colors.primary : "transparent",
                      }}
                    >
                      <Feather
                        name={ic as any}
                        size={18}
                        color={isSel ? colors.primary : colors.text}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 10,
              textTransform: "uppercase",
              fontWeight: "700",
              letterSpacing: 0.8,
              marginBottom: 8,
            }}
          >
            Theme Color
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            {[
              "#6366F1",
              "#10B981",
              "#F59E0B",
              "#3B82F6",
              "#EC4899",
              "#8B5CF6",
              "#EF4444",
              "#14B8A6",
            ].map((col) => {
              const isSel = workspaceColorInput === col;
              return (
                <Pressable
                  key={col}
                  onPress={() => setWorkspaceColorInput(col)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: col,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2.5,
                    borderColor: isSel ? colors.text : "transparent",
                  }}
                />
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {editingWorkspaceId && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleDelete}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.2,
                  borderColor: "rgba(239, 68, 68, 0.2)",
                }}
              >
                <Text
                  style={{
                    color: "#EF4444",
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!workspaceNameInput.trim()}
              onPress={handleSave}
              style={{
                flex: 2,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: workspaceNameInput.trim() ? 1 : 0.6,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {editingWorkspaceId ? "Save Changes" : "Create Workspace"}
              </Text>
            </TouchableOpacity>
          </View>
        </AppCard>
      </Pressable>
    </Modal>
  );
}
