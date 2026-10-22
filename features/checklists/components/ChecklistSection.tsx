import React from "react";
import { View, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { ChecklistProgressCard } from "@/features/checklists/components/ChecklistProgressCard";
import { type Checklist } from "@/shared/types/domain.types";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { SwipeableCard } from "@/shared/components/ui/SwipeableCard";
import { isChecklistCompletedForDate } from "@/shared/utils/domain-selectors";
import { getTodayDateKey } from "@/shared/utils/date-key";
import { getActiveOccurrenceDateKey } from "@/services/scheduling/recurrence.service";

interface ChecklistSectionProps {
  checklists: Checklist[];
  colors: any;
  colorScheme: "light" | "dark" | null;
  allResources?: any[];
  onUpdateChecklist: (updated: Checklist) => void;
  onToggleChecklistItem?: (checklist: Checklist, itemId: string) => void;
  onToggleAllChecklistItems?: (checklist: Checklist) => void;
  onDeleteChecklist: (id: string) => void;
  onDuplicateChecklist?: (chk: Checklist) => void;
  onRenameChecklist?: (chk: Checklist) => void;
  onToggleLinkResource?: (itemId: string, itemType: "checklist", resourceId: string) => void;
}

export const ChecklistSection: React.FC<ChecklistSectionProps> = ({
  checklists,
  colors,
  colorScheme,
  allResources = [],
  onUpdateChecklist,
  onToggleChecklistItem,
  onToggleAllChecklistItems,
  onDeleteChecklist,
  onDuplicateChecklist,
  onRenameChecklist,
  onToggleLinkResource,
}) => {
  const [expandedIds, setExpandedIds] = React.useState<Record<string, boolean>>({});
  const [isInProgressCollapsed, setIsInProgressCollapsed] = React.useState(false);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = React.useState(false);

  // Group checklists into In Progress vs Completed
  // Completed means it has at least one item, and all items are completed.
  const { inProgress, completed } = React.useMemo(() => {
    const ipList: Checklist[] = [];
    const compList: Checklist[] = [];

    checklists.forEach((c) => {
      const referenceDateKey = c.recurrence
        ? getActiveOccurrenceDateKey(c, getTodayDateKey()) ?? getTodayDateKey()
        : getTodayDateKey();
      const isDone = isChecklistCompletedForDate(c, referenceDateKey);
      if (isDone) {
        compList.push(c);
      } else {
        ipList.push(c);
      }
    });

    return { inProgress: ipList, completed: compList };
  }, [checklists]);

  const toggleChecklistAllItems = (chk: Checklist) => {
    if (onToggleAllChecklistItems) {
      onToggleAllChecklistItems(chk);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    // Never silently fall back to master-template mutation for recurring checklists
    if (chk.recurrence) {
      console.warn("Cannot toggle all recurring checklist items without occurrence-aware callback");
      return;
    }
    const occurrenceDateKey = getTodayDateKey();
    const isDone = isChecklistCompletedForDate(chk, occurrenceDateKey);
    const nextItems = chk.items.map((i) => ({
      ...i,
      completed: !isDone,
    }));
    onUpdateChecklist({
      ...chk,
      items: nextItems,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const renderChecklistCard = (chk: Checklist) => {
    const isExpanded = !!expandedIds[chk.id];
    return (
      <SwipeableCard
        key={chk.id}
        onSwipeRight={() => toggleChecklistAllItems(chk)}
        onSwipeLeft={() => {
          Alert.alert(
            "Delete Checklist",
            "Are you sure you want to delete this checklist permanently?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  onDeleteChecklist(chk.id);
                },
              },
            ]
          );
        }}
      >
        <ChecklistProgressCard
          checklist={chk}
          colors={colors}
          colorScheme={colorScheme}
          isExpanded={isExpanded}
          onToggleExpand={() => {
            setExpandedIds((prev) => ({
              ...prev,
              [chk.id]: !isExpanded,
            }));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }}
          onToggleChecklist={() => toggleChecklistAllItems(chk)}
          onToggleChecklistItem={onToggleChecklistItem}
          onToggleAllChecklistItems={onToggleAllChecklistItems}
          onUpdateChecklist={onUpdateChecklist}
          onToggleLinkResource={onToggleLinkResource}
          allResources={allResources}
          onDeleteChecklist={onDeleteChecklist}
          onDuplicateChecklist={onDuplicateChecklist}
          onRenameChecklist={onRenameChecklist}
        />
      </SwipeableCard>
    );
  };

  return (
    <View style={styles.container}>
      {/* IN PROGRESS Section */}
      <View style={styles.section}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsInProgressCollapsed(!isInProgressCollapsed);
          }}
          style={styles.sectionHeaderContainer}
        >
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            IN PROGRESS ({inProgress.length})
          </Text>
          <Feather
            name={isInProgressCollapsed ? "chevron-down" : "chevron-up"}
            size={13}
            color={colors.textMuted}
            style={{ marginRight: 4 }}
          />
        </TouchableOpacity>

        {!isInProgressCollapsed && (
          inProgress.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No active checklists.
            </Text>
          ) : (
            <View style={styles.listGap}>
              {inProgress.map(renderChecklistCard)}
            </View>
          )
        )}
      </View>

      {/* COMPLETED Section */}
      {completed.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setIsCompletedCollapsed(!isCompletedCollapsed);
            }}
            style={styles.sectionHeaderContainer}
          >
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
              COMPLETED ({completed.length})
            </Text>
            <Feather
              name={isCompletedCollapsed ? "chevron-down" : "chevron-up"}
              size={13}
              color={colors.textMuted}
              style={{ marginRight: 4 }}
            />
          </TouchableOpacity>

          {!isCompletedCollapsed && (
            <View style={styles.listGap}>
              {completed.map(renderChecklistCard)}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  section: {
    flexDirection: "column",
    gap: 8,
  },
  sectionHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  sectionHeader: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  listGap: {
    gap: 10,
  },
  emptyText: {
    fontSize: 12.5,
    fontStyle: "italic",
    paddingHorizontal: 4,
  },
});
