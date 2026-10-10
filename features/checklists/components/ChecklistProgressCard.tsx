import React, { useState, useMemo } from "react";
import { Palette } from "@/shared/constants/theme";
import {
  View,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";
import { ROW_SPEC } from "@/shared/constants/rowSpec";
import {
  EntityItem,
  EntityMetaRow,
  type EntityMetaPart,
  resolveEntityCategoryPresentation,
  resolveResourceIconName,
} from "@/features/items";
import { type Checklist } from "@/shared/types/domain.types";
import { getNextIncompleteChecklistItem } from "@/shared/utils/domain-selectors";

export interface ChecklistProgressCardProps {
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
  const isDark = !isLight;
  const router = useRouter();
  const [showLinkSelector, setShowLinkSelector] = useState(false);
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

  // Derive first incomplete item for collapsed preview
  const firstIncompleteItem = useMemo(() => {
    return getNextIncompleteChecklistItem(checklist);
  }, [checklist]);

  const linkedResourceIds = checklist.resourceIds || [];
  const linkedCount = linkedResourceIds.length;

  const linkedResources = useMemo(() => {
    return linkedResourceIds
      .map((id: string) => allResources.find((r) => r.id === id))
      .filter(Boolean);
  }, [linkedResourceIds, allResources]);

  const handleToggleItem = (itemId: string) => {
    const updated = {
      ...checklist,
      items: checklist.items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              completed: !it.completed,
              completedAt: !it.completed ? Date.now() : undefined,
            }
          : it
      ),
    };
    onUpdateChecklist(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Primary resource icon derived from first linked resource
  const resourceIconName = useMemo(() => {
    return resolveResourceIconName(linkedResources?.[0]);
  }, [linkedResources]);

  const checklistMetaParts = useMemo<EntityMetaPart[]>(() => {
    const parts: EntityMetaPart[] = [
      {
        key: "progress",
        text: `${completedCount} of ${totalCount} completed`,
        color: colors.textMuted,
        textStyle: styles.progressText,
        onPress: onToggleExpand,
        accessibilityRole: "button",
        accessibilityLabel: `${completedCount} of ${totalCount} completed`,
      },
      {
        key: "remaining",
        text: isAllCompleted ? "Completed" : `${totalCount - completedCount} left`,
        color: isAllCompleted ? colors.primary : colors.textMuted,
        isBold: isAllCompleted,
        textStyle: styles.remainingText,
        onPress: onToggleExpand,
        accessibilityRole: "button",
      },
    ];

    if (linkedCount > 0) {
      parts.push({
        key: "resources",
        text: String(linkedCount),
        icon: resourceIconName,
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setShowLinkSelector(true);
        },
        accessibilityRole: "button",
        accessibilityLabel: `${linkedCount} resources linked to ${checklist.title}. Tap to manage linked resources`,
        testID: "checklist-resource-indicator",
      });
    }

    return parts;
  }, [
    completedCount,
    totalCount,
    isAllCompleted,
    linkedCount,
    resourceIconName,
    checklist.title,
    colors.textMuted,
    colors.primary,
    onToggleExpand,
  ]);

  // Category atmosphere resolution (small inline icon before title)
  const categoryPresentation = useMemo(() => {
    return resolveEntityCategoryPresentation(
      {
        categoryId: checklist?.categoryId,
        title: checklist.title,
        type: "checklist",
      },
      isDark,
    );
  }, [checklist?.categoryId, checklist.title, isDark]);

  return (
    <EntityItem
      priority={checklist.priority}
      category={categoryPresentation}
      dimmed={isAllCompleted}
      colorScheme={colorScheme}
      testIDPrefix="checklist-category"
      alignLeading="flex-start"
      leadingControl={
        <PressableScale
          onPress={onToggleChecklist}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAllCompleted }}
          accessibilityLabel={`Mark all items in checklist ${checklist.title} as ${isAllCompleted ? "incomplete" : "completed"}`}
          style={styles.cardCheckbox}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
        >
          <Feather
            name={isAllCompleted ? "check-circle" : "circle"}
            size={18}
            color={isAllCompleted ? colors.primary : colors.textMuted}
          />
        </PressableScale>
      }
      title={
        <PressableScale
          onPress={handleEditPress}
          accessibilityRole="button"
          accessibilityLabel={`Edit checklist ${checklist.title}`}
          style={styles.titlePress}
        >
          <Text
            style={[
              styles.title,
              {
                fontSize: ROW_SPEC.type.title,
                fontWeight: ROW_SPEC.type.titleWeight,
                color: isAllCompleted ? colors.textMuted : colors.text,
                textDecorationLine: isAllCompleted ? "line-through" : "none",
              },
            ]}
            numberOfLines={1}
          >
            {checklist.title}
          </Text>
        </PressableScale>
      }
      metadata={
        <View style={styles.progressRowPress}>
          <PressableScale
            onPress={onToggleExpand}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            accessibilityLabel={`Checklist progress: ${completedCount} of ${totalCount} completed. Tap to ${isExpanded ? "collapse" : "expand"}`}
          >
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
          </PressableScale>

          <EntityMetaRow
            parts={checklistMetaParts}
            dotColor={colors.textMuted}
            style={styles.metricsMetaRow}
          />
        </View>
      }
      centerContent={
        !isExpanded && firstIncompleteItem ? (
          <View testID={`checklist-collapsed-preview-${checklist.id}`} style={styles.previewContainer}>
            <PressableScale
              testID={`checklist-preview-checkbox-${firstIncompleteItem.id}`}
              onPress={() => handleToggleItem(firstIncompleteItem.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`Mark ${firstIncompleteItem.title} as completed`}
              style={styles.previewCheckbox}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="circle" size={15} color={colors.textMuted} />
            </PressableScale>
            <PressableScale
              testID={`checklist-preview-title-${firstIncompleteItem.id}`}
              onPress={onToggleExpand}
              accessibilityRole="button"
              accessibilityLabel={`Expand checklist ${checklist.title}`}
              style={styles.previewTextPress}
            >
              <Text
                style={[styles.previewText, { color: colors.text }]}
                numberOfLines={1}
              >
                {firstIncompleteItem.title}
              </Text>
            </PressableScale>
          </View>
        ) : null
      }
      trailingActions={
        <View style={styles.actionsCluster}>
          {/* Card Contextual Overflow Menu Button */}
          <PressableScale
            onPress={handleShowOverflowMenu}
            accessibilityRole="button"
            accessibilityLabel={`More options for checklist ${checklist.title}`}
            style={styles.moreBtn}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Feather name="more-horizontal" size={15} color={colors.textMuted} />
          </PressableScale>

          {/* Chevron Expand Button */}
          <PressableScale
            onPress={onToggleExpand}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            accessibilityLabel={
              isExpanded
                ? `Collapse checklist ${checklist.title}`
                : `Expand checklist ${checklist.title}`
            }
            style={styles.chevronBtn}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Feather
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={15}
              color={colors.textMuted}
            />
          </PressableScale>
        </View>
      }
    >
      {/* Expanded State: Checklist Items List */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {/* Subtle separator line */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Checklist Items List */}
          <View style={styles.checklistItemsWrapper}>
            {checklist.items.map((item) => (
              <View key={item.id} testID={`checklist-item-${item.id}`} style={styles.checkItemRow}>
                <PressableScale
                  onPress={() => handleToggleItem(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.completed }}
                  accessibilityLabel={`Mark ${item.title} as ${item.completed ? "incomplete" : "completed"}`}
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
          </View>
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
                        backgroundColor: isLinked ? `${colors.primary}08` : (isLight ? Palette.slate50 : Palette.ink850),
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
              <Text style={{ color: Palette.white, fontWeight: "700", fontSize: 13 }}>Done</Text>
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
                accessibilityRole="button"
                accessibilityLabel={`Duplicate checklist ${checklist.title}`}
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
                accessibilityRole="button"
                accessibilityLabel={`Archive checklist ${checklist.title}`}
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
                accessibilityRole="button"
                accessibilityLabel={`Delete checklist ${checklist.title}`}
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
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: isLight ? Palette.slate100 : Palette.zinc800,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </AnimatedOverlay>
    </EntityItem>
  );
};

export const ChecklistItem = ChecklistProgressCard;

const styles = StyleSheet.create({
  cardCheckbox: {
    marginTop: 2,
  },
  titlePress: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  actionsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  moreBtn: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronBtn: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRowPress: {
    width: "100%",
    marginTop: 4,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBar: {
    height: "100%",
    borderRadius: 1.5,
  },
  metricsMetaRow: {
    marginTop: 2,
  },
  progressText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  remainingText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  previewCheckbox: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  previewTextPress: {
    flex: 1,
  },
  previewText: {
    fontSize: 13,
    fontWeight: "500",
  },
  expandedContent: {
    marginTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 14,
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
});
