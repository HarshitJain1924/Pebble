import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  Dimensions,
  Share,
} from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "@/shared/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { Resource, ResourceCollection, Workspace, Task, type Habit, type Checklist } from "@/shared/types/domain.types";
import PressableScale from "@/shared/components/ui/PressableScale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const QUICK_ACCESS_CARD_WIDTH = (SCREEN_WIDTH - 48) / 2.5;

type ResourceWithMeta = Resource & { collectionId: string };

export interface ResourceSectionProps {
  collections: Record<string, ResourceCollection[]>;
  lists: Workspace[];
  createCollection: (workspaceId: string, name: string, emoji: string) => Promise<void>;
  deleteCollection: (id: string, workspaceId: string) => Promise<void>;
  renameCollection: (id: string, workspaceId: string, name: string, emoji: string) => Promise<void>;
  addCollectionItem: (workspaceId: string, collectionId: string, item: any) => Promise<void>;
  updateCollectionItem: (itemId: string, collectionId: string, workspaceId: string, updates: any) => Promise<void>;
  deleteCollectionItem: (id: string, collectionId: string, workspaceId: string) => Promise<void>;
  toggleArchiveCollectionItem: (id: string, collectionId: string, workspaceId: string) => Promise<void>;
  togglePinCollectionItem: (id: string, collectionId: string, workspaceId: string) => Promise<void>;
  convertCollectionItemToTask: (item: any) => Promise<void>;
  searchQuery: string;
  activeFolderId: string;
  stateTodos?: Task[];
  stateHabits?: Habit[];
  stateChecklists?: Checklist[];
  onToggleLinkResource?: (itemId: string, itemType: "task" | "habit" | "checklist", resourceId: string) => Promise<void>;
}

export function ResourceSection({
  collections,
  createCollection,
  deleteCollection,
  renameCollection,
  addCollectionItem,
  updateCollectionItem,
  deleteCollectionItem,
  toggleArchiveCollectionItem,
  togglePinCollectionItem,
  searchQuery,
  activeFolderId,
  stateTodos = [],
  stateHabits = [],
  onToggleLinkResource,
}: ResourceSectionProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];

  const [isAddingResource, setIsAddingResource] = useState(false);
  const [newResType, setNewResType] = useState<"link" | "note" | "file">("note");
  const [newResTitle, setNewResTitle] = useState("");
  const [newResUrl, setNewResUrl] = useState("");
  const [newResContent, setNewResContent] = useState("");

  const [pickedFile, setPickedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);

  const [selectedResource, setSelectedResource] = useState<ResourceWithMeta | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceWithMeta | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editContent, setEditContent] = useState("");

  const [quickAccessFilter, setQuickAccessFilter] = useState<"all" | "link" | "note" | "file" | "idea">("all");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollName, setNewCollName] = useState("");
  const [newCollEmoji, setNewCollEmoji] = useState("📦");
  const [optionsCollection, setOptionsCollection] = useState<ResourceCollection | null>(null);
  const [linkingResource, setLinkingResource] = useState<ResourceWithMeta | null>(null);

  const currentCollections = useMemo(() => {
    const listId = activeFolderId || "default";
    return collections[listId] || [];
  }, [collections, activeFolderId]);

  const pinnedResources = useMemo(() => {
    const pinned: ResourceWithMeta[] = [];
    currentCollections.forEach((coll) => {
      coll.items?.forEach((item) => {
        if (item.pinned && !item.archived) {
          pinned.push({ ...item, collectionId: coll.id });
        }
      });
    });
    return pinned;
  }, [currentCollections]);

  const filteredPinnedResources = useMemo(() => {
    if (quickAccessFilter === "all") return pinnedResources;
    if (quickAccessFilter === "idea") return pinnedResources.filter((r) => r.kind === "idea");
    return pinnedResources.filter((r) => r.type === quickAccessFilter && r.kind !== "idea");
  }, [pinnedResources, quickAccessFilter]);

  const allResources = useMemo(() => {
    const all: ResourceWithMeta[] = [];
    currentCollections.forEach((coll) => {
      coll.items?.forEach((item) => {
        if (!item.archived) {
          all.push({ ...item, collectionId: coll.id });
        }
      });
    });
    return all;
  }, [currentCollections]);

  const searchedResources = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allResources.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.content && r.content.toLowerCase().includes(q)) ||
        (r.url && r.url.toLowerCase().includes(q))
    );
  }, [allResources, searchQuery]);

  const handleQuickPasteUrl = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        setNewResUrl(text);
        setNewResType("link");
        if (!newResTitle) {
          try {
            const parsedUrl = new URL(text);
            setNewResTitle(parsedUrl.hostname.replace("www.", ""));
          } catch {
            setNewResTitle(text);
          }
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        Alert.alert("No URL in Clipboard", "Copy a valid link first to auto-fill.");
      }
    } catch (e) {
      console.warn("Failed to read clipboard", e);
    }
  }, [newResTitle]);

  const handlePickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPickedFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType,
        });
        setNewResTitle(asset.name);
        setNewResType("file");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn("Failed to pick document", e);
    }
  }, []);

  const handleSaveResource = useCallback(async () => {
    if (!newResTitle.trim()) {
      Alert.alert("Title Required", "Please enter a title for this reference.");
      return;
    }

    const defaultCollection = currentCollections[0]?.id || "default_vault";
    const newItem: any = {
      type: newResType,
      title: newResTitle.trim(),
      url: newResType === "link" ? newResUrl.trim() : undefined,
      content: newResType === "note" ? newResContent.trim() : undefined,
      localUri: newResType === "file" ? pickedFile?.uri : undefined,
      fileSize: newResType === "file" ? pickedFile?.size : undefined,
      mimeType: newResType === "file" ? pickedFile?.mimeType : undefined,
      pinned: false,
      archived: false,
    };

    await addCollectionItem(activeFolderId || "default", defaultCollection, newItem);

    setIsAddingResource(false);
    setNewResTitle("");
    setNewResUrl("");
    setNewResContent("");
    setPickedFile(null);
    setNewResType("note");
  }, [newResTitle, newResType, newResUrl, newResContent, pickedFile, currentCollections, activeFolderId, addCollectionItem]);

  const handleOpenResource = useCallback((item: ResourceWithMeta) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (item.type === "link" && item.url) {
      Linking.openURL(item.url).catch(() => {
        Alert.alert("Cannot Open URL", `Unable to navigate to ${item.url}`);
      });
    } else if (item.type === "file" && item.localUri) {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        Sharing.shareAsync(item.localUri).catch((e) => console.warn("Share error", e));
      } else {
        Linking.openURL(item.localUri).catch(() => {});
      }
    } else {
      setSelectedResource(item);
    }
  }, []);

  const handleShareResource = useCallback((item: ResourceWithMeta) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const shareContent = item.type === "link" ? item.url : item.content || item.title;
    if (shareContent) {
      Share.share({
        message: `${item.title}\n${shareContent}`,
        url: item.type === "link" ? item.url : undefined,
      }).catch(() => {});
    }
  }, []);

  const handleOpenEditResource = useCallback((item: ResourceWithMeta) => {
    setEditingResource(item);
    setEditTitle(item.title);
    setEditUrl(item.url || "");
    setEditContent(item.content || "");
    setSelectedResource(null);
  }, []);

  const handleSaveEditResource = useCallback(async () => {
    if (!editingResource || !editTitle.trim()) return;
    await updateCollectionItem(editingResource.id, editingResource.collectionId, activeFolderId || "default", {
      title: editTitle.trim(),
      url: editUrl.trim() || undefined,
      content: editContent.trim() || undefined,
    });
    setEditingResource(null);
  }, [editingResource, editTitle, editUrl, editContent, activeFolderId, updateCollectionItem]);

  return (
    <View style={styles.container}>
      {searchQuery.trim().length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Search Results ({searchedResources.length})
          </Text>
          {searchedResources.length === 0 ? (
            <AppCard style={{ padding: 20, alignItems: "center" }}>
              <Feather name="search" size={28} color={theme.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: theme.textMuted, fontSize: 14 }}>No references match &quot;{searchQuery}&quot;</Text>
            </AppCard>
          ) : (
            searchedResources.map((item) => (
              <AppCard key={item.id} style={{ padding: 14 }}>
                <TouchableOpacity onPress={() => handleOpenResource(item)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: theme.cardLight,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather
                      name={item.type === "link" ? "link" : item.type === "file" ? "file-text" : "align-left"}
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textMuted }} numberOfLines={1}>
                      {item.type === "link" ? item.url : item.content || "Reference note"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </AppCard>
            ))
          )}
        </View>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="star" size={16} color={theme.primary} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Quick Access
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAddingResource(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 20,
                  backgroundColor: theme.primaryLight,
                }}
              >
                <Feather name="plus" size={14} color={theme.primary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.primary }}>Add</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
              {[
                { key: "all", label: "All Pinned" },
                { key: "link", label: "Links" },
                { key: "note", label: "Notes" },
                { key: "file", label: "Files" },
                { key: "idea", label: "Ideas" },
              ].map((tab) => {
                const isActive = quickAccessFilter === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setQuickAccessFilter(tab.key as any);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: isActive ? theme.primary : theme.cardLight,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: isActive ? "700" : "500", color: isActive ? "#FFFFFF" : theme.textMuted }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredPinnedResources.length === 0 ? (
              <AppCard style={{ padding: 16, alignItems: "center" }}>
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
                  {pinnedResources.length === 0
                    ? "No pinned resources yet. Pin important links or notes for quick access."
                    : "No pinned items in this category."}
                </Text>
              </AppCard>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}>
                {filteredPinnedResources.map((item) => (
                  <PressableScale
                    key={item.id}
                    onPress={() => handleOpenResource(item)}
                    style={{ width: QUICK_ACCESS_CARD_WIDTH }}
                  >
                    <AppCard style={{ padding: 12, height: 110, justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            backgroundColor: theme.primaryLight,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Feather
                            name={item.type === "link" ? "link" : item.type === "file" ? "file-text" : "align-left"}
                            size={14}
                            color={theme.primary}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => togglePinCollectionItem(item.id, item.collectionId, activeFolderId || "default")}
                        >
                          <Feather name="star" size={14} color={theme.primary} style={{ opacity: 0.9 }} />
                        </TouchableOpacity>
                      </View>

                      <View style={{ gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                          {item.type === "link" ? item.url : item.content || "Note"}
                        </Text>
                      </View>
                    </AppCard>
                  </PressableScale>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={{ gap: 12, marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="folder" size={16} color={theme.primary} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Resource Groups ({currentCollections.length})
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCreatingCollection(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Feather name="folder-plus" size={16} color={theme.primary} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.primary }}>New Group</Text>
              </TouchableOpacity>
            </View>

            {currentCollections.length === 0 ? (
              <AppCard style={{ padding: 24, alignItems: "center", gap: 8 }}>
                <Feather name="folder" size={32} color={theme.textMuted} />
                <Text style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}>No Resource Groups Yet</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
                  Create a resource group to organize research links, notes, and documents.
                </Text>
                <TouchableOpacity
                  onPress={() => setIsCreatingCollection(true)}
                  style={{
                    marginTop: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: theme.primary,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Create Resource Group</Text>
                </TouchableOpacity>
              </AppCard>
            ) : (
              currentCollections.map((coll) => {
                const activeItems = coll.items?.filter((i) => !i.archived) || [];
                return (
                  <AppCard key={coll.id} style={{ padding: 14, gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={{ fontSize: 20 }}>{coll.emoji || "📦"}</Text>
                        <View style={{ gap: 2 }}>
                          <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>{coll.name}</Text>
                          <Text style={{ fontSize: 12, color: theme.textMuted }}>{activeItems.length} items</Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setIsAddingResource(true);
                          }}
                          style={{
                            padding: 6,
                            borderRadius: 8,
                            backgroundColor: theme.cardLight,
                          }}
                        >
                          <Feather name="plus" size={16} color={theme.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setOptionsCollection(coll)}
                          style={{ padding: 6 }}
                        >
                          <Feather name="more-vertical" size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {activeItems.length === 0 ? (
                      <View style={{ paddingVertical: 12, alignItems: "center" }}>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>Group is empty</Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {activeItems.map((item) => (
                          <View
                            key={item.id}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: 10,
                              borderRadius: 10,
                              backgroundColor: theme.cardLight,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => handleOpenResource({ ...item, collectionId: coll.id })}
                              style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                            >
                              <Feather
                                name={item.type === "link" ? "link" : item.type === "file" ? "file-text" : "align-left"}
                                size={16}
                                color={theme.primary}
                              />
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }} numberOfLines={1}>
                                  {item.title}
                                </Text>
                                <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                                  {item.type === "link" ? item.url : item.content || "Note"}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <TouchableOpacity
                                onPress={() => togglePinCollectionItem(item.id, coll.id, activeFolderId || "default")}
                                style={{ padding: 4 }}
                              >
                                <Feather name="star" size={14} color={item.pinned ? theme.primary : theme.textMuted} />
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => setLinkingResource({ ...item, collectionId: coll.id })}
                                style={{ padding: 4 }}
                              >
                                <Feather name="link-2" size={14} color={item.linkedItemIds?.length ? theme.primary : theme.textMuted} />
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => handleOpenEditResource({ ...item, collectionId: coll.id })}
                                style={{ padding: 4 }}
                              >
                                <Feather name="edit-2" size={14} color={theme.textMuted} />
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => deleteCollectionItem(item.id, coll.id, activeFolderId || "default")}
                                style={{ padding: 4 }}
                              >
                                <Feather name="trash-2" size={14} color={theme.textMuted} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </AppCard>
                );
              })
            )}
          </View>
        </>
      )}

      {/* Add Resource Overlay */}
      <AnimatedOverlay
        visible={isAddingResource}
        onClose={() => setIsAddingResource(false)}
        type="bottom-sheet"
      >
        {() => (
          <View style={{ gap: 14, padding: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Add Reference</Text>
            <View style={{ flexDirection: "row", gap: 8, backgroundColor: theme.cardLight, padding: 4, borderRadius: 12 }}>
              {[
                { key: "note", label: "Note", icon: "align-left" },
                { key: "link", label: "Web Link", icon: "link" },
                { key: "file", label: "File", icon: "file-text" },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setNewResType(t.key as any);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: newResType === t.key ? theme.primary : "transparent",
                  }}
                >
                  <Feather name={t.icon as any} size={14} color={newResType === t.key ? "#FFFFFF" : theme.textMuted} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: newResType === t.key ? "#FFFFFF" : theme.textMuted }}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>TITLE</Text>
              <TextInput
                value={newResTitle}
                onChangeText={setNewResTitle}
                placeholder="e.g. System Design Architecture Notes"
                placeholderTextColor={theme.textMuted}
                style={{
                  fontSize: 15,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: theme.cardLight,
                  color: theme.text,
                }}
              />
            </View>

            {newResType === "link" && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>WEB URL</Text>
                  <TouchableOpacity onPress={handleQuickPasteUrl} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Feather name="clipboard" size={12} color={theme.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: theme.primary }}>Paste Clipboard</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={newResUrl}
                  onChangeText={setNewResUrl}
                  placeholder="https://example.com/article"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="url"
                  autoCapitalize="none"
                  style={{
                    fontSize: 15,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: theme.cardLight,
                    color: theme.text,
                  }}
                />
              </View>
            )}

            {newResType === "note" && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>CONTENT / NOTES</Text>
                <TextInput
                  value={newResContent}
                  onChangeText={setNewResContent}
                  placeholder="Write your reference notes or ideas here..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  numberOfLines={4}
                  style={{
                    fontSize: 15,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: theme.cardLight,
                    color: theme.text,
                    minHeight: 100,
                    textAlignVertical: "top",
                  }}
                />
              </View>
            )}

            {newResType === "file" && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>ATTACHED FILE</Text>
                <TouchableOpacity
                  onPress={handlePickDocument}
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderStyle: "dashed",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: theme.cardLight,
                  }}
                >
                  <Feather name="upload-cloud" size={24} color={theme.primary} />
                  <Text style={{ fontSize: 13, color: theme.text, fontWeight: "600" }}>
                    {pickedFile ? pickedFile.name : "Tap to pick a PDF, document, or file"}
                  </Text>
                  {pickedFile?.size && (
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {(pickedFile.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSaveResource}
              style={{
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: theme.primary,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Save Reference</Text>
            </TouchableOpacity>
          </View>
        )}
      </AnimatedOverlay>

      {/* Create Collection Modal */}
      <AnimatedOverlay
        visible={isCreatingCollection}
        onClose={() => setIsCreatingCollection(false)}
        type="center-modal"
      >
        {() => (
          <View style={{ gap: 14, padding: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>New Collection Folder</Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>FOLDER NAME</Text>
              <TextInput
                value={newCollName}
                onChangeText={setNewCollName}
                placeholder="e.g. Research Papers, System Architecture"
                placeholderTextColor={theme.textMuted}
                style={{
                  fontSize: 15,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: theme.cardLight,
                  color: theme.text,
                }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>FOLDER EMOJI</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {["📦", "📁", "📚", "🎨", "🔬", "💻", "💡", "📑", "⚙️", "🌐"].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => setNewCollEmoji(emoji)}
                    style={{
                      padding: 8,
                      borderRadius: 10,
                      backgroundColor: newCollEmoji === emoji ? theme.primaryLight : theme.cardLight,
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <TouchableOpacity
              onPress={async () => {
                if (!newCollName.trim()) return;
                await createCollection(activeFolderId || "default", newCollName.trim(), newCollEmoji);
                setIsCreatingCollection(false);
                setNewCollName("");
              }}
              style={{
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: theme.primary,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Create Folder</Text>
            </TouchableOpacity>
          </View>
        )}
      </AnimatedOverlay>

      {/* Selected Resource Detail Modal */}
      <AnimatedOverlay
        visible={!!selectedResource}
        onClose={() => setSelectedResource(null)}
        type="bottom-sheet"
      >
        {() => (
          selectedResource ? (
            <View style={{ gap: 14, padding: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>{selectedResource.title}</Text>
              {selectedResource.type === "link" && selectedResource.url && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(selectedResource.url!)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: theme.primaryLight,
                  }}
                >
                  <Feather name="external-link" size={16} color={theme.primary} />
                  <Text style={{ fontSize: 13, color: theme.primary, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                    {selectedResource.url}
                  </Text>
                </TouchableOpacity>
              )}

              {selectedResource.content && (
                <View
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: theme.cardLight,
                    minHeight: 120,
                  }}
                >
                  <Text style={{ fontSize: 15, color: theme.text, lineHeight: 22 }}>
                    {selectedResource.content}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => handleShareResource(selectedResource)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: theme.cardLight,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Feather name="share-2" size={16} color={theme.text} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleOpenEditResource(selectedResource)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: theme.primary,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Feather name="edit-2" size={16} color="#FFFFFF" />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        )}
      </AnimatedOverlay>

      {/* Edit Resource Modal */}
      <AnimatedOverlay
        visible={!!editingResource}
        onClose={() => setEditingResource(null)}
        type="bottom-sheet"
      >
        {() => (
          editingResource ? (
            <View style={{ gap: 14, padding: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Edit Reference</Text>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>TITLE</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={{
                    fontSize: 15,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: theme.cardLight,
                    color: theme.text,
                  }}
                />
              </View>

              {editingResource.type === "link" && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>URL</Text>
                  <TextInput
                    value={editUrl}
                    onChangeText={setEditUrl}
                    style={{
                      fontSize: 15,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: theme.cardLight,
                      color: theme.text,
                    }}
                  />
                </View>
              )}

              {editingResource.type === "note" && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: theme.textMuted }}>CONTENT</Text>
                  <TextInput
                    value={editContent}
                    onChangeText={setEditContent}
                    multiline
                    numberOfLines={4}
                    style={{
                      fontSize: 15,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: theme.cardLight,
                      color: theme.text,
                      minHeight: 100,
                      textAlignVertical: "top",
                    }}
                  />
                </View>
              )}

              <TouchableOpacity
                onPress={handleSaveEditResource}
                style={{
                  marginTop: 10,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: theme.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          ) : null
        )}
      </AnimatedOverlay>

      {/* Reverse Link Picker Modal */}
      <AnimatedOverlay
        visible={!!linkingResource}
        onClose={() => setLinkingResource(null)}
        type="bottom-sheet"
      >
        {() => (
          linkingResource ? (
            <View style={{ gap: 14, padding: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Link to Task or Habit</Text>
              <Text style={{ fontSize: 13, color: theme.textMuted }}>
                Select a task or habit to link to &quot;{linkingResource.title}&quot;:
              </Text>

              <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 8 }}>
                {stateTodos.map((todo) => {
                  const isLinked = todo.linkedCollectionIds?.includes(linkingResource.id);
                  return (
                    <TouchableOpacity
                      key={todo.id}
                      onPress={() => {
                        if (onToggleLinkResource) {
                          onToggleLinkResource(todo.id, "task", linkingResource.id);
                        }
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: isLinked ? theme.primaryLight : theme.cardLight,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Feather name="check-square" size={16} color={theme.primary} />
                        <Text style={{ fontSize: 14, color: theme.text, fontWeight: "600" }} numberOfLines={1}>
                          {todo.title}
                        </Text>
                      </View>
                      <Feather name={isLinked ? "check-circle" : "circle"} size={18} color={isLinked ? theme.primary : theme.textMuted} />
                    </TouchableOpacity>
                  );
                })}

                {stateHabits.map((habit) => {
                  const isLinked = habit.linkedCollectionIds?.includes(linkingResource.id);
                  return (
                    <TouchableOpacity
                      key={habit.id}
                      onPress={() => {
                        if (onToggleLinkResource) {
                          onToggleLinkResource(habit.id, "habit", linkingResource.id);
                        }
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: isLinked ? theme.primaryLight : theme.cardLight,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Feather name="repeat" size={16} color={theme.primary} />
                        <Text style={{ fontSize: 14, color: theme.text, fontWeight: "600" }} numberOfLines={1}>
                          {habit.title}
                        </Text>
                      </View>
                      <Feather name={isLinked ? "check-circle" : "circle"} size={18} color={isLinked ? theme.primary : theme.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null
        )}
      </AnimatedOverlay>

      {/* Collection Options Modal */}
      <AnimatedOverlay
        visible={!!optionsCollection}
        onClose={() => setOptionsCollection(null)}
        type="center-modal"
      >
        {() => (
          optionsCollection ? (
            <View style={{ gap: 12, padding: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Resource Group Options</Text>
              <TouchableOpacity
                onPress={() => {
                  const coll = optionsCollection;
                  setOptionsCollection(null);
                  Alert.prompt(
                    "Rename Resource Group",
                    "Enter a new name for this resource group:",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Rename",
                        onPress: (newName?: string) => {
                          if (newName && newName.trim()) {
                            renameCollection(coll.id, activeFolderId || "default", newName.trim(), coll.emoji || "📦");
                          }
                        },
                      },
                    ],
                    "plain-text",
                    coll.name
                  );
                }}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  backgroundColor: theme.cardLight,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Feather name="edit-2" size={16} color={theme.text} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>Rename Group</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const coll = optionsCollection;
                  setOptionsCollection(null);
                  Alert.alert(
                    "Delete Resource Group",
                    `Are you sure you want to delete "${coll.name}"? Items inside will be deleted.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => deleteCollection(coll.id, activeFolderId || "default"),
                      },
                    ]
                  );
                }}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  backgroundColor: "#FF3B3020",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Feather name="trash-2" size={16} color="#FF3B30" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#FF3B30" }}>Delete Group</Text>
              </TouchableOpacity>
            </View>
          ) : null
        )}
      </AnimatedOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    gap: 4,
  },
});
