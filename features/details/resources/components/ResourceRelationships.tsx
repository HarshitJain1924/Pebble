import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { TaskRepository, HabitRepository, ChecklistRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { emitStateChange } from "@/services/events/state-events";
import type { Task, Habit, Checklist } from "@/shared/types/domain.types";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";

export interface ResourceRelationshipsProps {
  resourceId: string;
  workspaceId: string;
}

export const ResourceRelationships: React.FC<ResourceRelationshipsProps> = ({
  resourceId,
  workspaceId,
}) => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allHabits, setAllHabits] = useState<Habit[]>([]);
  const [allChecklists, setAllChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);

  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadRelationships = useCallback(async () => {
    setLoading(true);
    try {
      const [allTasksMap, allHabitsMap, allChecklistsMap] = await Promise.all([
        TaskRepository.getTasks(workspaceId),
        HabitRepository.getHabits(workspaceId),
        ChecklistRepository.getChecklists(workspaceId),
      ]);

      const tList = Object.values(allTasksMap).filter((t) => !t.archivedAt);
      const hList = Object.values(allHabitsMap).filter((h) => !h.archivedAt);
      const cList = Object.values(allChecklistsMap).filter((c) => !c.archivedAt);

      setAllTasks(tList);
      setAllHabits(hList);
      setAllChecklists(cList);

      const linkedTasks = tList.filter((t) => t.resourceIds?.includes(resourceId));
      const linkedHabits = hList.filter((h) => h.resourceIds?.includes(resourceId));
      const linkedChecklists = cList.filter((c) => c.resourceIds?.includes(resourceId));

      setTasks(linkedTasks);
      setHabits(linkedHabits);
      setChecklists(linkedChecklists);
    } catch (e) {
      console.warn("Failed to load resource relationships", e);
    } finally {
      setLoading(false);
    }
  }, [resourceId, workspaceId]);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  const handleToggleLink = async (
    itemId: string,
    itemType: "task" | "habit" | "checklist"
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (itemType === "task") {
        let target = allTasks.find((t) => t.id === itemId) || tasks.find((t) => t.id === itemId);
        if (!target) {
          const tasksMap = await TaskRepository.getTasks(workspaceId);
          target = tasksMap[itemId];
        }
        if (!target) return;
        const currentIds = target.resourceIds || [];
        const nextIds = currentIds.includes(resourceId)
          ? currentIds.filter((id) => id !== resourceId)
          : [...currentIds, resourceId];

        await EntityCommandService.updateTask(itemId, workspaceId, {
          resourceIds: nextIds,
        });
        emitStateChange("tasks_changed", "resource_detail");
      } else if (itemType === "habit") {
        let target = allHabits.find((h) => h.id === itemId) || habits.find((h) => h.id === itemId);
        if (!target) {
          const habitsMap = await HabitRepository.getHabits(workspaceId);
          target = habitsMap[itemId];
        }
        if (!target) return;
        const currentIds = target.resourceIds || [];
        const nextIds = currentIds.includes(resourceId)
          ? currentIds.filter((id) => id !== resourceId)
          : [...currentIds, resourceId];

        await EntityCommandService.updateHabit(itemId, workspaceId, {
          resourceIds: nextIds,
        });
        emitStateChange("habits_changed", "resource_detail");
      } else if (itemType === "checklist") {
        let target = allChecklists.find((c) => c.id === itemId) || checklists.find((c) => c.id === itemId);
        if (!target) {
          const chkMap = await ChecklistRepository.getChecklists(workspaceId);
          target = chkMap[itemId];
        }
        if (!target) return;
        const currentIds = target.resourceIds || [];
        const nextIds = currentIds.includes(resourceId)
          ? currentIds.filter((id) => id !== resourceId)
          : [...currentIds, resourceId];

        await EntityCommandService.updateChecklist(itemId, workspaceId, {
          resourceIds: nextIds,
        });
        emitStateChange("checklists_changed", "resource_detail");
      }

      await loadRelationships();
    } catch (e) {
      console.warn("Failed to toggle resource link", e);
    }
  };

  const handleNavigateToItem = (item: { id: string; type: "task" | "habit" | "checklist" }) => {
    if (item.type === "task") {
      router.push(`/task-details?id=${item.id}&workspaceId=${workspaceId}`);
    } else if (item.type === "checklist") {
      router.push(`/checklist-details?id=${item.id}&workspaceId=${workspaceId}`);
    }
  };

  const linkedItems = useMemo(() => [
    ...tasks.map((t) => ({ ...t, type: "task" as const })),
    ...habits.map((h) => ({ ...h, type: "habit" as const })),
    ...checklists.map((c) => ({ ...c, type: "checklist" as const })),
  ], [tasks, habits, checklists]);

  const previewText = useMemo(() => {
    if (linkedItems.length === 0) return "";
    return linkedItems.map((i) => i.title).slice(0, 2).join(", ") + (linkedItems.length > 2 ? "..." : "");
  }, [linkedItems]);

  const getIcon = (type: string) => {
    switch (type) {
      case "task":
        return "check-circle";
      case "habit":
        return "repeat";
      case "checklist":
        return "list";
      default:
        return "file";
    }
  };

  const filteredTasks = searchQuery.trim()
    ? allTasks.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : allTasks;

  const filteredHabits = searchQuery.trim()
    ? allHabits.filter((h) => h.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : allHabits;

  const filteredChecklists = searchQuery.trim()
    ? allChecklists.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : allChecklists;

  if (loading) return null;

  return (
    <View style={styles.container}>
      {/* Tappable Linked Items Summary Card (Matching Task & Habit Details) */}
      <TouchableOpacity
        style={[
          styles.linkedCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setIsPickerVisible(true);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Linked Items"
      >
        <View style={styles.linkedLeft}>
          <View style={[styles.linkedIconBox, { backgroundColor: `${colors.primary}15` }]}>
            <Feather name="link-2" size={18} color={colors.primary} />
          </View>
          <View style={styles.linkedTextBox}>
            <Text style={[styles.linkedCount, { color: colors.text }]}>
              {linkedItems.length} {linkedItems.length === 1 ? "Linked Item" : "Linked Items"}
            </Text>
            <Text style={[styles.linkedPreview, { color: colors.textMuted }]} numberOfLines={1}>
              {previewText || "No tasks, habits, or checklists linked"}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Expanded Linked Items Rows */}
      {linkedItems.length > 0 && (
        <View style={styles.itemList}>
          {linkedItems.map((item) => (
            <View
              key={`${item.type}-${item.id}`}
              style={[
                styles.itemRowCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <TouchableOpacity
                style={styles.itemRowLeft}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  handleNavigateToItem(item);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.itemIconCircle, { backgroundColor: `${colors.primary}15` }]}>
                  <Feather name={getIcon(item.type) as any} size={14} color={colors.primary} />
                </View>
                <View style={styles.itemContentCol}>
                  <Text style={[styles.itemTypeBadge, { color: colors.primary }]}>
                    {item.type.toUpperCase()}
                  </Text>
                  <Text style={[styles.itemTitleText, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleToggleLink(item.id, item.type)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.unlinkButton, { backgroundColor: `${colors.border}60` }]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Unlink ${item.title}`}
              >
                <Feather name="x" size={13} color={colors.text} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Smooth Modal Picker (Matching ResourceAttachmentPicker.tsx) */}
      <Modal
        visible={isPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <AppCard
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <View style={{ gap: 2 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Link to Items
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  Select tasks, habits, or checklists:
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsPickerVisible(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search items..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Feather name="x" size={13} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 320 }}
            >
              {/* Tasks Group */}
              {filteredTasks.length > 0 && (
                <View style={styles.modalGroup}>
                  <Text style={[styles.modalGroupLabel, { color: colors.textMuted }]}>TASKS</Text>
                  {filteredTasks.map((todo) => {
                    const isChecked = todo.resourceIds?.includes(resourceId);
                    return (
                      <TouchableOpacity
                        key={todo.id}
                        onPress={() => handleToggleLink(todo.id, "task")}
                        style={[
                          styles.modalSelectRow,
                          {
                            backgroundColor: isChecked ? `${colors.primary}15` : colors.background,
                            borderColor: isChecked ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.modalSelectText, { color: colors.text }]} numberOfLines={1}>
                          {todo.title}
                        </Text>
                        <Feather
                          name={isChecked ? "check-square" : "square"}
                          size={18}
                          color={isChecked ? colors.primary : colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Habits Group */}
              {filteredHabits.length > 0 && (
                <View style={styles.modalGroup}>
                  <Text style={[styles.modalGroupLabel, { color: colors.textMuted }]}>HABITS</Text>
                  {filteredHabits.map((habit) => {
                    const isChecked = habit.resourceIds?.includes(resourceId);
                    return (
                      <TouchableOpacity
                        key={habit.id}
                        onPress={() => handleToggleLink(habit.id, "habit")}
                        style={[
                          styles.modalSelectRow,
                          {
                            backgroundColor: isChecked ? `${colors.primary}15` : colors.background,
                            borderColor: isChecked ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.modalSelectText, { color: colors.text }]} numberOfLines={1}>
                          {habit.title}
                        </Text>
                        <Feather
                          name={isChecked ? "check-square" : "square"}
                          size={18}
                          color={isChecked ? colors.primary : colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Checklists Group */}
              {filteredChecklists.length > 0 && (
                <View style={styles.modalGroup}>
                  <Text style={[styles.modalGroupLabel, { color: colors.textMuted }]}>CHECKLISTS</Text>
                  {filteredChecklists.map((chk) => {
                    const isChecked = chk.resourceIds?.includes(resourceId);
                    return (
                      <TouchableOpacity
                        key={chk.id}
                        onPress={() => handleToggleLink(chk.id, "checklist")}
                        style={[
                          styles.modalSelectRow,
                          {
                            backgroundColor: isChecked ? `${colors.primary}15` : colors.background,
                            borderColor: isChecked ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.modalSelectText, { color: colors.text }]} numberOfLines={1}>
                          {chk.title}
                        </Text>
                        <Feather
                          name={isChecked ? "check-square" : "square"}
                          size={18}
                          color={isChecked ? colors.primary : colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {filteredTasks.length === 0 &&
                filteredHabits.length === 0 &&
                filteredChecklists.length === 0 && (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      fontStyle: "italic",
                      textAlign: "center",
                      paddingVertical: 30,
                    }}
                  >
                    No items available to link.
                  </Text>
                )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setIsPickerVisible(false)}
              style={[styles.modalDoneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.modalDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </AppCard>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  linkedCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  linkedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  linkedTextBox: {
    flex: 1,
    gap: 2,
  },
  linkedCount: {
    fontSize: 14,
    fontWeight: "700",
  },
  linkedPreview: {
    fontSize: 12,
  },
  itemList: {
    gap: 6,
  },
  itemRowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  itemIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContentCol: {
    flex: 1,
    gap: 1,
  },
  itemTypeBadge: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  itemTitleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  unlinkButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxHeight: "85%",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  modalGroup: {
    gap: 6,
    marginTop: 4,
  },
  modalGroupLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  modalSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalSelectText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 10,
  },
  modalDoneBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  modalDoneBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
