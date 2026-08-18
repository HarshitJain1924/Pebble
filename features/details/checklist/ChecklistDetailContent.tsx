import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type {
  Checklist,
  Resource,
  Workspace,
} from "@/shared/types/domain.types";
import {
  INBOX_WORKSPACE_ID,
  MY_PEBBLES_WORKSPACE_ID,
} from "@/shared/types/domain.types";
import { emitStateChange } from "@/services/events/state-events";
import {
  ChecklistRepository,
  ResourceRepository,
  WorkspaceRepository,
} from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import { generateId } from "@/shared/utils/id";
import {
  DetailActions,
  DetailHeader,
  DetailRow,
  DetailSection,
  DetailShell,
} from "@/features/details";
import { useChecklistDetailForm } from "@/features/details/checklist/hooks/useChecklistDetailForm";
import { ChecklistDetailForm } from "@/features/details/checklist/components/ChecklistDetailForm";

export interface ChecklistDetailContentProps {
  checklistId: string;
  /** Whether the screen should open directly in edit mode (route `edit=true`). */
  initialEdit?: boolean;
  onBack: () => void;
}

/**
 * Checklist Detail screen on the shared Detail System. Owns checklist loading,
 * the edit-form state group, view/edit modes, the workspace + link-resource
 * pickers, and all checklist mutations (routed through EntityCommandService).
 * Behavior is a faithful extraction of the former route implementation —
 * including the pre-existing resource stub (the resource list is never loaded,
 * so the Linked Resources section and link picker remain inert).
 */
export const ChecklistDetailContent: React.FC<ChecklistDetailContentProps> = ({
  checklistId,
  initialEdit,
  onBack,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const { showToast } = useUndo();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(initialEdit === true);
  const [item, setItem] = useState<Checklist | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [resourcesList, setResourcesList] = useState<Resource[]>([]);

  // Editor sub-states
  const [workspacePickerVisible, setWorkspacePickerVisible] = useState(false);
  const [linkPickerVisible, setLinkPickerVisible] = useState(false);

  const { form, update, reset, addItem, setNewItemText, deleteItem, renameItem, moveItemUp, moveItemDown, toggleResource } =
    useChecklistDetailForm();

  const linkedResources = useMemo(() => {
    return resourcesList.filter((res) =>
      form.linkedCollectionIds.includes(res.id),
    );
  }, [resourcesList, form.linkedCollectionIds]);

  const completedCount = useMemo(() => {
    return form.items.filter((it) => it.completed).length;
  }, [form.items]);

  const totalCount = form.items.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const currentWorkspace = useMemo(() => {
    return (
      workspaces.find((ws) => ws.id === form.workspaceId) || {
        name: "Inbox",
        emoji: "📥",
      }
    );
  }, [workspaces, form.workspaceId]);

  const hasChanges = useMemo(() => {
    if (!item) return false;
    if (form.title.trim() !== (item.title || "").trim()) return true;
    if (form.description.trim() !== (item.description || "").trim()) return true;
    if (form.workspaceId !== (item.workspaceId || INBOX_WORKSPACE_ID))
      return true;

    // Compare items
    if (form.items.length !== item.items.length) return true;
    for (let i = 0; i < form.items.length; i++) {
      if (form.items[i].id !== item.items[i].id) return true;
      if (form.items[i].title.trim() !== item.items[i].title.trim()) return true;
      if (form.items[i].completed !== item.items[i].completed) return true;
    }

    // Compare resourceIds
    const sortedLinkedCurrent = [...form.linkedCollectionIds].sort();
    const sortedLinkedItem = [...(item.resourceIds || [])].sort();
    if (
      JSON.stringify(sortedLinkedCurrent) !== JSON.stringify(sortedLinkedItem)
    )
      return true;

    return false;
  }, [item, form]);

  const loadData = useCallback(async () => {
    if (!checklistId) return;
    setLoading(true);
    try {
      // 1. Load workspaces
      const loadedFolders = await WorkspaceRepository.getWorkspaces();
      const loadedWorkspaces: Workspace[] = loadedFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
        color: folder.color,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt || Date.now(),
        archivedAt: folder.archivedAt,
      }));
      setWorkspaces(loadedWorkspaces);

      const folderIds = Array.from(
        new Set([
          INBOX_WORKSPACE_ID,
          MY_PEBBLES_WORKSPACE_ID,
          ...loadedFolders.map((f) => f.id),
        ]),
      );

      // 2. Load resources directly from ResourceRepository for all workspace
      //    folders — same canonical pattern as Task/Habit Detail.
      const allLoadedResources: Resource[] = [];
      for (const fId of folderIds) {
        const resMap = await ResourceRepository.getResources(fId);
        Object.values(resMap).forEach((r) => {
          allLoadedResources.push(r);
        });
      }
      setResourcesList(allLoadedResources);

      // 3. Load checklist item
      let foundChecklist: Checklist | undefined;

      for (const fId of folderIds) {
        const checklist = await ChecklistRepository.getChecklist(checklistId, fId);
        if (checklist) {
          foundChecklist = checklist;
          break;
        }
      }

      if (foundChecklist) {
        setItem(foundChecklist);
        reset(foundChecklist);
      } else {
        Alert.alert("Error", "Checklist not found.");
        onBack();
      }
    } catch (e) {
      console.warn("Failed to load checklist details", e);
    } finally {
      setLoading(false);
    }
  }, [checklistId, onBack, reset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert("Title Required", "Please enter a checklist title.");
      return;
    }
    if (!item) return;

    try {
      const updatedChecklist: Checklist = {
        ...item,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        workspaceId: form.workspaceId,
        items: form.items,
        resourceIds: form.linkedCollectionIds,
        updatedAt: Date.now(),
      };

      const oldFolderId = item.workspaceId || INBOX_WORKSPACE_ID;

      await EntityCommandService.updateChecklist(item.id, oldFolderId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        items: form.items,
        resourceIds: form.linkedCollectionIds,
      });

      if (oldFolderId !== form.workspaceId) {
        await EntityCommandService.moveChecklist(
          item.id,
          oldFolderId,
          form.workspaceId,
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      setIsEditing(false);
      showToast("Changes saved");
      setItem(updatedChecklist);
      reset(updatedChecklist);
    } catch (e) {
      console.warn("Failed to save changes", e);
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    try {
      const duplicate: Checklist = {
        ...item,
        id: generateId("checklist-"),
        title: `${item.title} (Copy)`,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      };

      await EntityCommandService.createChecklist(
        duplicate,
        duplicate.workspaceId || INBOX_WORKSPACE_ID,
        { skipEvents: true, skipAnalytics: true },
      );
      emitStateChange("checklists_changed");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert("Success", "Checklist duplicated successfully!");
      onBack();
    } catch (e) {
      console.warn("Failed to duplicate checklist", e);
    }
  };

  const handleArchive = async () => {
    if (!item) return;
    try {
      await EntityCommandService.updateChecklist(
        item.id,
        item.workspaceId || INBOX_WORKSPACE_ID,
        {
          archivedAt: Date.now(),
        },
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Checklist archived");
      onBack();
    } catch (e) {
      console.warn("Failed to archive checklist", e);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      const folderId = item.workspaceId || INBOX_WORKSPACE_ID;
      await EntityCommandService.recycleChecklist(item.id, folderId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Checklist moved to Recycle Bin");
      onBack();
    } catch (e) {
      console.warn("Failed to delete checklist", e);
    }
  };

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  const handleBack = () => {
    if (isEditing) {
      setIsEditing(false);
      if (item) reset(item);
    } else {
      onBack();
    }
  };

  if (loading || !item) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.textMuted }}>
            Loading checklist details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const createdDate = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : "N/A";

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <DetailHeader
        title={isEditing ? "Edit Checklist" : "Checklist Details"}
        onBack={handleBack}
        icon={<Feather name="list" size={18} color={colors.primary} />}
        action={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              if (isEditing) {
                handleSave();
              } else {
                setIsEditing(true);
              }
            }}
            style={[
              styles.editSaveBtn,
              {
                backgroundColor: isEditing
                  ? hasChanges
                    ? colors.primary
                    : colors.cardLight
                  : colors.cardLight,
                opacity: isEditing && !hasChanges ? 0.6 : 1,
              },
            ]}
            disabled={isEditing && !hasChanges}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? "Save checklist" : "Edit checklist"}
          >
            <Text
              style={{
                color: isEditing
                  ? hasChanges
                    ? "#FFFFFF"
                    : colors.textMuted
                  : colors.primary,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              {isEditing ? "Save" : "Edit"}
            </Text>
          </TouchableOpacity>
        }
      />
    </View>
  );

  return (
    <>
      <DetailShell header={header} contentContainerStyle={{ paddingBottom: 60 }}>
        {!isEditing ? (
          /* ===== DETAILS VIEW ===== */
          <View style={{ gap: Spacing.xl }}>
            {/* Title and Workspace Header */}
            <View>
              <Text style={[styles.itemTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <Text style={{ fontSize: 14 }}>
                  {currentWorkspace.emoji || "📁"}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {currentWorkspace.name}
                </Text>
              </View>
            </View>

            {/* Description (if present) */}
            {item.description ? (
              <DetailSection title="Description">
                <Text
                  style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}
                >
                  {item.description}
                </Text>
              </DetailSection>
            ) : null}

            {/* Progress */}
            <DetailSection title="Progress">
              <DetailRow
                label="Progress"
                value={`${completedCount} of ${totalCount} completed`}
                icon={<Feather name="activity" size={16} color={colors.primary} />}
              />
              {/* Progress bar */}
              <View
                style={[
                  styles.progressTrack,
                  {
                    backgroundColor: isLight
                      ? "rgba(0,0,0,0.06)"
                      : "rgba(255,255,255,0.08)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <View style={styles.rowDivider} />
              <DetailRow
                label="Created Date"
                value={createdDate}
                icon={
                  <Feather name="calendar" size={16} color={colors.textMuted} />
                }
              />
            </DetailSection>

            {/* Checklist Items */}
            <DetailSection title="Checklist Items">
              {form.items.length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    textAlign: "center",
                    paddingVertical: 12,
                  }}
                >
                  No items in this checklist.
                </Text>
              ) : (
                form.items.map((cIt) => (
                  <View
                    key={cIt.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Feather
                      name={cIt.completed ? "check-circle" : "circle"}
                      size={16}
                      color={
                        cIt.completed ? colors.primary : colors.textMuted
                      }
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "500",
                        color: cIt.completed ? colors.textMuted : colors.text,
                        textDecorationLine: cIt.completed
                          ? "line-through"
                          : "none",
                        flex: 1,
                      }}
                    >
                      {cIt.title}
                    </Text>
                  </View>
                ))
              )}
            </DetailSection>

            {/* Linked Resources (stub: never loaded) */}
            <DetailSection title="Linked Resources">
              {linkedResources.length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    textAlign: "center",
                    paddingVertical: 8,
                  }}
                >
                  No resources linked.
                </Text>
              ) : (
                linkedResources.map((res, idx) => (
                  <View key={res.id}>
                    <TouchableOpacity
                      onPress={() => {
                        if (res.type === "link") {
                          handleOpenUrl(res.attachments?.[0]?.uri || "");
                        } else if (res.type === "note") {
                          Alert.alert(
                            res.title,
                            res.body || "No details available.",
                          );
                        } else {
                          Alert.alert(res.title, "Image attachment");
                        }
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 8,
                        gap: 12,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={res.title}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Feather
                          name={
                            res.type === "link"
                              ? "globe"
                              : (res.type as string) === "image"
                                ? "image"
                                : "file-text"
                          }
                          size={13}
                          color={colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: colors.text,
                          }}
                          numberOfLines={1}
                        >
                          {res.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {(res as any).collectionName || "Resource"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {idx < linkedResources.length - 1 && (
                      <View
                        style={{
                          height: 1,
                          backgroundColor: colors.border + "40",
                        }}
                      />
                    )}
                  </View>
                ))
              )}
            </DetailSection>

            {/* Actions */}
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <DetailActions
                actions={[
                  {
                    key: "duplicate",
                    label: "Duplicate Checklist",
                    icon: <Feather name="copy" size={16} color={colors.text} />,
                    onPress: handleDuplicate,
                  },
                ]}
              />
              <DetailActions
                actions={[
                  {
                    key: "archive",
                    label: "Archive Checklist",
                    icon: (
                      <Feather name="archive" size={16} color={colors.text} />
                    ),
                    onPress: () => {
                      Alert.alert(
                        "Archive Checklist",
                        "Archive this checklist?",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Archive", onPress: handleArchive },
                        ],
                      );
                    },
                  },
                  {
                    key: "delete",
                    label: "Delete Checklist",
                    tone: "danger",
                    icon: <Feather name="trash-2" size={16} color="#FFFFFF" />,
                    onPress: () => {
                      Alert.alert(
                        "Delete Checklist",
                        "Delete this checklist permanently?",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: handleDelete,
                          },
                        ],
                      );
                    },
                  },
                ]}
              />
            </View>
          </View>
        ) : (
          /* ===== EDITING VIEW ===== */
          <ChecklistDetailForm
            form={form}
            update={update}
            addItem={addItem}
            setNewItemText={setNewItemText}
            deleteItem={deleteItem}
            renameItem={renameItem}
            moveItemUp={moveItemUp}
            moveItemDown={moveItemDown}
            toggleResource={toggleResource}
            currentWorkspace={currentWorkspace}
            linkedResources={linkedResources}
            onOpenWorkspacePicker={() => setWorkspacePickerVisible(true)}
            onOpenLinkPicker={() => setLinkPickerVisible(true)}
          />
        )}
      </DetailShell>

      {/* WORKSPACE PICKER MODAL */}
      <Modal visible={workspacePickerVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <AppCard
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Select Workspace
            </Text>
            <ScrollView
              style={{ maxHeight: 250 }}
              showsVerticalScrollIndicator={false}
            >
              {workspaces
                .filter((ws) => !(ws as any).archived)
                .map((ws) => (
                  <TouchableOpacity
                    key={ws.id}
                    onPress={() => {
                      update({ workspaceId: ws.id });
                      setWorkspacePickerVisible(false);
                      Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border + "30",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Move to ${ws.name}`}
                  >
                    <Text style={{ fontSize: 16 }}>{ws.emoji || "📁"}</Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {ws.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setWorkspacePickerVisible(false)}
              style={{
                alignItems: "center",
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 6,
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel workspace selection"
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </AppCard>
        </View>
      </Modal>

      {/* LINK RESOURCES PICKER MODAL */}
      <Modal visible={linkPickerVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <AppCard
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                maxHeight: "80%",
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Link Resources
            </Text>
            <Text
              style={{ fontSize: 11, color: colors.textMuted, marginTop: -4 }}
            >
              Select items to link to this checklist:
            </Text>

            <ScrollView
              contentContainerStyle={{ gap: 14, paddingVertical: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {resourcesList.length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    textAlign: "center",
                    paddingVertical: 30,
                  }}
                >
                  No resources available.
                </Text>
              ) : (
                resourcesList
                  .filter((i) => !i.archivedAt)
                  .map((res) => {
                    const isChecked = form.linkedCollectionIds.includes(res.id);
                    return (
                      <TouchableOpacity
                        key={res.id}
                        onPress={() => toggleResource(res.id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: 12,
                          borderRadius: 12,
                          backgroundColor: isChecked
                            ? `${colors.primary}15`
                            : colors.cardLight,
                          borderWidth: 1,
                          borderColor: isChecked
                            ? colors.primary
                            : colors.border,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Link ${res.title}`}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontWeight: "600",
                            fontSize: 14,
                          }}
                        >
                          {res.title}
                        </Text>
                        <Feather
                          name={isChecked ? "check-square" : "square"}
                          size={18}
                          color={
                            isChecked ? colors.primary : colors.textMuted
                          }
                        />
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setLinkPickerVisible(false)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                marginTop: 6,
              }}
              accessibilityRole="button"
              accessibilityLabel="Done linking resources"
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Done</Text>
            </TouchableOpacity>
          </AppCard>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: 0 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  editSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 4,
    width: "100%",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
  },
  rowDivider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: "transparent",
    opacity: 0.1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
});
