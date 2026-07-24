import React from "react";
import { View, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { ChecklistProgressCard } from "@/features/checklists/components/ChecklistProgressCard";
import { type Checklist } from "@/shared/types/domain.types";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { SwipeableCard } from "@/shared/components/ui/SwipeableCard";

interface ChecklistSectionProps {
  checklists: Checklist[];
  colors: any;
  colorScheme: "light" | "dark" | null;
  allResources?: any[];
  onUpdateChecklist: (updated: Checklist) => void;
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
      const isDone = c.items.length > 0 && c.items.every((i) => i.completed);
      if (isDone) {
        compList.push(c);
      } else {
        ipList.push(c);
      }
    });

    return { inProgress: ipList, completed: compList };
  }, [checklists]);

  const toggleChecklistAllItems = (chk: Checklist) => {
    const isDone = chk.items.length > 0 && chk.items.every((i) => i.completed);
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
