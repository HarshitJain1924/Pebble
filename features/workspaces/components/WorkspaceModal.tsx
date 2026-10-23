import {
  DefaultWorkspaceColor,
  WorkspaceSwatchColors,
} from "@/shared/constants/categoryColors";
import { Palette } from "@/shared/constants/theme";
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
import { getTodayDateKey } from "@/shared/utils/date-key";
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
  persistState?: (
    workspaces: Workspace[],
    selected: string,
    todos: Record<string, Task[]>,
  ) => Promise<void>;
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits?: (nextHabits: Habit[]) => Promise<void>;
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
  const [workspaceColorInput, setWorkspaceColorInput] = useState(
    DefaultWorkspaceColor.dark,
  );
  const [workspaceDescriptionInput, setWorkspaceDescriptionInput] = useState("");

  // Populate inputs when visible or editingWorkspaceId changes
  useEffect(() => {
    if (visible) {
      if (editingWorkspaceId) {
        const workspace = workspaces.find((l) => l.id === editingWorkspaceId);
        if (workspace) {
          setWorkspaceNameInput(workspace.name);
          const isIcon = workspace.iconType === "icon" || (!workspace.emoji && Boolean(workspace.icon));
          setWorkspaceIconTypeInput(isIcon ? "icon" : "emoji");
          setWorkspaceIconInput(workspace.icon || "briefcase");
          setWorkspaceEmojiInput(workspace.emoji || "📁");
          setWorkspaceColorInput(workspace.color || DefaultWorkspaceColor.dark);
          setWorkspaceDescriptionInput(workspace.description || "");
        }
      } else {
        setWorkspaceNameInput("");
        setWorkspaceIconTypeInput("emoji");
        setWorkspaceEmojiInput("📚");
        setWorkspaceIconInput("briefcase");
        setWorkspaceColorInput(DefaultWorkspaceColor.dark);
        setWorkspaceDescriptionInput("");
      }
    }
  }, [visible, editingWorkspaceId, workspaces]);

  const handleSave = async () => {
    const trimmed = workspaceNameInput.trim();
    if (!trimmed) return;

    const isIconType = workspaceIconTypeInput === "icon";
    const emojiVal = isIconType ? undefined : workspaceEmojiInput;
    const iconVal = isIconType ? workspaceIconInput : undefined;

    try {
      const { EntityCommandService } = await import("@/services/command/EntityCommandService");

      if (editingWorkspaceId) {
        const existing = workspaces.find((l) => l.id === editingWorkspaceId);
        if (!existing) return;

        const updatedWorkspace: Workspace = {
          ...existing,
          name: trimmed,
          iconType: workspaceIconTypeInput,
          emoji: emojiVal,
          icon: iconVal,
          color: workspaceColorInput,
          description: workspaceDescriptionInput.trim() || undefined,
        };

        await EntityCommandService.updateWorkspace(updatedWorkspace);

        setWorkspaces((prev) =>
          prev.map((l) => (l.id === editingWorkspaceId ? updatedWorkspace : l))
        );
        emitStateChange("workspace_changed", "tasks_screen");
      } else {
        const newId = `list-${Date.now()}`;
        const newWorkspace: Workspace = {
          id: newId,
          name: trimmed,
          iconType: workspaceIconTypeInput,
          emoji: emojiVal,
          icon: iconVal,
          color: workspaceColorInput,
          description: workspaceDescriptionInput.trim() || undefined,
          revision: 1,
          lifecycleGeneration: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await EntityCommandService.createWorkspace(newWorkspace);

        setWorkspaces((prev) => [...prev, newWorkspace]);
        setTodos((prev) => ({ ...prev, [newId]: [] }));
        setSelectedWorkspaceId(newId);

        try {
          const { UiStateRepository } = await import("@/repositories");
          await UiStateRepository.saveUiState({ activeWorkspaceId: newId });
        } catch (uiErr) {
          console.warn("[WorkspaceModal] Ancillary saveUiState failed after workspace creation:", uiErr);
        }

        emitStateChange("workspace_changed", "tasks_screen");
        emitStateChange("tasks_changed", "tasks_screen");
      }

      onClose();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (e) {
      console.warn("[WorkspaceModal] Failed to save workspace:", e);
      Alert.alert("Save Failed", "Failed to save workspace. Please try again.");
    }
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

    if (workspaces.filter((l) => !l.archivedAt).length <= 1) {
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

            let deleteCommitted = false;
            try {
              const { EntityCommandService } = await import("@/services/command/EntityCommandService");
              await EntityCommandService.deleteWorkspace(editingWorkspaceId);
              deleteCommitted = true;
            } catch (e) {
              console.warn("[WorkspaceModal] deleteWorkspace threw:", e);
              try {
                const { WorkspaceRepository } = await import("@/repositories");
                const remainingWorkspaces = await WorkspaceRepository.getWorkspaces();
                const isStillPresent = remainingWorkspaces.some((w) => w.id === editingWorkspaceId);

                if (isStillPresent) {
                  Alert.alert("Delete Failed", "Failed to delete workspace. Please try again.");
                  return;
                }
                // Partial success: primary entity delete committed, but ancillary cleanup threw
                deleteCommitted = true;
              } catch (repoErr) {
                Alert.alert("Delete Failed", "Failed to delete workspace. Please try again.");
                return;
              }
            }

            if (!deleteCommitted) return;

            // Reconcile local workspace/task/habit state from authoritative outcome
            const updatedWorkspaces = workspaces.filter((l) => l.id !== editingWorkspaceId);
            const fallbackList = updatedWorkspaces.find((w) => !w.archivedAt)?.id || INBOX_WORKSPACE_ID;

            setWorkspaces(updatedWorkspaces);
            setTodos((prev) => {
              const next = { ...prev };
              delete next[editingWorkspaceId];
              if (!next[fallbackList]) {
                next[fallbackList] = [];
              }
              return next;
            });
            setHabits((prev) => prev.filter((h) => h.workspaceId !== editingWorkspaceId));
            setSelectedWorkspaceId(fallbackList);

            if (activeWorkspaceId === editingWorkspaceId) {
              setActiveWorkspaceId(null);
            }

            try {
              const { UiStateRepository } = await import("@/repositories");
              await UiStateRepository.saveUiState({ activeWorkspaceId: fallbackList });
            } catch (uiErr) {
              console.warn("[WorkspaceModal] Ancillary saveUiState failed after delete reconciliation:", uiErr);
            }

            emitStateChange("tasks_changed", "tasks_screen");
            emitStateChange("habits_changed", "tasks_screen");
            emitStateChange("workspace_changed", "tasks_screen");

            onClose();
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            ).catch(() => {});

            // Show Undo Toast wired to canonical restoreWorkspace
            showUndo({
              message: `Deleted "${workspace.name}"`,
              onUndo: async () => {
                try {
                  const { EntityCommandService } = await import("@/services/command/EntityCommandService");
                  await EntityCommandService.restoreWorkspace(`rb-${editingWorkspaceId}`);
                  emitStateChange("tasks_changed", "tasks_screen");
                  emitStateChange("habits_changed", "tasks_screen");
                  emitStateChange("workspace_changed", "tasks_screen");
                } catch (e) {
                  console.warn("Failed to undo workspace delete", e);
                }
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
            {WorkspaceSwatchColors.map((col) => {
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
                    color: Palette.red500,
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
                  color: Palette.white,
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
