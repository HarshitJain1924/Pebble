import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ProgressRing } from "@/shared/components/ui/ProgressRing";
import PressableScale from "@/shared/components/ui/PressableScale";
import type { TaskPriority } from "@/shared/types/domain.types";
import { HabitQuickEditSheet } from "./HabitQuickEditSheet";
import { StreakFlameBadge } from "./StreakFlameBadge";
import {
  EntityItem,
  EntityMetaRow,
  type EntityMetaPart,
  resolveEntityCategoryPresentation,
  resolveResourceIconName,
} from "@/features/items";

export type HabitStreakCardProps = {
  title: string;
  streak: number;
  bestStreak?: number; // Deprecated: surfaced in Habit Detail screen
  completedToday: boolean;
  priority?: TaskPriority | "low" | "medium" | "high" | "none";
  onPressToggle: (event?: any) => void;
  onCardPress?: () => void;
  linkedCount?: number;
  isExpanded?: boolean;
  onPressResources?: (event?: any) => void;
  onLongPressResources?: () => void;
  habit: any;
  onDeleteHabit?: () => void;
  isSelectionMode?: boolean;

  // Resource drawer props passed from HabitSection
  linkedResources?: any[];
  displayedResources?: any[];
  onPressAddResource?: () => void;
  onPressOpenResource?: (res: any) => void;
  showAllResources?: boolean;
  setShowAllResources?: (show: boolean) => void;
  hasHiddenResources?: boolean;
};

export const HabitStreakCard: React.FC<HabitStreakCardProps> = ({
  title,
  streak,
  completedToday,
  priority,
  onPressToggle,
  onCardPress,
  linkedCount = 0,
  isExpanded = false,
  onPressResources,
  onLongPressResources,
  habit,
  onDeleteHabit,
  isSelectionMode = false,

  linkedResources = [],
  displayedResources = [],
  onPressAddResource,
  onPressOpenResource,
  showAllResources = false,
  setShowAllResources,
  hasHiddenResources = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";
  const isDark = !isLight;

  const amberColor = Palette.amber500;

  // Priority fallback: priority prop or habit?.priority (defaults to medium for habits)
  const effectivePriority = (priority !== undefined ? priority : habit?.priority) ?? "medium";

  // Quick edit sheet state
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);

  // Category atmosphere resolution (subtle background wash + watermark)
  const categoryPresentation = useMemo(() => {
    return resolveEntityCategoryPresentation(
      {
        categoryId: habit?.categoryId,
        title,
        type: "habit",
        priority: effectivePriority,
      },
      isDark,
    );
  }, [habit?.categoryId, title, effectivePriority, isDark]);

  // Primary resource icon derived from first linked resource
  const resourceIconName = useMemo(() => {
    return resolveResourceIconName(linkedResources?.[0]);
  }, [linkedResources]);

  // Build single line supporting metadata.
  //
  // The streak deliberately lives in the trailing slot instead (see
  // `StreakFlameBadge`): it is a consistency value, not a schedule detail, and
  // giving it its own column keeps it prominent without crowding this row.
  const metaParts = useMemo<EntityMetaPart[]>(() => {
    const parts: EntityMetaPart[] = [];

    // 1. Schedule / Recurrence
    let recLabel = "";
    if (habit?.recurrence) {
      recLabel = getRecurrenceLabel(habit.recurrence) ?? "";
    } else {
      recLabel = "Daily";
    }

    if (recLabel) {
      parts.push({
        key: "recurrence",
        text: recLabel.replace(/[↻↻↻]/g, "").trim(),
        icon: "repeat",
      });
    }

    // 2. Reminder
    if (habit?.reminder?.triggerAt) {
      const d = new Date(habit.reminder.triggerAt);
      const ampm = d.getHours() >= 12 ? "PM" : "AM";
      const displayHour =
        d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
      const displayMinute = String(d.getMinutes()).padStart(2, "0");
      parts.push({
        key: "reminder",
        text: `${displayHour}:${displayMinute} ${ampm}`,
        icon: "clock",
        color: isLight ? Palette.gray600 : Palette.zinc300,
      });
    }

    // 3. Linked Resources (compact indicator in metadata)
    if (linkedCount > 0) {
      parts.push({
        key: "resources",
        text: String(linkedCount),
        icon: resourceIconName,
        onPress: onPressResources,
        onLongPress: onLongPressResources,
        accessibilityRole: "button",
        accessibilityLabel: `${linkedCount} resources linked to ${title}. Tap to ${isExpanded ? "collapse" : "expand"}`,
        accessibilityState: { expanded: isExpanded },
        testID: "habit-resource-indicator",
      });
    }

    return parts;
  }, [
    habit?.recurrence,
    habit?.reminder?.triggerAt,
    linkedCount,
    resourceIconName,
    onPressResources,
    onLongPressResources,
    title,
    isExpanded,
    isLight,
  ]);

  return (
    <EntityItem
      category={categoryPresentation}
      priority={effectivePriority}
      dimmed={completedToday}
      colorScheme={colorScheme}
      testIDPrefix="habit-category"
      leadingControl={
        <Pressable
          onPress={onPressToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completedToday }}
          accessibilityLabel={`Mark habit ${title} as ${completedToday ? "incomplete" : "completed"}`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.checkButton}
        >
          <ProgressRing
            progress={completedToday ? 1 : 0}
            size={24}
            strokeWidth={3.5}
            showText={false}
            color={amberColor}
            trackColor={
              isLight ? "rgba(245, 158, 11, 0.18)" : "rgba(245, 158, 11, 0.28)"
            }
          />
          {completedToday && (
            <View style={styles.checkTick}>
              <Feather name="check" size={10} color={Palette.white} />
            </View>
          )}
        </Pressable>
      }
      title={title}
      isCompleted={completedToday}
      onPressContent={onCardPress}
      onLongPressContent={isSelectionMode ? undefined : () => setIsQuickEditOpen(true)}
      contentAccessibilityRole="button"
      contentAccessibilityLabel={`Open habit details: ${title}`}
      metadata={<EntityMetaRow parts={metaParts} dotColor={colors.textMuted} />}
      trailingAreaStyle={styles.trailingArea}
      trailingActions={
        <>
          <StreakFlameBadge streak={streak} />
          {!isSelectionMode ? (
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setIsQuickEditOpen(true);
            }}
            scaleTo={0.9}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            haptic
            accessibilityRole="button"
            accessibilityLabel={`More options for habit ${title}`}
            style={styles.overflowButton}
            testID="habit-overflow-button"
          >
            <Feather name="more-vertical" size={18} color={colors.textMuted} />
          </PressableScale>
          ) : null}
        </>
      }
    >
      {/* Expanded Flat Resource List inside the same card */}
      {isExpanded && linkedResources.length > 0 && (
        <View style={styles.expandedContent}>
          {/* Subtle divider before the resources section */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Flat List (Apple Notes attachment style) */}
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
                  <TouchableOpacity
                    onPress={() => onPressOpenResource?.(res)}
                    accessibilityRole={isLink ? "link" : "button"}
                    accessibilityLabel={`Open resource: ${res.title}`}
                    style={styles.resourceRow}
                  >
                    {/* Icon or Thumbnail */}
                    {isImage ? (
                      <View
                        style={[
                          styles.thumbnailWrap,
                          { backgroundColor: isLight ? Palette.slate100 : Palette.zinc800 },
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
                          { backgroundColor: isLight ? Palette.slate100 : Palette.zinc800 },
                        ]}
                      >
                        <Feather
                          name={
                            isVideo
                              ? "play-circle"
                              : isLink
                                ? "globe"
                                : isNote
                                  ? "file-text"
                                  : "file"
                          }
                          size={13}
                          color={colors.primary}
                        />
                      </View>
                    )}

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
                      {isLink && res.url && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {
                            res.url
                              .replace(/https?:\/\/(www\.)?/, "")
                              .split("/")[0]
                          }
                        </Text>
                      )}
                      {isNote && res.content && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {res.content.trim().split("\n")[0]}
                        </Text>
                      )}
                      {isImage && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 1,
                          }}
                        >
                          Image attachment
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Inner row separator divider */}
                  {idx < displayedResources.length - 1 && (
                    <View
                      style={[
                        styles.innerDivider,
                        { backgroundColor: colors.border + "40" },
                      ]}
                    />
                  )}
                </View>
              );
            })}

            {/* Show More / Less Gate */}
            {hasHiddenResources && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  setShowAllResources?.(!showAllResources);
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  showAllResources
                    ? "Show fewer resources"
                    : `Show ${linkedResources.length - 2} more resources`
                }
                style={styles.showMoreBtn}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    fontWeight: "600",
                  }}
                >
                  {showAllResources
                    ? "Show less"
                    : `Show ${linkedResources.length - 2} more`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Flat Link Resource Action button (no dashed border) */}
            <TouchableOpacity
              onPress={onPressAddResource}
              accessibilityRole="button"
              accessibilityLabel={`Link resource to ${title}`}
              style={styles.addResourceBtn}
            >
              <Feather name="plus" size={14} color={colors.primary} />
              <Text
                style={{
                  fontSize: 12,
                  color: colors.primary,
                  fontWeight: "600",
                }}
              >
                Link Resource
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Habit Quick Edit Sheet */}
      <HabitQuickEditSheet
        visible={isQuickEditOpen}
        onClose={() => setIsQuickEditOpen(false)}
        habit={habit}
        completedToday={completedToday}
        onToggleComplete={onPressToggle}
        onDeleteHabit={onDeleteHabit}
        onOpenFullDetails={onCardPress}
        linkedResources={linkedResources}
        totalResources={linkedCount}
        onOpenResource={onPressOpenResource}
        onAddResource={onPressAddResource}
        colorScheme={colorScheme}
      />
    </EntityItem>
  );
};

export const HabitItem = HabitStreakCard;

const styles = StyleSheet.create({
  trailingArea: {
    // Keeps the informational streak badge clear of the overflow button's
    // expanded hit target while preserving that target's full size.
    gap: 6,
    alignItems: "center",
  },
  overflowButton: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  checkButton: {
    position: "relative",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  checkTick: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Palette.amber500,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedContent: {
    marginTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 14,
  },
  divider: {
    height: 1,
    width: "100%",
    marginBottom: 12,
    opacity: 0.5,
  },
  resourcesList: {
    paddingLeft: 36, // Align neatly with content text offset
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
    paddingVertical: 10,
    gap: 6,
  },
});
