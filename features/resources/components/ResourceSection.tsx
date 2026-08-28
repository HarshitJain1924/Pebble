import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";

import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Resource, Task, Habit, Checklist, INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

const SCREEN_WIDTH = Dimensions.get("window").width;

export type FilterType = "all" | "file" | "media" | "link" | "note" | "idea";

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
  focusResourceId?: string | null;
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
  stateChecklists = [],
  onToggleLinkResource,
  focusResourceId,
}: ResourceSectionProps) {
  const router = useRouter();
  const themeName = useColorScheme() ?? "dark";
  const theme = Colors[themeName];

  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [linkingResource, setLinkingResource] = useState<Resource | null>(null);

  // New Resource Form state
  const [newResTitle, setNewResTitle] = useState("");
  const [newResType, setNewResType] = useState<"note" | "link" | "file" | "media" | "idea">("note");
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

  // Auto-open resource detail overlay when navigated from "Use Existing"
  useEffect(() => {
    if (focusResourceId && folderResources.length > 0) {
      const target = folderResources.find((r) => r.id === focusResourceId);
      if (target) {
        setSelectedResource(target);
      }
    }
  }, [focusResourceId, folderResources]);

  const filteredResources = useMemo(() => {
    let list = folderResources.filter((r) => !r.archivedAt);

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      return list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.body && r.body.toLowerCase().includes(q))
      );
    }

    if (activeFilter === "media") {
      return list.filter((r) => {
        const att = r.attachments?.[0];
        return Boolean(att && att.mimeType?.startsWith("image/"));
      });
    }
    if (activeFilter === "file") {
      return list.filter((r) => {
        const att = r.attachments?.[0];
        return Boolean(att && !att.mimeType?.startsWith("image/"));
      });
    }
    if (activeFilter === "link") {
      return list.filter((r) => r.type === "link");
    }
    if (activeFilter === "note") {
      return list.filter((r) => r.type === "note" && (!r.attachments || r.attachments.length === 0));
    }
    if (activeFilter === "idea") {
      return list.filter((r) => r.type === "idea");
    }

    return list;
  }, [folderResources, activeFilter, searchQuery]);

  const handlePickDocument = useCallback(async (isMediaOnly = false) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: isMediaOnly ? ["image/*", "video/*"] : "*/*",
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
    const resolvedType = (newResType === "file" || newResType === "media") ? "note" : newResType;
    const newItemData: Partial<Resource> = {
      type: resolvedType,
      title: newResTitle.trim(),
      body: newResContent.trim() || undefined,
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
  }, [editingResource, editTitle, editContent, activeFolderId, updateResource]);

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

  const getDomain = (url: string) => {
    try {
      const target = url.startsWith("http") ? url : `https://${url}`;
      return new URL(target).hostname.replace("www.", "");
    } catch {
      return "link";
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getLinkedParent = (resId: string) => {
    const linkedTask = stateTodos.find((t) => t.resourceIds?.includes(resId));
    if (linkedTask) return { type: "task" as const, title: linkedTask.title };
    const linkedHabit = stateHabits.find((h) => h.resourceIds?.includes(resId));
    if (linkedHabit) return { type: "habit" as const, title: linkedHabit.title };
    const linkedChecklist = stateChecklists.find((c) => c.resourceIds?.includes(resId));
    if (linkedChecklist) return { type: "checklist" as const, title: linkedChecklist.title };
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Workspace Section Header (Matching Tasks, Habits, Checklists) */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>Resources</Text>
        <Text style={[styles.itemCountText, { color: theme.textMuted }]}>
          {folderResources.length} {folderResources.length === 1 ? "item" : "items"}
        </Text>
      </View>

      {/* Sleek Filter Tabs & Add Button */}
      <View style={styles.topControlRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContainer}
        >
          {(
            [
              { key: "all", label: "All" },
              { key: "file", label: "Files 📁" },
              { key: "media", label: "Media 🖼️" },
              { key: "link", label: "Links 🔗" },
              { key: "note", label: "Notes 📝" },
              { key: "idea", label: "Ideas 💡" },
            ] as { key: FilterType; label: string }[]
          ).map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <PressableScale
                key={filter.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveFilter(filter.key);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? theme.primary : `${theme.card}`,
                    borderColor: isActive ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? "#FFFFFF" : theme.textMuted },
                  ]}
                >
                  {filter.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      {/* Compact Resource List (Space-Efficient & Scannable) */}
      <View style={styles.cardFeed}>
        {filteredResources.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: `${theme.primary}12` }]}>
              <Feather name="folder" size={26} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No resources found</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Files, images, links, or notes in this workspace will appear here.
            </Text>
          </View>
        ) : (
          filteredResources.map((res) => {
            const hasAttachment = Boolean(res.attachments && res.attachments.length > 0);
            const isImage = Boolean(hasAttachment && res.attachments?.[0]?.mimeType?.startsWith("image/"));
            const attachment = res.attachments?.[0];
            const linkedParent = getLinkedParent(res.id);

            return (
              <AppCard
                key={res.id}
                onPress={() => router.push(`/resource-details?id=${res.id}&workspaceId=${activeFolderId}`)}
                style={[
                  styles.compactCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                {/* Left Visual Icon / Compact Thumbnail */}
                <View style={styles.thumbnailBox}>
                  {isImage && attachment?.uri ? (
                    <ExpoImage
                      source={{ uri: attachment.uri }}
                      style={styles.compactImagePreview}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : hasAttachment ? (
                    <View style={[styles.iconBox, { backgroundColor: "#06B6D415" }]}>
                      <Feather name="file-text" size={22} color="#06B6D4" />
                    </View>
                  ) : res.type === "link" ? (
                    <View style={[styles.iconBox, { backgroundColor: "#3B82F615" }]}>
                      <Feather name="link" size={22} color="#3B82F6" />
                    </View>
                  ) : res.type === "idea" ? (
                    <View style={[styles.iconBox, { backgroundColor: "#EAB30815" }]}>
                      <Feather name={"lightbulb" as any} size={22} color="#EAB308" />
                    </View>
                  ) : (
                    <View style={[styles.iconBox, { backgroundColor: "#8B5CF615" }]}>
                      <Feather name="align-left" size={22} color="#8B5CF6" />
                    </View>
                  )}
                </View>

                {/* Right Content */}
                <View style={styles.cardInfoCol}>
                  {/* Top Meta Chips Row */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.typeBadgeRow}>
                      {hasAttachment ? (
                        <View style={[styles.typeChip, { backgroundColor: isImage ? "#10B98115" : "#06B6D415" }]}>
                          <Text style={[styles.typeChipText, { color: isImage ? "#10B981" : "#06B6D4" }]}>
                            {isImage ? "Media" : "File"}
                          </Text>
                          {attachment?.size ? (
                            <Text style={[styles.chipMetaText, { color: theme.textMuted }]}>
                              • {formatSize(attachment.size)}
                            </Text>
                          ) : null}
                        </View>
                      ) : res.type === "link" ? (
                        <View style={[styles.typeChip, { backgroundColor: "#3B82F615" }]}>
                          <Text style={[styles.typeChipText, { color: "#3B82F6" }]}>
                            {attachment?.uri ? getDomain(attachment.uri) : "Link"}
                          </Text>
                        </View>
                      ) : res.type === "idea" ? (
                        <View style={[styles.typeChip, { backgroundColor: "#EAB30815" }]}>
                          <Text style={[styles.typeChipText, { color: "#EAB308" }]}>Idea</Text>
                        </View>
                      ) : (
                        <View style={[styles.typeChip, { backgroundColor: "#8B5CF615" }]}>
                          <Text style={[styles.typeChipText, { color: "#8B5CF6" }]}>Note</Text>
                        </View>
                      )}

                      {/* Linked Parent Chip */}
                      {linkedParent && (
                        <View style={[styles.linkedChip, { backgroundColor: `${theme.border}40` }]}>
                          <Feather name="link-2" size={10} color={theme.textMuted} />
                          <Text style={[styles.linkedChipText, { color: theme.textMuted }]} numberOfLines={1}>
                            {linkedParent.title}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Actions on Right */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {res.type === "link" && attachment?.uri && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            void handleOpenLink(attachment.uri);
                          }}
                          hitSlop={8}
                          style={[styles.openLinkIconBtn, { backgroundColor: `${theme.primary}12` }]}
                        >
                          <Feather name="external-link" size={12} color={theme.primary} />
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          setSelectedResource(res);
                        }}
                        hitSlop={10}
                        style={styles.moreButton}
                      >
                        <Feather name="more-vertical" size={16} color={theme.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Title */}
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                    {res.title}
                  </Text>

                  {/* Snippet preview */}
                  {res.body ? (
                    <Text style={[styles.cardSnippet, { color: theme.textMuted }]} numberOfLines={1}>
                      {res.body}
                    </Text>
                  ) : (
                    <Text style={[styles.cardDateText, { color: theme.textMuted }]}>
                      {new Date(res.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  )}
                </View>
              </AppCard>
            );
          })
        )}
      </View>

      {/* Add Resource Modal (Level 2 Sheet) */}
      <AnimatedOverlay visible={isAddingResource} onClose={() => setIsAddingResource(false)} type="bottom-sheet">
        {() => (
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.sheetHandleBar} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Resource</Text>
              <TouchableOpacity onPress={() => setIsAddingResource(false)} hitSlop={10}>
                <Feather name="x" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Type Selector Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeSelectorDeck}>
              {(
                [
                  { type: "note", label: "Note", icon: "align-left" },
                  { type: "link", label: "Link", icon: "link" },
                  { type: "file", label: "File", icon: "file-text" },
                  { type: "media", label: "Media", icon: "image" },
                  { type: "idea", label: "Idea", icon: "zap" },
                ] as const
              ).map((t) => {
                const isSelected = newResType === t.type;
                return (
                  <PressableScale
                    key={t.type}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setNewResType(t.type);
                    }}
                    style={[
                      styles.typeTabPill,
                      {
                        backgroundColor: isSelected ? theme.primary : `${theme.border}30`,
                      },
                    ]}
                  >
                    <Feather
                      name={t.icon as any}
                      size={13}
                      color={isSelected ? "#FFFFFF" : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.typeTabPillText,
                        { color: isSelected ? "#FFFFFF" : theme.textMuted },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            {/* Title Input */}
            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
              ]}
              placeholder={newResType === "media" || newResType === "file" ? "Title or caption..." : "Title..."}
              placeholderTextColor={theme.textMuted}
              value={newResTitle}
              onChangeText={setNewResTitle}
              autoFocus
            />

            {/* Link URL Input */}
            {newResType === "link" && (
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                ]}
                placeholder="https://example.com"
                placeholderTextColor={theme.textMuted}
                value={newResUrl}
                onChangeText={setNewResUrl}
                keyboardType="url"
                autoCapitalize="none"
              />
            )}

            {/* Note/Idea Multiline Body */}
            {(newResType === "note" || newResType === "idea" || newResType === "file" || newResType === "media") && (
              <TextInput
                style={[
                  styles.modalInput,
                  styles.textArea,
                  { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                ]}
                placeholder={newResType === "media" || newResType === "file" ? "Optional notes or caption..." : "Write notes, specs, or thoughts..."}
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={3}
                value={newResContent}
                onChangeText={setNewResContent}
              />
            )}

            {/* File / Media Picker */}
            {(newResType === "file" || newResType === "media") && (
              <TouchableOpacity
                style={[
                  styles.filePickerBox,
                  {
                    borderColor: pickedFile ? theme.primary : theme.border,
                    backgroundColor: pickedFile ? `${theme.primary}0C` : theme.background,
                  },
                ]}
                onPress={() => handlePickDocument(newResType === "media")}
                activeOpacity={0.8}
              >
                <Feather
                  name={pickedFile ? "check-circle" : newResType === "media" ? "image" : "upload-cloud"}
                  size={20}
                  color={pickedFile ? theme.primary : theme.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.filePickerTitle, { color: theme.text }]} numberOfLines={1}>
                    {pickedFile ? pickedFile.name : newResType === "media" ? "Choose Image or Video" : "Choose Document (PDF, Doc, Zip)"}
                  </Text>
                  <Text style={[styles.filePickerSub, { color: theme.textMuted }]}>
                    {pickedFile ? `${formatSize(pickedFile.size)} • Ready to save` : "Tap to browse files"}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Save CTA */}
            <PressableScale
              onPress={handleSaveResource}
              haptic
              style={[styles.savePillBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.savePillBtnText}>Save Resource</Text>
            </PressableScale>
          </View>
        )}
      </AnimatedOverlay>

      {/* Redesigned Polished Bottom Action Menu Sheet */}
      <AnimatedOverlay visible={!!selectedResource} onClose={() => setSelectedResource(null)} type="bottom-sheet">
        {() =>
          selectedResource ? (
            <View style={[styles.actionSheetCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Drag Handle Bar */}
              <View style={styles.sheetHandleBar} />

              {/* Title Header */}
              <View style={styles.actionSheetHeader}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.actionSheetTitle, { color: theme.text }]} numberOfLines={1}>
                    {selectedResource.title}
                  </Text>
                  <Text style={[styles.actionSheetSub, { color: theme.textMuted }]}>
                    {selectedResource.attachments?.[0]?.name || `${selectedResource.type.toUpperCase()} RESOURCE`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedResource(null)}
                  hitSlop={10}
                  style={[styles.closeIconBtn, { backgroundColor: `${theme.border}40` }]}
                >
                  <Feather name="x" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Action List Items */}
              <View style={styles.actionMenuDeck}>
                <TouchableOpacity
                  style={[styles.actionRowBtn, { backgroundColor: `${theme.border}20` }]}
                  onPress={() => {
                    const res = selectedResource;
                    setSelectedResource(null);
                    handleOpenEdit(res);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconPill, { backgroundColor: `${theme.primary}18` }]}>
                    <Feather name="edit-2" size={15} color={theme.primary} />
                  </View>
                  <Text style={[styles.actionRowText, { color: theme.text }]}>Edit Resource</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRowBtn, { backgroundColor: `${theme.border}20` }]}
                  onPress={() => {
                    setLinkingResource(selectedResource);
                    setSelectedResource(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconPill, { backgroundColor: "#3B82F618" }]}>
                    <Feather name="link-2" size={15} color="#3B82F6" />
                  </View>
                  <Text style={[styles.actionRowText, { color: theme.text }]}>Link to Task / Habit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRowBtn, { backgroundColor: `${theme.border}20` }]}
                  onPress={() => {
                    handleToggleArchive(selectedResource);
                    setSelectedResource(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconPill, { backgroundColor: `${theme.border}60` }]}>
                    <Feather name="archive" size={15} color={theme.textMuted} />
                  </View>
                  <Text style={[styles.actionRowText, { color: theme.text }]}>
                    {selectedResource.archivedAt ? "Unarchive" : "Archive"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRowBtn, { backgroundColor: "rgba(239,68,68,0.1)" }]}
                  onPress={() => handleDelete(selectedResource)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconPill, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                    <Feather name="trash-2" size={15} color="#EF4444" />
                  </View>
                  <Text style={[styles.actionRowText, { color: "#EF4444", fontWeight: "700" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        }
      </AnimatedOverlay>

      {/* Edit Modal */}
      <AnimatedOverlay visible={!!editingResource} onClose={() => setEditingResource(null)} type="bottom-sheet">
        {() =>
          editingResource ? (
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.sheetHandleBar} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Resource</Text>
                <TouchableOpacity onPress={() => setEditingResource(null)} hitSlop={10}>
                  <Feather name="x" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                ]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Title"
                placeholderTextColor={theme.textMuted}
              />

              {editingResource.body !== undefined && (
                <TextInput
                  style={[
                    styles.modalInput,
                    styles.textArea,
                    { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                  ]}
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  numberOfLines={4}
                  placeholder="Content..."
                  placeholderTextColor={theme.textMuted}
                />
              )}

              <PressableScale
                style={[styles.savePillBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveEdit}
                haptic
              >
                <Text style={styles.savePillBtnText}>Save Changes</Text>
              </PressableScale>
            </View>
          ) : null
        }
      </AnimatedOverlay>

      {/* Link Resource Modal */}
      <AnimatedOverlay visible={!!linkingResource} onClose={() => setLinkingResource(null)} type="bottom-sheet">
        {() =>
          linkingResource ? (
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.sheetHandleBar} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Link Resource</Text>
                <TouchableOpacity onPress={() => setLinkingResource(null)} hitSlop={10}>
                  <Feather name="x" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {stateTodos.length > 0 && (
                  <>
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
                          <Feather
                            name={isLinked ? "check-square" : "square"}
                            size={16}
                            color={isLinked ? theme.primary : theme.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {stateHabits.length > 0 && (
                  <>
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
                          <Feather
                            name={isLinked ? "check-square" : "square"}
                            size={16}
                            color={isLinked ? theme.primary : theme.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {stateChecklists.length > 0 && (
                  <>
                    <Text style={[styles.subHeading, { color: theme.textMuted, marginTop: 16 }]}>CHECKLISTS</Text>
                    {stateChecklists.map((checklist) => {
                      const isLinked = checklist.resourceIds?.includes(linkingResource.id);
                      return (
                        <TouchableOpacity
                          key={checklist.id}
                          style={styles.linkItemRow}
                          onPress={() => {
                            if (onToggleLinkResource) {
                              onToggleLinkResource(checklist.id, "checklist", linkingResource.id);
                            }
                          }}
                        >
                          <Text style={[styles.linkItemText, { color: theme.text }]}>{checklist.title}</Text>
                          <Feather
                            name={isLinked ? "check-square" : "square"}
                            size={16}
                            color={isLinked ? theme.primary : theme.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            </View>
          ) : null
        }
      </AnimatedOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: "600",
  },
  topControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  filterBarContainer: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  cardFeed: {
    gap: 8,
  },
  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    minHeight: 74,
  },
  thumbnailBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  compactImagePreview: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  iconBox: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfoCol: {
    flex: 1,
    gap: 3,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeChipText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  chipMetaText: {
    fontSize: 10,
    fontWeight: "600",
  },
  linkedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  linkedChipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  openLinkIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moreButton: {
    padding: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  cardSnippet: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardDateText: {
    fontSize: 11,
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 12,
    lineHeight: 17,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginTop: 6,
  },
  emptyAddBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(150,150,150,0.3)",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalCard: {
    width: SCREEN_WIDTH - 32,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  typeSelectorDeck: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  typeTabPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  typeTabPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalInput: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  filePickerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  filePickerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  filePickerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  savePillBtn: {
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  savePillBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  actionSheetCard: {
    width: SCREEN_WIDTH - 24,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    paddingBottom: 24,
  },
  actionSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  actionSheetSub: {
    fontSize: 11,
    fontWeight: "600",
  },
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionMenuDeck: {
    gap: 8,
  },
  actionRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  actionIconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRowText: {
    fontSize: 14,
    fontWeight: "600",
  },
  subHeading: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  linkItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150,150,150,0.15)",
  },
  linkItemText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    marginRight: 10,
  },
});
