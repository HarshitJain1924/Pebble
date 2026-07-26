import React, { useState, useMemo } from "react";
import { View, StyleSheet, TextInput, Image, Alert, Modal, ScrollView, Linking, TouchableOpacity, Platform } from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AnimatedCheckbox } from "@/shared/components/ui/AnimatedCheckbox";
import { type Checklist, type ChecklistItem } from "@/shared/types/domain.types";

interface ChecklistProgressCardProps {
  checklist: Checklist;
  colors: any;
  colorScheme: "light" | "dark" | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleChecklist: () => void; // completes or uncompletes all items
  onUpdateChecklist: (updated: Checklist) => void;
  onToggleLinkResource?: (itemId: string, itemType: "checklist", resourceId: string) => void;
  allResources?: any[];
  onDeleteChecklist?: (id: string) => void;
  onDuplicateChecklist?: (chk: Checklist) => void;
  onRenameChecklist?: (chk: Checklist) => void;
}

export const ChecklistProgressCard: React.FC<ChecklistProgressCardProps> = ({
  checklist,
  colors,
  colorScheme,
  isExpanded,
  onToggleExpand,
  onToggleChecklist,
  onUpdateChecklist,
  onToggleLinkResource,
  allResources = [],
  onDeleteChecklist,
  onDuplicateChecklist,
  onRenameChecklist,
}) => {
  const isLight = colorScheme === "light";
  const router = useRouter();
  const [showLinkSelector, setShowLinkSelector] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [showAllResources, setShowAllResources] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const handleShowOverflowMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMenuVisible(true);
  };

  const handleEditPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push(`/checklist-details?id=${checklist.id}`);
  };

  const completedCount = checklist.items.filter((i) => i.completed).length;
  const totalCount = checklist.items.length;
  const isAllCompleted = totalCount > 0 && completedCount === totalCount;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const linkedResourceIds = checklist.resourceIds || [];
  const linkedCount = linkedResourceIds.length;

  const linkedResources = useMemo(() => {
    return linkedResourceIds
      .map((id: string) => allResources.find((r) => r.id === id))
      .filter(Boolean);
  }, [linkedResourceIds, allResources]);

  const hasHiddenResources = linkedResources.length > 3;
  const displayedResources = useMemo(() => {
    if (hasHiddenResources && !showAllResources) {
      return linkedResources.slice(0, 2);
    }
    return linkedResources;
  }, [linkedResources, hasHiddenResources, showAllResources]);

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {}
  };

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `checklist-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: newItemText.trim(),
      completed: false,
    };
    const updated = {
      ...checklist,
      items: [...checklist.items, newItem],
    };
    onUpdateChecklist(updated);
    setNewItemText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleToggleItem = (itemId: string) => {
    const updated = {
      ...checklist,
      items: checklist.items.map((it) =>
        it.id === itemId ? { ...it, completed: !it.completed } : it
      ),
    };
    onUpdateChecklist(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };



  return (
    <AppCard
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          opacity: isAllCompleted ? 0.6 : 1, // Satisfying opacity fade on completion
        },
      ]}
    >
      {/* Primary Card Header Row aligned with mockup */}
      <View style={styles.cardHeaderRow}>
        <PressableScale onPress={onToggleChecklist} style={styles.cardCheckbox}>
          <Feather
            name={isAllCompleted ? "check-circle" : "circle"}
            size={18}
            color={isAllCompleted ? colors.primary : colors.textMuted}
          />
        </PressableScale>

        <View style={styles.cardMainColumn}>
          <View style={styles.titleRow}>
            <PressableScale onPress={handleEditPress} style={styles.titlePress}>
              <Text
                style={[
                  styles.title,
                  {
                    color: isAllCompleted ? colors.textMuted : colors.text,
                    textDecorationLine: isAllCompleted ? "line-through" : "none",
                  },
                ]}
                numberOfLines={1}
              >
                {checklist.title}
              </Text>
            </PressableScale>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* Trailing Paperclip Resource Button */}
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  if (linkedCount > 0) {
                    onToggleExpand();
                  } else {
                    setShowLinkSelector(true);
                  }
                }}
                style={styles.paperclipBtn}
              >
                {linkedResourceIds.length === 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                    <Feather name="paperclip" size={13} color={colors.textMuted} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted }}>+</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Feather
                      name="paperclip"
                      size={12}
                      color={isExpanded ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: isExpanded ? colors.primary : colors.textMuted,
                      }}
                    >
                      {linkedCount}
                    </Text>
                  </View>
                )}
              </PressableScale>

              {/* Card Contextual Overflow Menu Button */}
              <PressableScale
                onPress={handleShowOverflowMenu}
                style={styles.moreBtn}
              >
                <Feather name="more-horizontal" size={15} color={colors.textMuted} />
              </PressableScale>

              {/* Chevron Expand Button */}
              <PressableScale
                onPress={onToggleExpand}
                style={styles.chevronBtn}
              >
                <Feather
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={colors.textMuted}
                />
              </PressableScale>
            </View>
          </View>

          {/* Flat Progress Bar below the Title */}
          <PressableScale onPress={onToggleExpand} style={styles.progressRowPress}>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)" },
              ]}
            >
              <View
                style={[
                  styles.progressBar,
                  { width: `${progress * 100}%`, backgroundColor: colors.primary },
                ]}
              />
            </View>

            {/* Metrics Row: X of Y completed (left), N left/Completed (right) */}
            <View style={styles.metricsRow}>
              <Text style={[styles.progressText, { color: colors.textMuted }]}>
                {completedCount} of {totalCount} completed
              </Text>
              <Text
                style={[
                  styles.remainingText,
                  {
                    color: isAllCompleted ? colors.primary : colors.textMuted,
                    fontWeight: isAllCompleted ? "700" : "500",
                  },
                ]}
              >
                {isAllCompleted ? "Completed" : `${totalCount - completedCount} left`}
              </Text>
            </View>
          </PressableScale>
        </View>
      </View>

      {/* Expanded Inline Checklist Items and Resources */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {/* Subtle separator line */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Checklist Items List */}
          <View style={styles.checklistItemsWrapper}>
            {checklist.items.map((item) => (
              <View key={item.id} style={styles.checkItemRow}>
                <PressableScale
                  onPress={() => handleToggleItem(item.id)}
                  style={{ flex: 1 }}
                  contentStyle={styles.checkItemLeft}
                >
                  <Feather
                    name={item.completed ? "check-circle" : "circle"}
                    size={16}
                    color={item.completed ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.checkItemTitle,
                      {
                        color: item.completed ? colors.textMuted : colors.text,
                        textDecorationLine: item.completed ? "line-through" : "none",
                      },
                    ]}
                  >
                    {item.title}
                  </Text>
                </PressableScale>
              </View>
            ))}

            {/* Inline Item Addition Row */}
            <View style={styles.addItemRow}>
              <Feather name="plus" size={13} color={colors.textMuted} />
              <TextInput
                value={newItemText}
                onChangeText={setNewItemText}
                placeholder="Add item..."
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={handleAddItem}
                style={[styles.addItemInput, { color: colors.text }]}
              />
            </View>
          </View>

          {/* Linked Resources Section */}
          {linkedResources.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {/* Separator before resources */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.resourcesList}>
                {displayedResources.map((res: any, idx: number) => {
                  const isImage = res.type === "image";
                  const isNote = res.type === "note";
                  const isLink = res.type === "link";
                  const isVideo =
                    isLink &&
                    (res.url?.toLowerCase().includes("youtube") ||
                      res.url?.toLowerCase().includes("video"));

                  return (
                    <View key={res.id}>
                      <PressableScale
                        onPress={() => {
                          if (isLink) {
                            handleOpenUrl(res.url);
                          } else if (isNote) {
                            Alert.alert(res.title, res.content || "No details available.");
                          } else {
                            Alert.alert(res.title, "Image attachment");
                          }
                        }}
                        contentStyle={styles.resourceRow}
                      >
                        {isImage ? (
                          <View
                            style={[
                              styles.thumbnailWrap,
                              { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                            ]}
                          >
                            <Image
                              source={{
                                uri:
                                  res.mediaUri ||
                                  "https://images.unsplash.com/photo-1544005313-94ddf0286df2",
                              }}
                              style={{ width: "100%", height: "100%" }}
                            />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.thumbnailWrap,
                              { backgroundColor: isLight ? "#F1F5F9" : "#27272A" },
                            ]}
                          >
                            <Feather
                              name={isVideo ? "play-circle" : isLink ? "globe" : isNote ? "file-text" : "file"}
                              size={13}
                              color={colors.primary}
                            />
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontSize: 13, fontWeight: "600", color: colors.text }}
                            numberOfLines={1}
                          >
                            {res.title}
                          </Text>
                          {isLink && res.url && (
                            <Text
                              style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}
                              numberOfLines={1}
                            >
                              {res.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0]}
                            </Text>
                          )}
                          {isNote && res.content && (
                            <Text
                              style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}
                              numberOfLines={1}
                            >
                              {res.content.trim().split("\n")[0]}
                            </Text>
                          )}
                        </View>
                      </PressableScale>

                      {idx < displayedResources.length - 1 && (
                        <View style={[styles.innerDivider, { backgroundColor: colors.border + "40" }]} />
                      )}
                    </View>
                  );
                })}

                {/* Show More/Less Gate */}
                {hasHiddenResources && (
                  <PressableScale
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowAllResources(!showAllResources);
                    }}
                    contentStyle={styles.showMoreBtn}
                  >
                    <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "600" }}>
                      {showAllResources ? "Show less" : `Show ${linkedResources.length - 2} more`}
                    </Text>
                  </PressableScale>
                )}
              </View>
            </View>
          )}

          {/* Add Link Resource action row */}
          <PressableScale
            onPress={() => setShowLinkSelector(true)}
            contentStyle={styles.addResourceBtn}
          >
            <Feather name="plus" size={14} color={colors.primary} />
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
              Link Resource
            </Text>
          </PressableScale>
        </View>
      )}

      {/* Resource Link Selector Modal */}
      <Modal
        visible={showLinkSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkSelector(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              width: "90%",
              maxHeight: "70%",
              backgroundColor: colors.card,
              borderRadius: 24,
              borderColor: colors.border,
              borderWidth: 1.5,
              padding: 20,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
              Link Resources
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: -4 }}>
              Select resources to link to this checklist:
            </Text>

            {allResources.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>No resources in this workspace.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
                {allResources.map((res) => {
                  const isLinked = linkedResourceIds.includes(res.id);
                  return (
                    <PressableScale
                      key={res.id}
                      onPress={() => onToggleLinkResource?.(checklist.id, "checklist", res.id)}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isLinked ? colors.primary : colors.border,
                        backgroundColor: isLinked ? `${colors.primary}08` : (isLight ? "#F8FAFC" : "#1E1E24"),
                      }}
                      contentStyle={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 10,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <Feather
                          name={res.type === "link" ? "link-2" : res.type === "image" ? "image" : "file-text"}
                          size={14}
                          color={colors.textMuted}
                        />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                          {res.title}
                        </Text>
                      </View>
                      <Feather
                        name={isLinked ? "check-circle" : "circle"}
                        size={16}
                        color={isLinked ? colors.primary : colors.textMuted}
                      />
                    </PressableScale>
                  );
                })}
              </ScrollView>
            )}

            <PressableScale
              onPress={() => setShowLinkSelector(false)}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Done</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>

      {/* Checklist Option Actions Bottom Sheet */}
      <AnimatedOverlay
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        type="bottom-sheet"
      >
        {(close) => (
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 16,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === "ios" ? 36 : 24,
              borderWidth: 1.5,
              borderColor: colors.border,
            }}
          >
            {/* Header: Title */}
            <View
              style={{
                alignItems: "center",
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border + "40",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "800",
                }}
              >
                {checklist.title}
              </Text>
            </View>

            {/* Menu options list */}
            <View style={{ gap: 4 }}>

              {/* Duplicate Checklist */}
              <TouchableOpacity
                onPress={() => {
                  close();
                  onDuplicateChecklist?.(checklist);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>📄</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Duplicate Checklist
                </Text>
              </TouchableOpacity>

              {/* Archive Checklist */}
              <TouchableOpacity
                onPress={() => {
                  close();
                  setTimeout(() => {
                    Alert.alert(
                      "Archive Checklist",
                      "Are you sure you want to archive this checklist?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Archive",
                          onPress: () => {
                            onUpdateChecklist({ ...checklist, archivedAt: Date.now() });
                          },
                        },
                      ]
                    );
                  }, 300);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>📦</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Archive Checklist
                </Text>
              </TouchableOpacity>

              {/* Delete Checklist (Destructive) */}
              <TouchableOpacity
                onPress={() => {
                  close();
                  setTimeout(() => {
                    Alert.alert(
                      "Delete Checklist",
                      "Are you sure you want to delete this checklist permanently?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            onDeleteChecklist?.(checklist.id);
                          },
                        },
                      ]
                    );
                  }, 300);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>🗑️</Text>
                <Text style={{ color: colors.error, fontSize: 15, fontWeight: "600" }}>
                  Delete Checklist
                </Text>
              </TouchableOpacity>
            </View>

            {/* Separator before Cancel */}
            <View style={{ height: 1.5, backgroundColor: colors.border, marginVertical: 12 }} />

            {/* Cancel option */}
            <TouchableOpacity
              onPress={close}
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: isLight ? "#F1F5F9" : "#27272A",
              }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </AnimatedOverlay>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingLeft: 14,
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 14,
    flexDirection: "column",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardCheckbox: {
    marginTop: 2,
  },
  cardMainColumn: {
    flex: 1,
    flexDirection: "column",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  titlePress: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  paperclipBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  moreBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  chevronBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  progressRowPress: {
    width: "100%",
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
    marginBottom: 6,
    marginRight: 40, // leave room for resource (paperclip) icon
  },
  progressBar: {
    height: "100%",
    borderRadius: 1.5,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  remainingText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    width: "100%",
    marginBottom: 10,
    opacity: 0.5,
  },
  checklistItemsWrapper: {
    paddingLeft: 30,
    gap: 6,
    marginBottom: 4,
  },
  checkItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  checkItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  checkItemTitle: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  addItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    opacity: 0.8,
  },
  addItemInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
    fontWeight: "500",
  },
  resourcesList: {
    paddingLeft: 30,
    gap: 4,
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  thumbnailWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  innerDivider: {
    height: 1,
    width: "100%",
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  addResourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingLeft: 30,
    gap: 6,
    marginTop: 4,
  },
});
