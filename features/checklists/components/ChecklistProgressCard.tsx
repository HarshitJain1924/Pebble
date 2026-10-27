import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Palette } from "@/shared/constants/theme";
import { type Checklist } from "@/shared/types/domain.types";
import {
  getChecklistOccurrenceStats,
} from "@/shared/utils/domain-selectors";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { isRecurringOccurrenceForDate, getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { CATEGORY_OPTIONS } from "@/features/details/options";
import { getChecklistColor } from "../utils/checklist-colors";

export interface ChecklistProgressCardProps {
  checklist: Checklist;
  colors?: any;
  colorScheme?: "light" | "dark" | null;
  /** Date this row represents. Completion reads/writes target this key. */
  selectedDateKey?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onToggleChecklist?: () => void;
  /** Canonical occurrence-aware item toggle (recurring checklists). */
  onToggleChecklistItem?: (
    checklist: Checklist,
    itemId: string,
    referenceDateKey?: string,
  ) => void;
  /** Canonical occurrence-aware bulk toggle (recurring checklists). */
  onToggleAllChecklistItems?: (
    checklist: Checklist,
    referenceDateKey?: string,
  ) => void;
  onUpdateChecklist?: (updated: Checklist) => void;
  onToggleLinkResource?: (itemId: string, itemType: "checklist", resourceId: string) => void;
  allResources?: any[];
  onDeleteChecklist?: (id: string) => void;
  onDuplicateChecklist?: (chk: Checklist) => void;
  onRenameChecklist?: (chk: Checklist) => void;
  workspaceName?: string;
}

const formatTimeDisplay = (timeStr?: string): string => {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMin = String(m).padStart(2, "0");
  return `${displayHour}:${displayMin} ${period}`;
};

export const ChecklistProgressCard: React.FC<ChecklistProgressCardProps> = ({
  checklist,
  colors,
  colorScheme,
  selectedDateKey,
  onUpdateChecklist,
  onDeleteChecklist,
  onDuplicateChecklist,
  workspaceName,
}) => {
  const isLight = colorScheme === "light";
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleShowOverflowMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMenuVisible(true);
  };

  const referenceDateKey = selectedDateKey || getTodayDateKey();
  const occurrenceDateKey =
    checklist.recurrence && isRecurringOccurrenceForDate(checklist, referenceDateKey)
      ? referenceDateKey
      : undefined;

  const handleCardPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const dateParam = occurrenceDateKey ? `&date=${occurrenceDateKey}` : "";
    router.push(`/checklist-details?id=${checklist.id}${dateParam}`);
  };

  const stats = useMemo(
    () =>
      getChecklistOccurrenceStats(
        checklist,
        occurrenceDateKey ?? referenceDateKey,
      ),
    [checklist, occurrenceDateKey, referenceDateKey],
  );
  const completedCount = stats.completedCount;
  const totalCount = stats.total;
  const isAllCompleted = stats.isCompleted;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;
  const progressPercent = Math.round(progress * 100);

  // Priority label
  const priorityLabel = useMemo(() => {
    if (!checklist.priority || checklist.priority === "none") return "Normal";
    return checklist.priority.charAt(0).toUpperCase() + checklist.priority.slice(1);
  }, [checklist.priority]);

  // Category label
  const categoryLabel = useMemo(() => {
    if (!checklist.categoryId) return undefined;
    const meta = CATEGORY_OPTIONS.find((c) => c.key === checklist.categoryId);
    return meta?.label || checklist.categoryId.charAt(0).toUpperCase() + checklist.categoryId.slice(1);
  }, [checklist.categoryId]);

  // Workspace label
  const workspaceLabel = useMemo(() => {
    const raw = workspaceName || "Inbox";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [workspaceName]);

  // Schedule / Timing row text
  const timingText = useMemo(() => {
    if (checklist.schedule?.startTime) {
      const start = formatTimeDisplay(checklist.schedule.startTime);
      if (checklist.schedule.endTime) {
        return `${start} - ${formatTimeDisplay(checklist.schedule.endTime)}`;
      }
      return start;
    }
    if (checklist.recurrence) {
      return getRecurrenceLabel(checklist.recurrence) || "Recurring";
    }
    if (checklist.schedule?.date) {
      return checklist.schedule.date;
    }
    return `${completedCount} of ${totalCount} completed`;
  }, [checklist.schedule, checklist.recurrence, completedCount, totalCount]);

  const cardColor = useMemo(
    () => getChecklistColor(checklist.categoryId),
    [checklist.categoryId],
  );

  return (
    <>
      <PressableScale
        testID={`checklist-card-${checklist.id}`}
        onPress={handleCardPress}
        onLongPress={handleShowOverflowMenu}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Edit checklist ${checklist.title}`}
        style={[styles.cardContainer, { backgroundColor: cardColor }]}
      >
        {/* Top Row: Outline Pills (Priority, Category, Workspace) and Progress Percentage */}
        <View style={styles.topRow}>
          <View style={styles.pillsCluster}>
            <View style={styles.outlinePill}>
              <Text style={styles.pillText}>{priorityLabel}</Text>
            </View>
            {categoryLabel ? (
              <View style={styles.outlinePill}>
                <Text style={styles.pillText}>{categoryLabel}</Text>
              </View>
            ) : null}
            <View style={styles.outlinePill}>
              <Text style={styles.pillText}>{workspaceLabel}</Text>
            </View>
          </View>
          <Text style={styles.progressText}>{progressPercent}%</Text>
        </View>

        {/* Title */}
        <Text
          style={[
            styles.titleText,
            isAllCompleted && styles.titleCompleted,
          ]}
          numberOfLines={2}
        >
          {checklist.title}
        </Text>

        {/* Schedule / Timing Row */}
        <View style={styles.timingRow}>
          <Feather name="clock" size={15} color="rgba(255, 255, 255, 0.9)" />
          <Text style={styles.timingText}>{timingText}</Text>
        </View>
      </PressableScale>

      {/* Overflow / More Options Bottom Sheet */}
      <AnimatedOverlay
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        type="bottom-sheet"
      >
        {(close) => (
          <View
            style={[
              styles.menuSheet,
              {
                backgroundColor: colors?.card || (isLight ? Palette.white : Palette.ink850),
                borderColor: colors?.border || "rgba(255,255,255,0.1)",
              },
            ]}
          >
            <View style={styles.menuHeader}>
              <Text style={[styles.menuTitle, { color: colors?.text || Palette.white }]}>
                {checklist.title}
              </Text>
            </View>

            <View style={styles.menuOptions}>
              {/* Duplicate */}
              <TouchableOpacity
                onPress={() => {
                  close();
                  onDuplicateChecklist?.(checklist);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Duplicate checklist ${checklist.title}`}
                style={styles.menuRow}
              >
                <Feather name="copy" size={18} color={colors?.text || Palette.white} />
                <Text style={[styles.menuRowText, { color: colors?.text || Palette.white }]}>
                  Duplicate Checklist
                </Text>
              </TouchableOpacity>

              {/* Archive */}
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
                            onUpdateChecklist?.({ ...checklist, archivedAt: Date.now() });
                          },
                        },
                      ]
                    );
                  }, 300);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Archive checklist ${checklist.title}`}
                style={styles.menuRow}
              >
                <Feather name="archive" size={18} color={colors?.text || Palette.white} />
                <Text style={[styles.menuRowText, { color: colors?.text || Palette.white }]}>
                  Archive Checklist
                </Text>
              </TouchableOpacity>

              {/* Delete */}
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
                style={styles.menuRow}
              >
                <Feather name="trash-2" size={18} color={colors?.error || "#FF4D4D"} />
                <Text style={[styles.menuRowText, { color: colors?.error || "#FF4D4D" }]}>
                  Delete Checklist
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors?.border || "rgba(255,255,255,0.1)" }]} />

            <TouchableOpacity
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={[
                styles.cancelButton,
                { backgroundColor: isLight ? Palette.slate100 : Palette.zinc800 },
              ]}
            >
              <Text style={[styles.cancelButtonText, { color: colors?.text || Palette.white }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </AnimatedOverlay>
    </>
  );
};

export const ChecklistItem = ChecklistProgressCard;

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#E07A5F",
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pillsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  outlinePill: {
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  progressText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  titleText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: 14,
    marginBottom: 12,
    lineHeight: 26,
  },
  titleCompleted: {
    textDecorationLine: "line-through",
    opacity: 0.8,
  },
  timingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timingText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13.5,
    fontWeight: "500",
  },
  menuSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
  },
  menuHeader: {
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  menuOptions: {
    gap: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: "600",
  },
  menuDivider: {
    height: 1,
    marginVertical: 10,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
