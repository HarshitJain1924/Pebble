import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Linking,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

import { AppCard } from "@/components/AppCard";
import { AppText as Text } from "@/components/ui/AppText";
import { useUndo } from "@/components/ui/UndoContext";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    type Checklist,
    type ChecklistItem,
    type Collection,
    type TaskList
} from "@/modules/types";
import { emitStateChange } from "@/services/stateEvents";
import {
    addToRecycleBin,
    getCollections
} from "@/services/storage";
import {
    ActivityRepository,
    FolderRepository,
} from "@/services/v3/repositories";

export default function ChecklistDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; edit?: string }>();
  const itemId = params.id;

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";
  const isLight = colorScheme === "light";
  const { showToast } = useUndo();

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(params.edit === "true");
  const [item, setItem] = useState<Checklist | null>(null);
  const [workspaces, setWorkspaces] = useState<TaskList[]>([]);
  const [collections, setCollections] = useState<Record<string, Collection[]>>(
    {},
  );

  // Form Fields States
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState("default");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [linkedCollectionIds, setLinkedCollectionIds] = useState<string[]>([]);

  // Editor Sub-States
  const [newItemText, setNewItemText] = useState("");
  const [linkPickerVisible, setLinkPickerVisible] = useState(false);
  const [workspacePickerVisible, setWorkspacePickerVisible] = useState(false);

  // Compute all available resources across all workspace collections
  const allResources = useMemo(() => {
    const list: any[] = [];
    Object.keys(collections).forEach((wsId) => {
      const folderColls = collections[wsId] || [];
      folderColls.forEach((coll) => {
        if (coll.items) {
          coll.items.forEach((cItem) => {
            list.push({
              ...cItem,
              collectionName: coll.name,
              workspaceId: wsId,
            });
          });
        }
      });
    });
    return list;
  }, [collections]);

  const linkedResources = useMemo(() => {
    return allResources.filter((res) => linkedCollectionIds.includes(res.id));
  }, [allResources, linkedCollectionIds]);

  const completedCount = useMemo(() => {
    return items.filter((it) => it.completed).length;
  }, [items]);

  const totalCount = items.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;
  const isAllCompleted = totalCount > 0 && completedCount === totalCount;

  const currentWorkspace = useMemo(() => {
    return (
      workspaces.find((ws) => ws.id === workspaceId) || {
        name: "My Pebbles",
        emoji: "📁",
      }
    );
  }, [workspaces, workspaceId]);

  const hasChanges = useMemo(() => {
    if (!item) return false;
    if (title.trim() !== (item.title || "").trim()) return true;
    if (description.trim() !== (item.description || "").trim()) return true;
    if (workspaceId !== (item.folderId || "default")) return true;

    // Compare checklist items
    if (items.length !== item.items.length) return true;
    for (let i = 0; i < items.length; i++) {
      if (items[i].id !== item.items[i].id) return true;
      if (items[i].title.trim() !== item.items[i].title.trim()) return true;
      if (items[i].completed !== item.items[i].completed) return true;
    }

    // Compare linked collections
    const sortedLinkedCurrent = [...linkedCollectionIds].sort();
    const sortedLinkedItem = [...(item.linkedCollectionIds || [])].sort();
    if (
      JSON.stringify(sortedLinkedCurrent) !== JSON.stringify(sortedLinkedItem)
    )
      return true;

    return false;
  }, [item, title, description, workspaceId, items, linkedCollectionIds]);

  useEffect(() => {
    loadData();
  }, [itemId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load workspaces
      const loadedFolders = await FolderRepository.getFolders();
      const loadedWorkspaces: TaskList[] = loadedFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
        color: folder.color,
        createdAt: folder.createdAt,
        archived: folder.archived,
      }));
      setWorkspaces(loadedWorkspaces);

      // 2. Load collections
      const loadedCollections = await getCollections();
      setCollections(loadedCollections);

      // 3. Load checklists & find the current one
      let foundChecklist: Checklist | null = null;
      const folderIds = Array.from(
        new Set(["default", "unassigned", ...loadedFolders.map((f) => f.id)]),
      );
      for (const fId of folderIds) {
        const match = await ActivityRepository.getChecklist(itemId, fId);
        if (match) {
          foundChecklist = match;
          break;
        }
      }

      if (foundChecklist) {
        setItem(foundChecklist);
        initForm(foundChecklist);
      } else {
        Alert.alert("Error", "Checklist not found.");
        router.back();
      }
    } catch (e) {
      console.warn("Failed to load checklist details", e);
    } finally {
      setLoading(false);
    }
  };

  const initForm = (chk: Checklist) => {
    setTitle(chk.title || "");
    setDescription(chk.description || "");
    setWorkspaceId(chk.folderId || "default");
    setItems(chk.items || []);
    setLinkedCollectionIds(chk.linkedCollectionIds || []);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Title Required", "Please enter a checklist title.");
      return;
    }
    if (!item) return;

    try {
      const updatedChecklist: Checklist = {
        ...item,
        title: title.trim(),
        description: description.trim() || undefined,
        folderId: workspaceId,
        items,
        linkedCollectionIds,
      };

      const oldFolderId = item.folderId || "default";
      if (oldFolderId !== workspaceId) {
        await ActivityRepository.deleteChecklist(item.id, oldFolderId);
      }

      await ActivityRepository.saveChecklist(updatedChecklist);
      emitStateChange("checklists_changed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      setIsEditing(false);
      showToast("Changes saved");
      setItem(updatedChecklist);
      initForm(updatedChecklist);
    } catch (e) {
      console.warn("Failed to save changes", e);
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    try {
      const folderId = item.folderId || "default";

      const duplicate: Checklist = {
        ...item,
        id: `checklist-${Date.now()}`,
        title: `${item.title} (Copy)`,
        createdAt: Date.now(),
        // Keep items but reset item completions or duplicate them?
        // Duplicate exactly as is
      };

      await ActivityRepository.saveChecklist(duplicate);
      emitStateChange("checklists_changed");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert("Success", "Checklist duplicated successfully!");
      router.back();
    } catch (e) {
      console.warn("Failed to duplicate checklist", e);
    }
  };

  const handleArchive = async () => {
    if (!item) return;
    try {
      await ActivityRepository.saveChecklist({
        ...item,
        archived: true,
      });
      emitStateChange("checklists_changed");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Checklist archived");
      router.back();
    } catch (e) {
      console.warn("Failed to archive checklist", e);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      const folderId = item.folderId || "default";
      await ActivityRepository.deleteChecklist(item.id, folderId);
      await addToRecycleBin("checklist", item, `${folderId}:${item.id}`);
      emitStateChange("checklists_changed");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      showToast("✓ Checklist moved to Recycle Bin");
      router.back();
    } catch (e) {
      console.warn("Failed to delete checklist", e);
    }
  };

  // Reordering helpers
  const moveItemUp = (index: number) => {
    if (index === 0) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const moveItemDown = (index: number) => {
    setItems((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `checklist-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: newItemText.trim(),
      completed: false,
    };
    setItems((prev) => [...prev, newItem]);
    setNewItemText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleRenameItem = (id: string, text: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, title: text } : it)),
    );
  };

  const toggleDaySelection = (resId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLinkedCollectionIds((prev) =>
      prev.includes(resId)
        ? prev.filter((id) => id !== resId)
        : [...prev, resId],
    );
  };

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  if (loading || !item) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Text style={{ color: colors.textMuted }}>
          Loading checklist details...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* Header bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            if (isEditing) {
              setIsEditing(false);
              initForm(item);
            } else {
              router.back();
            }
          }}
          style={styles.headerBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isEditing ? "Edit Checklist" : "Checklist Details"}
        </Text>

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
            styles.headerBtnTextRow,
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isEditing ? (
          /* DETAILS VIEW */
          <View style={{ gap: 20 }}>
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
              <View
                style={[
                  styles.metaCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    padding: 14,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Description
                </Text>
                <Text
                  style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}
                >
                  {item.description}
                </Text>
              </View>
            ) : null}

            {/* Progress Summary box */}
            <AppCard
              style={[
                styles.metaCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="activity" size={16} color={colors.primary} />
                  <Text style={[styles.metaLabel, { color: colors.text }]}>
                    Progress
                  </Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {completedCount} of {totalCount} completed
                </Text>
              </View>

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

              <View style={styles.metaRow}>
                <View style={styles.metaRowLeft}>
                  <Feather name="calendar" size={16} color={colors.textMuted} />
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>
                    Created Date
                  </Text>
                </View>
                <Text style={[styles.metaValue, { color: colors.textMuted }]}>
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })
                    : "N/A"}
                </Text>
              </View>
            </AppCard>

            {/* Flat Checklist Items List */}
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: colors.text,
                  paddingHorizontal: 4,
                }}
              >
                Checklist Items
              </Text>
              <AppCard
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  padding: 12,
                  gap: 10,
                }}
              >
                {items.length === 0 ? (
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
                  items.map((cIt) => (
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
                        }}
                      >
                        {cIt.title}
                      </Text>
                    </View>
                  ))
                )}
              </AppCard>
            </View>

            {/* Linked Resources */}
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: colors.text,
                  paddingHorizontal: 4,
                }}
              >
                Linked Resources
              </Text>
              {linkedResources.length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    paddingHorizontal: 4,
                  }}
                >
                  No resources linked.
                </Text>
              ) : (
                <AppCard
                  style={{
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  {linkedResources.map((res, idx) => (
                    <View key={res.id}>
                      <TouchableOpacity
                        onPress={() => {
                          if (res.type === "link") {
                            handleOpenUrl(res.url);
                          } else if (res.type === "note") {
                            Alert.alert(
                              res.title,
                              res.content || "No details available.",
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
                                : res.type === "image"
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
                            {res.collectionName || "Collection"}
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
                  ))}
                </AppCard>
              )}
            </View>

            {/* Details Footer Actions */}
            <View style={{ gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
                onPress={handleDuplicate}
              >
                <Feather name="copy" size={16} color={colors.text} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Duplicate Checklist
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
                onPress={() => {
                  Alert.alert("Archive Checklist", "Archive this checklist?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Archive", onPress: handleArchive },
                  ]);
                }}
              >
                <Feather name="archive" size={16} color={colors.text} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Archive Checklist
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  {
                    borderColor: colors.error + "30",
                    backgroundColor: colors.error + "08",
                  },
                ]}
                onPress={() => {
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
                }}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>
                  Delete Checklist
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* EDITING VIEW */
          <View style={{ gap: 20, paddingBottom: 80 }}>
            {/* Title input */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                TITLE
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
                value={title}
                onChangeText={setTitle}
                placeholder="Checklist Title (e.g. Weekly Groceries)"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Description input */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                DESCRIPTION / NOTES
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    minHeight: 80,
                  },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add notes or description..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Workspace Selection dropdown */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                WORKSPACE
              </Text>
              <TouchableOpacity
                onPress={() => setWorkspacePickerVisible(true)}
                style={[
                  styles.textInput,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text style={{ fontSize: 15 }}>
                    {currentWorkspace.emoji || "📁"}
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "500",
                    }}
                  >
                    {currentWorkspace.name}
                  </Text>
                </View>
                <Feather
                  name="chevron-down"
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Checklist Items Editor */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                CHECKLIST ITEMS
              </Text>

              <View style={{ gap: 8 }}>
                {items.map((cIt, idx) => (
                  <View
                    key={cIt.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      gap: 4,
                    }}
                  >
                    {/* Reordering Up/Down controls */}
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <TouchableOpacity
                        onPress={() => moveItemUp(idx)}
                        disabled={idx === 0}
                        style={{ padding: 6, opacity: idx === 0 ? 0.3 : 1 }}
                      >
                        <Feather
                          name="chevron-up"
                          size={16}
                          color={colors.text}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveItemDown(idx)}
                        disabled={idx === items.length - 1}
                        style={{
                          padding: 6,
                          opacity: idx === items.length - 1 ? 0.3 : 1,
                        }}
                      >
                        <Feather
                          name="chevron-down"
                          size={16}
                          color={colors.text}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Inline Item Title input */}
                    <TextInput
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "500",
                        paddingVertical: 8,
                        paddingHorizontal: 4,
                      }}
                      value={cIt.title}
                      onChangeText={(txt) => handleRenameItem(cIt.id, txt)}
                      placeholder="Item name..."
                      placeholderTextColor={colors.textMuted}
                    />

                    {/* Delete Item button */}
                    <TouchableOpacity
                      onPress={() => handleDeleteItem(cIt.id)}
                      style={{ padding: 8 }}
                    >
                      <Feather name="trash" size={14} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add New Item row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    marginTop: 4,
                  }}
                >
                  <TextInput
                    style={{
                      flex: 1,
                      color: colors.text,
                      fontSize: 14,
                      paddingVertical: 8,
                    }}
                    value={newItemText}
                    onChangeText={setNewItemText}
                    placeholder="Add item..."
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={handleAddItem}
                  />
                  <TouchableOpacity
                    onPress={handleAddItem}
                    style={{ padding: 8 }}
                  >
                    <Feather name="plus" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Resource Linking Section */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                LINKED RESOURCES
              </Text>

              <View style={{ gap: 8 }}>
                {linkedResources.map((res) => (
                  <View
                    key={res.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>
                        {res.type === "link"
                          ? "🔗"
                          : res.type === "image"
                            ? "🖼"
                            : "📝"}
                      </Text>
                      <View>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {res.title}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {res.collectionName || "Collection"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light,
                        ).catch(() => {});
                        setLinkedCollectionIds((prev) =>
                          prev.filter((id) => id !== res.id),
                        );
                      }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="x" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Non-dashed standard button (solid borders only) */}
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.cardLight,
                    marginTop: 4,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Light,
                    ).catch(() => {});
                    setLinkPickerVisible(true);
                  }}
                >
                  <Feather name="plus" size={16} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.primary,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Link a Resource List
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

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
                      setWorkspaceId(ws.id);
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
              {Object.keys(collections).length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    textAlign: "center",
                    paddingVertical: 30,
                  }}
                >
                  No collections available.
                </Text>
              ) : (
                Object.keys(collections).map((wsId) => {
                  const wsColls = collections[wsId] || [];
                  const workspaceObj = workspaces.find(
                    (w) => w.id === wsId,
                  ) || { name: "My Pebbles", emoji: "📁" };

                  return (
                    <View key={wsId}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontSize: 13 }}>
                          {workspaceObj.emoji || "📁"}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                          }}
                        >
                          {workspaceObj.name}
                        </Text>
                      </View>

                      {wsColls.map((col) => (
                        <View key={col.id} style={{ marginBottom: 12 }}>
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "800",
                              color: colors.text,
                              marginLeft: 8,
                              marginBottom: 6,
                            }}
                          >
                            {col.emoji || "📁"} {col.name}
                          </Text>

                          {!col.items || col.items.length === 0 ? (
                            <Text
                              style={{
                                fontSize: 11,
                                color: colors.textMuted,
                                fontStyle: "italic",
                                marginLeft: 24,
                              }}
                            >
                              Empty collection
                            </Text>
                          ) : (
                            col.items
                              .filter((i) => !i.archived)
                              .map((res) => {
                                const isChecked = linkedCollectionIds.includes(
                                  res.id,
                                );
                                return (
                                  <TouchableOpacity
                                    key={res.id}
                                    onPress={() => toggleDaySelection(res.id)}
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      paddingVertical: 8,
                                      paddingHorizontal: 12,
                                      marginLeft: 16,
                                      borderRadius: 10,
                                      marginVertical: 2,
                                      borderWidth: 1,
                                      borderColor: isChecked
                                        ? colors.primary
                                        : colors.border,
                                      backgroundColor: isChecked
                                        ? `${colors.primary}08`
                                        : "transparent",
                                    }}
                                  >
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 8,
                                        flex: 1,
                                      }}
                                    >
                                      <Text style={{ fontSize: 13 }}>
                                        {res.type === "link"
                                          ? "🔗"
                                          : res.type === "file"
                                            ? res.mimeType?.startsWith("image/")
                                              ? "🖼"
                                              : "📄"
                                            : "📝"}
                                      </Text>
                                      <Text
                                        style={{
                                          fontSize: 13,
                                          color: colors.text,
                                          flex: 1,
                                        }}
                                        numberOfLines={1}
                                      >
                                        {res.title}
                                      </Text>
                                    </View>
                                    <Feather
                                      name={
                                        isChecked ? "check-circle" : "circle"
                                      }
                                      size={16}
                                      color={
                                        isChecked
                                          ? colors.primary
                                          : colors.textMuted
                                      }
                                    />
                                  </TouchableOpacity>
                                );
                              })
                          )}
                        </View>
                      ))}
                    </View>
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
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Done</Text>
            </TouchableOpacity>
          </AppCard>
        </View>
      </Modal>
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
  headerBtnTextRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scrollContent: { padding: 18, paddingBottom: 60 },
  itemTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  metaCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  metaRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaLabel: { fontSize: 15, fontWeight: "500" },
  metaValue: { fontSize: 14, fontWeight: "600" },
  rowDivider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: "transparent",
    opacity: 0.1,
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
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 14, fontWeight: "700" },
  inputWrap: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: "700" },
  textInput: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
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
  modalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
});
