import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  Modal,
  Image
} from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { SwipeableCard } from "@/components/SwipeableCard";
import { AppCard } from "@/components/AppCard";
import { type Collection, type CollectionItem, type TaskList } from "../types";

interface VaultSectionProps {
  collections: Record<string, Collection[]>;
  lists: TaskList[];
  createCollection: (workspaceId: string, name: string, emoji: string) => Promise<void>;
  deleteCollection: (id: string, workspaceId: string) => Promise<void>;
  renameCollection: (id: string, workspaceId: string, name: string, emoji: string) => Promise<void>;
  addCollectionItem: (workspaceId: string, collectionId: string, item: any) => Promise<void>;
  deleteCollectionItem: (itemId: string, collectionId: string, workspaceId: string) => Promise<void>;
  toggleArchiveCollectionItem: (itemId: string, collectionId: string, workspaceId: string) => Promise<void>;
  convertCollectionItemToTask: (item: any) => Promise<void>;
  searchQuery: string;
  activeFolderId: string;
}

export function VaultSection({
  collections,
  lists,
  createCollection,
  deleteCollection,
  renameCollection,
  addCollectionItem,
  deleteCollectionItem,
  toggleArchiveCollectionItem,
  convertCollectionItemToTask,
  searchQuery,
  activeFolderId
}: VaultSectionProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  // Local UX state
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Form states for creating a new collection
  const [isCreatingColl, setIsCreatingColl] = useState<boolean>(false);
  const [newCollName, setNewCollName] = useState<string>("");
  const [newCollEmoji, setNewCollEmoji] = useState<string>("📁");

  // Form states for inline adding an item
  const [addingItemToCollId, setAddingItemToCollId] = useState<string | null>(null);
  const [newItemType, setNewItemType] = useState<"link" | "note" | "image">("note");
  const [newItemTitle, setNewItemTitle] = useState<string>("");
  const [newItemUrl, setNewItemUrl] = useState<string>("");
  const [newItemContent, setNewItemContent] = useState<string>("");

  // Image preview lightbox state
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // Toggle expanded accordion
  const toggleExpanded = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter collections and their items
  const filteredCollections = useMemo(() => {
    const list = collections[activeFolderId] || [];
    let result = list;

    // Filter out archived collections if not showing archived
    if (!showArchived) {
      result = result.filter((c) => !c.archived);
    }

    // Filter by search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.map((coll) => {
        // Match collection title or nested items
        const isCollMatch = coll.name.toLowerCase().includes(q);
        const matchedItems = coll.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.content?.toLowerCase().includes(q) ||
            item.url?.toLowerCase().includes(q)
        );

        if (isCollMatch || matchedItems.length > 0) {
          return {
            ...coll,
            items: matchedItems
          };
        }
        return null;
      }).filter(Boolean) as Collection[];
    }

    // Filter archived nested items if not showing archived
    result = result.map((coll) => ({
      ...coll,
      items: coll.items.filter((item) => (showArchived ? true : !item.archived))
    }));

    // Sort by newest first
    return [...result].sort((a, b) => b.createdAt - a.createdAt);
  }, [collections, activeFolderId, searchQuery, showArchived]);

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch (e) {
      Alert.alert("Error", `Could not open link: ${formattedUrl}`);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollName.trim()) return;
    await createCollection(activeFolderId, newCollName.trim(), newCollEmoji);
    setNewCollName("");
    setNewCollEmoji("📁");
    setIsCreatingColl(false);
  };

  const handleAddItem = async (collectionId: string) => {
    if (!newItemTitle.trim()) return;
    const itemData: any = {
      type: newItemType,
      title: newItemTitle.trim(),
      content: newItemContent.trim() || undefined,
      url: newItemType === "link" ? newItemUrl.trim() : undefined,
    };
    await addCollectionItem(activeFolderId, collectionId, itemData);
    setNewItemTitle("");
    setNewItemUrl("");
    setNewItemContent("");
    setAddingItemToCollId(null);
  };

  const activeParchmentBg = isLight
    ? "rgba(253, 251, 242, 0.98)"
    : "rgba(30, 29, 27, 0.98)";

  const activeBorder = isLight
    ? "rgba(217, 119, 6, 0.15)"
    : "rgba(245, 158, 11, 0.15)";

  return (
    <View style={styles.flex}>
      {/* Utility Headers */}
      <View style={styles.utilityRow}>
        <Text style={[styles.countText, { color: theme.textMuted }]}>
          {filteredCollections.length} Collection{filteredCollections.length !== 1 ? "s" : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => setShowArchived(!showArchived)}
            style={styles.archiveToggle}
          >
            <Feather
              name={showArchived ? "eye" : "eye-off"}
              size={13}
              color={theme.textMuted}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.archiveToggleText, { color: theme.textMuted }]}>
              {showArchived ? "Hide Archived" : "Show Archived"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Inline Create Collection Panel */}
      {isCreatingColl ? (
        <AppCard style={[styles.creatorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.creatorTitle, { color: theme.text }]}>New Knowledge Collection</Text>
          <View style={styles.creatorInputRow}>
            <TouchableOpacity
              onPress={() => {
                // Cycle emojis for simplicity
                const emojis = ["📁", "📚", "🎨", "💡", "🛠️", "🎯", "📝", "🍿", "🍕", "💻"];
                const nextIdx = (emojis.indexOf(newCollEmoji) + 1) % emojis.length;
                setNewCollEmoji(emojis[nextIdx]);
              }}
              style={[styles.emojiPicker, { backgroundColor: isLight ? "#F1F5F9" : "#27272A" }]}
            >
              <Text style={{ fontSize: 20 }}>{newCollEmoji}</Text>
            </TouchableOpacity>
            <TextInput
              value={newCollName}
              onChangeText={setNewCollName}
              placeholder="e.g. DBMS Notes, UI Inspiration"
              placeholderTextColor={theme.textMuted}
              style={[styles.creatorInput, { color: theme.text, borderColor: theme.border }]}
              maxLength={30}
              onSubmitEditing={handleCreateCollection}
            />
          </View>
          <View style={styles.creatorActions}>
            <TouchableOpacity
              onPress={() => setIsCreatingColl(false)}
              style={[styles.smallBtn, { borderColor: theme.border, borderWidth: 1 }]}
            >
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreateCollection}
              style={[styles.smallBtn, { backgroundColor: theme.primary }]}
              disabled={!newCollName.trim()}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>Create</Text>
            </TouchableOpacity>
          </View>
        </AppCard>
      ) : (
        <TouchableOpacity
          onPress={() => setIsCreatingColl(true)}
          style={[styles.addCollBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <Feather name="plus-circle" size={16} color={theme.primary} />
          <Text style={[styles.addCollText, { color: theme.primary }]}>Create Collection</Text>
        </TouchableOpacity>
      )}

      {/* Collections Accordion Grid */}
      {filteredCollections.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <Feather name="folder-minus" size={48} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No collections found
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            Create a collection to group links, notes, and visual inspirations.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ gap: 12, paddingBottom: 150, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredCollections.map((coll) => {
            const isExpanded = expandedIds.has(coll.id);
            const itemsList = coll.items || [];
            
            // Count items by type
            const linkCount = itemsList.filter((i) => i.type === "link").length;
            const noteCount = itemsList.filter((i) => i.type === "note").length;
            const imageCount = itemsList.filter((i) => i.type === "image").length;

            return (
              <View key={coll.id}>
                <AppCard
                  style={[
                    styles.card,
                    {
                      backgroundColor: activeParchmentBg,
                      borderColor: activeBorder,
                      borderWidth: 1.5,
                      opacity: coll.archived ? 0.6 : 1
                    }
                  ]}
                >
                  {/* Collapsed Header Clickable */}
                  <TouchableOpacity
                    onPress={() => toggleExpanded(coll.id)}
                    activeOpacity={0.7}
                    style={styles.cardHeaderRow}
                  >
                    <View style={styles.cardInfoCol}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 20 }}>{coll.emoji}</Text>
                        <Text style={[styles.collName, { color: theme.text }]}>{coll.name}</Text>
                      </View>
                      <Text style={[styles.collCounts, { color: theme.textMuted }]}>
                        {linkCount} link{linkCount !== 1 ? "s" : ""} • {noteCount} note{noteCount !== 1 ? "s" : ""} • {imageCount} image{imageCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      {isExpanded && (
                        <>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.prompt(
                                "Rename Collection",
                                "Enter new name for the collection:",
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Rename",
                                    onPress: (newName?: string) => {
                                      if (newName?.trim()) {
                                        renameCollection(coll.id, activeFolderId, newName.trim(), coll.emoji);
                                      }
                                    }
                                  }
                                ],
                                "plain-text",
                                coll.name
                              );
                            }}
                            style={{ padding: 4 }}
                          >
                            <Feather name="edit-2" size={14} color={theme.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                "Delete Collection",
                                `Are you sure you want to delete "${coll.name}"? All items inside will be deleted.`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Delete",
                                    style: "destructive",
                                    onPress: () => deleteCollection(coll.id, activeFolderId)
                                  }
                                ]
                              );
                            }}
                            style={{ padding: 4 }}
                          >
                            <Feather name="trash-2" size={14} color={theme.textMuted} />
                          </TouchableOpacity>
                        </>
                      )}
                      <Feather
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={theme.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Items View */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <View style={styles.divider} />

                      {/* Items List */}
                      {itemsList.length === 0 ? (
                        <Text style={[styles.emptyItemsText, { color: theme.textMuted }]}>
                          This collection is empty. Add links, notes, or images below!
                        </Text>
                      ) : (
                        <View style={{ gap: 10, marginVertical: 8 }}>
                          {itemsList.map((item) => {
                            const badgeColor =
                              item.type === "link"
                                ? "rgba(59, 130, 246, 0.08)"
                                : item.type === "image"
                                ? "rgba(245, 158, 11, 0.08)"
                                : "rgba(16, 185, 129, 0.08)";
                            const textColor =
                              item.type === "link"
                                ? theme.primary
                                : item.type === "image"
                                ? "#F59E0B"
                                : "#10B981";
                            const itemIcon =
                              item.type === "link"
                                ? "link"
                                : item.type === "image"
                                ? "image"
                                : "file-text";

                            return (
                              <View
                                key={item.id}
                                style={[
                                  styles.itemRow,
                                  {
                                    backgroundColor: isLight ? "#FCFBF8" : "#1A1917",
                                    borderColor: theme.border,
                                    borderWidth: 1,
                                    opacity: item.archived ? 0.5 : 1
                                  }
                                ]}
                              >
                                <View style={styles.itemHeader}>
                                  <View style={[styles.itemBadge, { backgroundColor: badgeColor }]}>
                                    <Feather name={itemIcon as any} size={10} color={textColor} style={{ marginRight: 4 }} />
                                    <Text style={[styles.itemBadgeText, { color: textColor }]}>
                                      {item.type.toUpperCase()}
                                    </Text>
                                  </View>
                                  
                                  {/* Item Actions */}
                                  <View style={styles.itemActions}>
                                    <TouchableOpacity
                                      onPress={() => convertCollectionItemToTask(item)}
                                      style={styles.itemActionIcon}
                                      hitSlop={8}
                                    >
                                      <Feather name="plus-circle" size={13} color={theme.textMuted} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => toggleArchiveCollectionItem(item.id, coll.id, activeFolderId)}
                                      style={styles.itemActionIcon}
                                      hitSlop={8}
                                    >
                                      <Feather name="archive" size={13} color={item.archived ? theme.primary : theme.textMuted} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => deleteCollectionItem(item.id, coll.id, activeFolderId)}
                                      style={styles.itemActionIcon}
                                      hitSlop={8}
                                    >
                                      <Feather name="trash-2" size={13} color={theme.textMuted} />
                                    </TouchableOpacity>
                                  </View>
                                </View>

                                <Text style={[styles.itemTitle, { color: theme.text }]}>{item.title}</Text>
                                
                                {item.content && (
                                  <Text style={[styles.itemContent, { color: theme.textMuted }]}>{item.content}</Text>
                                )}

                                {item.type === "link" && item.url && (
                                  <TouchableOpacity
                                    onPress={() => handleOpenUrl(item.url)}
                                    style={[styles.itemLinkChip, { backgroundColor: isLight ? "#EFF6FF" : "#1E293B" }]}
                                  >
                                    <Feather name="external-link" size={11} color="#3B82F6" />
                                    <Text style={styles.itemLinkText} numberOfLines={1}>{item.url}</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      <View style={styles.divider} />

                      {/* Add Item Form inside Collection */}
                      {addingItemToCollId === coll.id ? (
                        <View style={styles.itemFormContainer}>
                          <Text style={[styles.formSubTitle, { color: theme.text }]}>Add Reference</Text>
                          
                          {/* Type Selectors */}
                          <View style={styles.typeSelectorRow}>
                            {(["note", "link", "image"] as const).map((t) => (
                              <TouchableOpacity
                                key={t}
                                onPress={() => setNewItemType(t)}
                                style={[
                                  styles.typeSelectorPill,
                                  {
                                    backgroundColor: newItemType === t ? theme.primary : (isLight ? "#F1F5F9" : "#27272A")
                                  }
                                ]}
                              >
                                <Text
                                  style={{
                                    color: newItemType === t ? "#FFFFFF" : theme.text,
                                    fontSize: 11,
                                    fontWeight: "700"
                                  }}
                                >
                                  {t === "note" ? "📝 Note" : t === "link" ? "🔗 Link" : "🖼️ Image"}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <TextInput
                            value={newItemTitle}
                            onChangeText={setNewItemTitle}
                            placeholder="Title or summary"
                            placeholderTextColor={theme.textMuted}
                            style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                          />

                          {newItemType === "link" && (
                            <TextInput
                              value={newItemUrl}
                              onChangeText={setNewItemUrl}
                              placeholder="URL (e.g. google.com)"
                              placeholderTextColor={theme.textMuted}
                              style={[styles.formInput, { color: theme.text, borderColor: theme.border }]}
                              keyboardType="url"
                              autoCapitalize="none"
                            />
                          )}

                          <TextInput
                            value={newItemContent}
                            onChangeText={setNewItemContent}
                            placeholder="Details or description (optional)"
                            placeholderTextColor={theme.textMuted}
                            style={[styles.formInput, { color: theme.text, borderColor: theme.border, height: 60 }]}
                            multiline
                          />

                          <View style={styles.formActions}>
                            <TouchableOpacity
                              onPress={() => setAddingItemToCollId(null)}
                              style={[styles.smallBtn, { borderColor: theme.border, borderWidth: 1 }]}
                            >
                              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "700" }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleAddItem(coll.id)}
                              style={[styles.smallBtn, { backgroundColor: theme.primary }]}
                              disabled={!newItemTitle.trim()}
                            >
                              <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>Add</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            setNewItemType("note");
                            setNewItemTitle("");
                            setNewItemUrl("");
                            setNewItemContent("");
                            setAddingItemToCollId(coll.id);
                          }}
                          style={styles.addItemTrigger}
                        >
                          <Feather name="plus" size={13} color={theme.textMuted} />
                          <Text style={[styles.addItemTriggerText, { color: theme.textMuted }]}>Add Reference Row</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </AppCard>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Lightbox / Modal for Image Preview */}
      <Modal visible={!!previewImageUri} transparent animationType="fade">
        <View style={styles.lightboxContainer}>
          <TouchableOpacity
            onPress={() => setPreviewImageUri(null)}
            style={styles.closeLightboxBtn}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUri && (
            <Image
              source={{ uri: previewImageUri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  utilityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4
  },
  countText: {
    fontSize: 12,
    fontWeight: "600"
  },
  archiveToggle: {
    flexDirection: "row",
    alignItems: "center"
  },
  archiveToggleText: {
    fontSize: 12,
    fontWeight: "600"
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 8
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16
  },
  card: {
    padding: 16,
    borderRadius: 20,
    marginBottom: 6,
    overflow: "hidden"
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardInfoCol: {
    flex: 1,
    gap: 2
  },
  collName: {
    fontSize: 15,
    fontWeight: "800"
  },
  collCounts: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 28
  },
  expandedContent: {
    marginTop: 12,
    gap: 8
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    marginVertical: 4
  },
  emptyItemsText: {
    fontSize: 11,
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 12
  },
  itemRow: {
    padding: 10,
    borderRadius: 14,
    gap: 4
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  itemBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  itemBadgeText: {
    fontSize: 8,
    fontWeight: "800"
  },
  itemActions: {
    flexDirection: "row",
    gap: 10
  },
  itemActionIcon: {
    padding: 2
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "800"
  },
  itemContent: {
    fontSize: 11,
    lineHeight: 14
  },
  itemLinkChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    gap: 4,
    maxWidth: "100%"
  },
  itemLinkText: {
    fontSize: 10,
    color: "#3B82F6",
    fontWeight: "600"
  },
  addItemTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: 12
  },
  addItemTriggerText: {
    fontSize: 11,
    fontWeight: "700"
  },
  addCollBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    gap: 6,
    marginVertical: 6
  },
  addCollText: {
    fontSize: 13,
    fontWeight: "800"
  },
  creatorCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginVertical: 6
  },
  creatorTitle: {
    fontSize: 13,
    fontWeight: "800"
  },
  creatorInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  emojiPicker: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  creatorInput: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderRadius: 12
  },
  creatorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  itemFormContainer: {
    gap: 8,
    paddingVertical: 4
  },
  formSubTitle: {
    fontSize: 12,
    fontWeight: "800"
  },
  typeSelectorRow: {
    flexDirection: "row",
    gap: 6
  },
  typeSelectorPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  formInput: {
    fontSize: 12,
    paddingHorizontal: 10,
    height: 34,
    borderWidth: 1,
    borderRadius: 8
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  lightboxContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center"
  },
  lightboxImage: {
    width: "90%",
    height: "80%"
  },
  closeLightboxBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    padding: 10
  }
});
