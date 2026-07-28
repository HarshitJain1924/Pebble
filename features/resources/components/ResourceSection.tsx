import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as DocumentPicker from "expo-document-picker";
import React, { useState, useMemo, useCallback } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";


import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Resource, Task, Habit, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

const SCREEN_WIDTH = Dimensions.get("window").width;
const QUICK_ACCESS_CARD_WIDTH = Math.min(180, SCREEN_WIDTH * 0.45);

export type FilterType = "all" | "idea" | "note" | "link" | "file" | "archived";

export interface ResourceSectionProps {
  resources?: Record<string, Resource[]>;
  lists?: any[];
  createResource?: (workspaceId: string, item: Partial<Resource>) => Promise<void>;
  updateResource?: (resourceId: string, workspaceId: string, updates: Partial<Resource>) => Promise<void>;
  deleteResource?: (resourceId: string, workspaceId: string) => Promise<void>;
  toggleArchiveResource?: (resourceId: string, workspaceId: string) => Promise<void>;
  togglePinResource?: (resourceId: string, workspaceId: string) => Promise<void>;
  searchQuery?: string;
  activeFolderId?: string;
  stateTodos?: Task[];
  stateHabits?: Habit[];
  stateChecklists?: Checklist[];
  onToggleLinkResource?: (itemId: string, itemType: "task" | "habit" | "checklist", resourceId: string) => void;
}

export function ResourceSection({
  resources = {},
  createResource,
  updateResource,
  deleteResource,
  toggleArchiveResource,
  togglePinResource,
  searchQuery = "",
  activeFolderId = INBOX_WORKSPACE_ID,
  stateTodos = [],
  stateHabits = [],
  onToggleLinkResource,
}: ResourceSectionProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];

  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [linkingResource, setLinkingResource] = useState<Resource | null>(null);

  // New Resource Form state
  const [newResTitle, setNewResTitle] = useState("");
  const [newResType, setNewResType] = useState<"note" | "link" | "file" | "idea">("note");
  const [newResUrl, setNewResUrl] = useState("");
  const [newResContent, setNewResContent] = useState("");
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  // Edit Form state
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editContent, setEditContent] = useState("");

  const folderResources = useMemo(() => {
    const wsId = activeFolderId || INBOX_WORKSPACE_ID;
    return resources[wsId] || [];
  }, [resources, activeFolderId]);

  const pinnedResources = useMemo(() => {
    return folderResources.filter((r) => r.type === "idea" && !r.archivedAt);
  }, [folderResources]);

  const filteredResources = useMemo(() => {
    let list = folderResources;

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      return list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.body && r.body.toLowerCase().includes(q))
      );
    }

    if (activeFilter === "archived") {
      return list.filter((r) => r.archivedAt !== undefined);
    }

    list = list.filter((r) => !r.archivedAt);

    if (activeFilter === "idea") {
      return list.filter((r) => r.type === "idea");
    }
    if (activeFilter === "note") {
      return list.filter((r) => r.type === "note");
    }
    if (activeFilter === "link") {
      return list.filter((r) => r.type === "link");
    }

    return list;
  }, [folderResources, activeFilter, searchQuery]);

  const handlePickDocument = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setPickedFile(res.assets[0]);
        if (!newResTitle) {
          setNewResTitle(res.assets[0].name);
        }
      }
    } catch (e) {
      console.warn("DocumentPicker error", e);
    }
  }, [newResTitle]);

  const handleSaveResource = useCallback(async () => {
    if (!newResTitle.trim()) {
      Alert.alert("Required", "Please provide a resource title.");
      return;
    }

    const wsId = activeFolderId || INBOX_WORKSPACE_ID;
    const newItemData: Partial<Resource> = {
      type: newResType === "file" ? "note" : newResType,
      title: newResTitle.trim(),
      body: newResType === "note" || newResType === "idea" ? newResContent.trim() : undefined,
      attachments: pickedFile || newResUrl ? [
        ...(newResUrl ? [{ id: `att-${Date.now()}-url`, name: newResUrl, uri: newResUrl, mimeType: "text/plain" }] : []),
        ...(pickedFile ? [{ id: `att-${Date.now()}-file`, name: pickedFile.name, uri: pickedFile.uri, mimeType: pickedFile.mimeType || "application/octet-stream", size: pickedFile.size }] : []),
      ] : undefined,
    };

    if (createResource) {
      await createResource(wsId, newItemData);
    }

    setIsAddingResource(false);
    setNewResTitle("");
    setNewResUrl("");
    setNewResContent("");
    setPickedFile(null);
  }, [newResTitle, newResType, newResUrl, newResContent, pickedFile, activeFolderId, createResource]);

  const handleOpenEdit = useCallback((res: Resource) => {
    setEditingResource(res);
    setEditTitle(res.title);
    setEditUrl(res.attachments?.[0]?.uri || "");
    setEditContent(res.body || "");
    setSelectedResource(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingResource || !editTitle.trim()) return;
    const wsId = activeFolderId || INBOX_WORKSPACE_ID;
    const updates: Partial<Resource> = {
      title: editTitle.trim(),
      body: editContent.trim() || undefined,
    };

    if (updateResource) {
      await updateResource(editingResource.id, wsId, updates);
    }

    setEditingResource(null);
  }, [editingResource, editTitle, editUrl, editContent, activeFolderId, updateResource]);

  const handleTogglePin = useCallback(async (res: Resource) => {
    if (togglePinResource) {
      await togglePinResource(res.id, activeFolderId || INBOX_WORKSPACE_ID);
    }
  }, [activeFolderId, togglePinResource]);

  const handleToggleArchive = useCallback(async (res: Resource) => {
    if (toggleArchiveResource) {
      await toggleArchiveResource(res.id, activeFolderId || INBOX_WORKSPACE_ID);
    }
  }, [activeFolderId, toggleArchiveResource]);

  const handleDelete = useCallback(async (res: Resource) => {
    Alert.alert("Delete Resource", `Delete "${res.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (deleteResource) {
            await deleteResource(res.id, activeFolderId || INBOX_WORKSPACE_ID);
          }
          setSelectedResource(null);
        },
      },
    ]);
  }, [activeFolderId, deleteResource]);

  const handleOpenLink = useCallback(async (url?: string) => {
    if (!url) return;
    try {
      const targetUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
      const supported = await Linking.canOpenURL(targetUrl);
      if (supported) {
        await Linking.openURL(targetUrl);
      } else {
        Alert.alert("Cannot Open URL", `Unable to open: ${url}`);
      }
    } catch {
      Alert.alert("Error", "Could not open link.");
    }
  }, []);

  const getIconForType = (type: string) => {
    if (type === "idea") return "lightbulb";
    if (type === "link") return "link";
    return "align-left";
  };

  const getColorForType = (type: string) => {
    if (type === "idea") return "#F59E0B";
    if (type === "link") return "#3B82F6";
    return "#10B981";
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      {/* Top Action Bar */}
      <View style={styles.topActionBar}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>Resources</Text>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: theme.primary }]}
          onPress={() => setIsAddingResource(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.createButtonText}>Add Resource</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollView} contentContainerStyle={styles.filterBarContainer}>
        {(["all", "idea", "note", "link", "file", "archived"] as FilterType[]).map((filter) => {
          const isActive = activeFilter === filter;
          const label = filter === "all" ? "All" : filter === "idea" ? "Ideas" : filter === "note" ? "Notes" : filter === "link" ? "Links" : filter === "file" ? "Files" : "Archived";
          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterPill,
                { backgroundColor: isActive ? theme.primary : theme.border + "22" },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setActiveFilter(filter);
              }}
            >
              <Text style={[styles.filterPillText, { color: isActive ? "#FFFFFF" : theme.textMuted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Pinned / Quick Access Carousel */}
      {pinnedResources.length > 0 && activeFilter === "all" && !searchQuery && (
        <View style={styles.quickAccessSection}>
          <Text style={[styles.subHeading, { color: theme.textMuted }]}>QUICK ACCESS (PINNED)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessScroll}>
            {pinnedResources.map((res) => (
              <PressableScale
                key={res.id}
                style={[styles.quickAccessCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setSelectedResource(res)}
              >
                <View style={styles.quickCardHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: getColorForType(res.type) + "20" }]}>
                    <Feather name={getIconForType(res.type) as any} size={12} color={getColorForType(res.type)} />
                  </View>
                  <Feather name={"lightbulb" as any} size={12} color={theme.primary} />
                </View>
                <Text style={[styles.quickCardTitle, { color: theme.text }]} numberOfLines={2}>
                  {res.title}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Resources Flat Database List */}
      <View style={styles.databaseSection}>
        <Text style={[styles.subHeading, { color: theme.textMuted }]}>
          {activeFilter.toUpperCase()} RESOURCES ({filteredResources.length})
        </Text>

        {filteredResources.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name={"folder-minus" as any} size={36} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No resources found</Text>
          </View>
        ) : (
          filteredResources.map((res) => {
            const iconColor = getColorForType(res.type);
            return (
              <AppCard
                key={res.id}
                style={[styles.resourceCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setSelectedResource(res)}
              >
                <View style={styles.cardMainRow}>
                  <View style={[styles.iconContainer, { backgroundColor: iconColor + "18" }]}>
                    <Feather name={getIconForType(res.type) as any} size={18} color={iconColor} />
                  </View>
                  <View style={styles.cardContent}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                        {res.title}
                      </Text>
                    </View>
                    {res.body ? (
                      <Text style={[styles.cardSnippet, { color: theme.textMuted }]} numberOfLines={2}>
                        {res.body}
                      </Text>
                    ) : res.attachments?.[0] ? (
                      <Text style={[styles.cardSnippet, { color: theme.textMuted }]} numberOfLines={1}>
                        📎 {res.attachments[0].name}
                      </Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={() => setSelectedResource(res)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="more-vertical" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              </AppCard>
            );
          })
        )}
      </View>

      {/* Add Resource Modal */}
      <AnimatedOverlay visible={isAddingResource} onClose={() => setIsAddingResource(false)} type="bottom-sheet">
        {() => (
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Resource</Text>
            <TouchableOpacity onPress={() => setIsAddingResource(false)}>
              <Feather name="x" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Type Selector */}
          <View style={styles.typeSelectorRow}>
            {(["note", "link", "file", "idea"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeTab,
                  { backgroundColor: newResType === t ? theme.primary : theme.border + "22" },
                ]}
                onPress={() => setNewResType(t)}
              >
                <Feather
                  name={getIconForType(t) as any}
                  size={14}
                  color={newResType === t ? "#FFFFFF" : theme.textMuted}
                />
                <Text style={[styles.typeTabText, { color: newResType === t ? "#FFFFFF" : theme.textMuted }]}>
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
            placeholder="Title"
            placeholderTextColor={theme.textMuted}
            value={newResTitle}
            onChangeText={setNewResTitle}
          />

          {newResType === "link" && (
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder="https://example.com"
              placeholderTextColor={theme.textMuted}
              value={newResUrl}
              onChangeText={setNewResUrl}
            />
          )}

          {(newResType === "note" || newResType === "idea") && (
            <TextInput
              style={[styles.modalInput, styles.textArea, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder="Content / notes..."
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={4}
              value={newResContent}
              onChangeText={setNewResContent}
            />
          )}

          {newResType === "file" && (
            <TouchableOpacity style={[styles.filePickerButton, { borderColor: theme.border }]} onPress={handlePickDocument}>
              <Feather name="upload-cloud" size={20} color={theme.primary} />
              <Text style={[styles.filePickerText, { color: theme.text }]}>
                {pickedFile ? pickedFile.name : "Choose File"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.primary }]}
            onPress={handleSaveResource}
          >
            <Text style={styles.saveButtonText}>Save Resource</Text>
          </TouchableOpacity>
        </View>
        )}
      </AnimatedOverlay>

      {/* Detail / Action Modal */}
      <AnimatedOverlay visible={!!selectedResource} onClose={() => setSelectedResource(null)} type="bottom-sheet">
        {() => selectedResource ? (
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                {selectedResource.title}
              </Text>
              <TouchableOpacity onPress={() => setSelectedResource(null)}>
                <Feather name="x" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedResource.body ? (
              <ScrollView style={styles.detailContentBox}>
                <Text style={[styles.detailText, { color: theme.text }]}>{selectedResource.body}</Text>
              </ScrollView>
            ) : null}

            {selectedResource.attachments?.[0]?.uri ? (
              <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink(selectedResource.attachments![0].uri)}>
                <Feather name="external-link" size={16} color={theme.primary} />
                <Text style={[styles.linkUrlText, { color: theme.primary }]} numberOfLines={1}>
                  {selectedResource.attachments[0].uri}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Quick Action Rows */}
            <View style={styles.actionMenu}>
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  const res = selectedResource;
                  setSelectedResource(null);
                  handleOpenEdit(res);
                }}
              >
                <Feather name="edit-2" size={16} color={theme.text} />
                <Text style={[styles.actionMenuText, { color: theme.text }]}>Edit Resource</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  handleToggleArchive(selectedResource);
                  setSelectedResource(null);
                }}
              >
                <Feather name="archive" size={16} color={theme.text} />
                <Text style={[styles.actionMenuText, { color: theme.text }]}>
                  {selectedResource.archivedAt ? "Unarchive" : "Archive"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  setLinkingResource(selectedResource);
                  setSelectedResource(null);
                }}
              >
                <Feather name="link-2" size={16} color={theme.text} />
                <Text style={[styles.actionMenuText, { color: theme.text }]}>Link to Task / Habit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleDelete(selectedResource)}
              >
                <Feather name="trash-2" size={16} color="#EF4444" />
                <Text style={[styles.actionMenuText, { color: "#EF4444" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </AnimatedOverlay>

      {/* Edit Modal */}
      <AnimatedOverlay visible={!!editingResource} onClose={() => setEditingResource(null)} type="bottom-sheet">
        {() => editingResource ? (
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Resource</Text>
              <TouchableOpacity onPress={() => setEditingResource(null)}>
                <Feather name="x" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
              placeholderTextColor={theme.textMuted}
            />

            {editingResource.type === "link" && (
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={editUrl}
                onChangeText={setEditUrl}
                placeholder="URL"
                placeholderTextColor={theme.textMuted}
              />
            )}

            {editingResource.type === "note" && (
              <TextInput
                style={[styles.modalInput, styles.textArea, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={editContent}
                onChangeText={setEditContent}
                multiline
                numberOfLines={4}
                placeholder="Content..."
                placeholderTextColor={theme.textMuted}
              />
            )}

            <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={handleSaveEdit}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </AnimatedOverlay>

      {/* Link Resource Modal */}
      <AnimatedOverlay visible={!!linkingResource} onClose={() => setLinkingResource(null)} type="bottom-sheet">
        {() => linkingResource ? (
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Link Resource</Text>
              <TouchableOpacity onPress={() => setLinkingResource(null)}>
                <Feather name="x" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={[styles.subHeading, { color: theme.textMuted, marginTop: 8 }]}>TASKS</Text>
              {stateTodos.map((todo) => {
                const isLinked = todo.resourceIds?.includes(linkingResource.id);
                return (
                  <TouchableOpacity
                    key={todo.id}
                    style={styles.linkItemRow}
                    onPress={() => {
                      if (onToggleLinkResource) {
                        onToggleLinkResource(todo.id, "task", linkingResource.id);
                      }
                    }}
                  >
                    <Text style={[styles.linkItemText, { color: theme.text }]}>{todo.title}</Text>
                    <Feather name={isLinked ? "check-square" : "square"} size={16} color={isLinked ? theme.primary : theme.textMuted} />
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.subHeading, { color: theme.textMuted, marginTop: 16 }]}>HABITS</Text>
              {stateHabits.map((habit) => {
                const isLinked = habit.resourceIds?.includes(linkingResource.id);
                return (
                  <TouchableOpacity
                    key={habit.id}
                    style={styles.linkItemRow}
                    onPress={() => {
                      if (onToggleLinkResource) {
                        onToggleLinkResource(habit.id, "habit", linkingResource.id);
                      }
                    }}
                  >
                    <Text style={[styles.linkItemText, { color: theme.text }]}>{habit.title}</Text>
                    <Feather name={isLinked ? "check-square" : "square"} size={16} color={isLinked ? theme.primary : theme.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </AnimatedOverlay>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  topActionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 22,
    fontWeight: "700",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  filterScrollView: {
    marginBottom: 16,
  },
  filterBarContainer: {
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  quickAccessSection: {
    marginBottom: 20,
  },
  subHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  quickAccessScroll: {
    gap: 12,
  },
  quickAccessCard: {
    width: QUICK_ACCESS_CARD_WIDTH,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  typeBadge: {
    padding: 4,
    borderRadius: 6,
  },
  quickCardTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  databaseSection: {
    gap: 10,
  },
  resourceCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    padding: 10,
    borderRadius: 10,
  },
  cardContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  pinIcon: {
    marginLeft: 4,
  },
  cardSnippet: {
    fontSize: 13,
    marginTop: 3,
  },
  cardUrl: {
    fontSize: 12,
    marginTop: 3,
    textDecorationLine: "underline",
  },
  moreButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
  },
  modalCard: {
    width: SCREEN_WIDTH - 48,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  typeSelectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  typeTabText: {
    fontSize: 11,
    fontWeight: "700",
  },
  modalInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
  },
  textArea: {
    height: 90,
    textAlignVertical: "top",
  },
  filePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 8,
  },
  filePickerText: {
    fontSize: 14,
    fontWeight: "500",
  },
  saveButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  detailContentBox: {
    maxHeight: 180,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  linkUrlText: {
    fontSize: 13,
    textDecorationLine: "underline",
  },
  actionMenu: {
    gap: 12,
    marginTop: 10,
  },
  actionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  actionMenuText: {
    fontSize: 14,
    fontWeight: "500",
  },
  linkItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150,150,150,0.2)",
  },
  linkItemText: {
    fontSize: 14,
  },
});
