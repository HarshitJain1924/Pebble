import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors, Palette } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
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
  onPressResources?: (event?: any) => void;
  onLongPressResources?: () => void;
  habit: any;
  onDeleteHabit?: () => void;
  isSelectionMode?: boolean;

  // Resource drawer props passed down to HabitQuickEditSheet
  linkedResources?: any[];
  onPressAddResource?: () => void;
  onPressOpenResource?: (res: any) => void;

  // Deprecated compatibility props (no longer expanded inline)
  isExpanded?: boolean;
  displayedResources?: any[];
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
  onPressResources,
  onLongPressResources,
  habit,
  onDeleteHabit,
  isSelectionMode = false,

  linkedResources = [],
  onPressAddResource,
  onPressOpenResource,
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

  // Celebrate deliberate streak transitions (newly completed habit or streak increase)
  const [isStreakAnimating, setIsStreakAnimating] = useState(false);
  const prevCompletedRef = useRef(completedToday);
  const prevStreakRef = useRef(streak);

  useEffect(() => {
    const newlyCompleted = !prevCompletedRef.current && completedToday;
    const streakIncreased = streak > prevStreakRef.current;

    if (newlyCompleted || streakIncreased) {
      setIsStreakAnimating(true);
      const timer = setTimeout(() => {
        setIsStreakAnimating(false);
      }, 3000);
      return () => clearTimeout(timer);
    }

    prevCompletedRef.current = completedToday;
    prevStreakRef.current = streak;
  }, [completedToday, streak]);

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
        color: colors.textMuted,
      });
    }

    // 3. Linked Resources (compact indicator in metadata; taps open Quick Edit)
    if (linkedCount > 0) {
      parts.push({
        key: "resources",
        text: String(linkedCount),
        icon: resourceIconName,
        onPress: () => {
          Haptics.selectionAsync().catch(() => {});
          setIsQuickEditOpen(true);
          onPressResources?.();
        },
        onLongPress: onLongPressResources,
        accessibilityRole: "button",
        accessibilityLabel: `${linkedCount} resources linked to ${title}. Tap to open in quick edit`,
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
    colors.textMuted,
  ]);

  const handleToggle = useCallback(
    (e?: any) => {
      if (!completedToday) {
        setIsStreakAnimating(true);
        setTimeout(() => {
          setIsStreakAnimating(false);
        }, 3000);
      }
      onPressToggle(e);
    },
    [completedToday, onPressToggle],
  );

  return (
    <EntityItem
      category={categoryPresentation}
      priority={effectivePriority}
      dimmed={completedToday}
      colorScheme={colorScheme}
      testIDPrefix="habit-category"
      style={styles.cardContainer}
      leadingControl={
        <PressableScale
          onPress={handleToggle}
          scaleTo={0.88}
          haptic
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
        </PressableScale>
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
          <StreakFlameBadge streak={streak} animated={isStreakAnimating} />
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
  cardContainer: {},
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
});

