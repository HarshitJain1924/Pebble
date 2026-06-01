import React, { useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { AppTextInput as TextInput, AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppCard } from "@/components/AppCard";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "@/constants/taskStyles";
import { type TaskList, type Todo } from "../types";

async function loadNotifications() {
  return import("expo-notifications");
}

interface WorkspaceModalProps {
  visible: boolean;
  onClose: () => void;
  editingFolderId: string | null;
  lists: TaskList[];
  setLists: React.Dispatch<React.SetStateAction<TaskList[]>>;
  todos: Record<string, Todo[]>;
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Todo[]>>>;
  selectedList: string;
  setSelectedList: (id: string) => void;
  openedFolderId: string | null;
  setOpenedFolderId: (id: string | null) => void;
  persistState: (
    lists: TaskList[],
    selected: string,
    todos: Record<string, Todo[]>,
  ) => Promise<void>;
}

export function WorkspaceModal({
  visible,
  onClose,
  editingFolderId,
  lists,
  setLists,
  todos,
  setTodos,
  selectedList,
  setSelectedList,
  openedFolderId,
  setOpenedFolderId,
  persistState,
}: WorkspaceModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderEmojiInput, setFolderEmojiInput] = useState("📚");
  const [folderIconTypeInput, setFolderIconTypeInput] = useState<"emoji" | "icon">("emoji");
  const [folderIconInput, setFolderIconInput] = useState("briefcase");
  const [folderColorInput, setFolderColorInput] = useState("#6366F1");

  // Populate inputs when visible or editingFolderId changes
  useEffect(() => {
    if (visible) {
      if (editingFolderId) {
        const folder = lists.find((l) => l.id === editingFolderId);
        if (folder) {
          setFolderNameInput(folder.name);
          setFolderEmojiInput(folder.emoji || "📁");
          setFolderIconInput(folder.icon || "briefcase");
          setFolderIconTypeInput(folder.iconType || "emoji");
          setFolderColorInput(folder.color || "#6366F1");
        }
      } else {
        setFolderNameInput("");
        setFolderEmojiInput("📚");
        setFolderIconInput("briefcase");
        setFolderIconTypeInput("emoji");
        setFolderColorInput("#6366F1");
      }
    }
  }, [visible, editingFolderId, lists]);

  const handleSave = () => {
    const trimmed = folderNameInput.trim();
    if (!trimmed) return;

    let updatedLists = [...lists];
    let updatedTodos = { ...todos };
    let activeListId = selectedList;

    if (editingFolderId) {
      updatedLists = lists.map((l) =>
        l.id === editingFolderId
          ? {
              ...l,
              name: trimmed,
              emoji: folderEmojiInput,
              icon: folderIconInput,
              iconType: folderIconTypeInput,
              color: folderColorInput,
            }
          : l,
      );
    } else {
      const newId = `list-${Date.now()}`;
      updatedLists.push({
        id: newId,
        name: trimmed,
        emoji: folderEmojiInput,
        icon: folderIconInput,
        iconType: folderIconTypeInput,
        color: folderColorInput,
      });
      updatedTodos[newId] = [];
      activeListId = newId;
    }

    setLists(updatedLists);
    setTodos(updatedTodos);
    setSelectedList(activeListId);
    void persistState(updatedLists, activeListId, updatedTodos);
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleDelete = () => {
    if (!editingFolderId) return;

    Alert.alert(
      "Delete Workspace",
      "Are you sure you want to delete this workspace and all its tasks? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const updatedLists = lists.filter((l) => l.id !== editingFolderId);
            const updatedTodos = { ...todos };

            // Cancel any notifications scheduled for this workspace's tasks
            (updatedTodos[editingFolderId] ?? []).forEach((todo) => {
              const alarmId = todo.alarmId;
              if (alarmId && !alarmId.startsWith("web-")) {
                void loadNotifications().then((Notifications) =>
                  Notifications.cancelScheduledNotificationAsync(alarmId).catch(() => {}),
                );
              }
              if (todo.alarmId && todo.alarmId.startsWith("web-")) {
                clearTimeout(Number(todo.alarmId.replace("web-", "")));
              }
            });

            delete updatedTodos[editingFolderId];
            
            const fallbackList = updatedLists[0]?.id || "default";
            if (!updatedTodos[fallbackList]) {
              updatedTodos[fallbackList] = [];
            }

            setLists(updatedLists);
            setTodos(updatedTodos);
            setSelectedList(fallbackList);
            void persistState(updatedLists, fallbackList, updatedTodos);
            
            if (openedFolderId === editingFolderId) {
              setOpenedFolderId(null);
            }
            onClose();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
              {editingFolderId ? "Edit Workspace" : "New Workspace"}
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
              value={folderNameInput}
              onChangeText={setFolderNameInput}
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

          {/* Selector Tabs for Icon Type */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => setFolderIconTypeInput("emoji")}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 8,
                backgroundColor:
                  folderIconTypeInput === "emoji"
                    ? `${colors.primary}15`
                    : colors.cardLight,
                borderWidth: 1,
                borderColor:
                  folderIconTypeInput === "emoji"
                    ? colors.primary
                    : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color:
                    folderIconTypeInput === "emoji"
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
              onPress={() => setFolderIconTypeInput("icon")}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 8,
                backgroundColor:
                  folderIconTypeInput === "icon"
                    ? `${colors.primary}15`
                    : colors.cardLight,
                borderWidth: 1,
                borderColor:
                  folderIconTypeInput === "icon"
                    ? colors.primary
                    : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color:
                    folderIconTypeInput === "icon"
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

          {folderIconTypeInput === "emoji" ? (
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
                  const isSel = folderEmojiInput === em;
                  return (
                    <Pressable
                      key={em}
                      onPress={() => setFolderEmojiInput(em)}
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
                        borderColor: isSel
                          ? colors.primary
                          : "transparent",
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
                  const isSel = folderIconInput === ic;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setFolderIconInput(ic)}
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
                        borderColor: isSel
                          ? colors.primary
                          : "transparent",
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
              const isSel = folderColorInput === col;
              return (
                <Pressable
                  key={col}
                  onPress={() => setFolderColorInput(col)}
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
            {editingFolderId && (
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
              disabled={!folderNameInput.trim()}
              onPress={handleSave}
              style={{
                flex: 2,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: folderNameInput.trim() ? 1 : 0.6,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {editingFolderId ? "Save Changes" : "Create Workspace"}
              </Text>
            </TouchableOpacity>
          </View>
        </AppCard>
      </Pressable>
    </Modal>
  );
}
