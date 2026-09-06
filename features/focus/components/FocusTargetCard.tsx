import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Spacing } from "@/shared/constants/spacing";

interface FocusTargetCardProps {
  focusedTaskId: string | null;
  todoList: any[];
  habitList: any[];
  onLinkPress: () => void;
  onUnlinkPress: () => void;
  colors: any;
}

export const FocusTargetCard: React.FC<FocusTargetCardProps> = ({
  focusedTaskId,
  todoList,
  habitList,
  onLinkPress,
  onUnlinkPress,
  colors,
}) => {
  const linkedTask = focusedTaskId ? todoList.find((t) => t.id === focusedTaskId) : null;
  const linkedHabit = focusedTaskId ? habitList.find((h) => h.id === focusedTaskId) : null;

  const isHabit = !!linkedHabit;
  const title = linkedTask ? linkedTask.title : (linkedHabit ? linkedHabit.title : "Selected Target");
  const isRecovery = isHabit && !!linkedHabit.previousStreak && linkedHabit.previousStreak > 0;

  if (!focusedTaskId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>
          What are you focusing on?
        </Text>
        <PressableScale
          onPress={onLinkPress}
          haptic
          style={[
            styles.selectTargetBtn,
            {
              backgroundColor: `${colors.primary}0D`,
              borderColor: `${colors.primary}33`,
            },
          ]}
        >
          <Feather name="plus-circle" size={15} color={colors.primary} />
          <Text style={[styles.selectTargetText, { color: colors.primary }]}>
            Choose a task or habit
          </Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.targetContainer}>
      <View style={styles.targetHeaderRow}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          Focus target
        </Text>
        <View style={styles.targetActions}>
          <PressableScale
            onPress={onLinkPress}
            haptic
            style={[styles.changeBtn, { backgroundColor: `${colors.primary}14` }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          >
            <Text style={[styles.changeBtnText, { color: colors.primary }]}>
              Change
            </Text>
          </PressableScale>
          <PressableScale
            onPress={onUnlinkPress}
            haptic
            style={styles.unlinkBtn}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Feather name="x" size={15} color={colors.textMuted} />
          </PressableScale>
        </View>
      </View>

      <PressableScale
        onPress={onLinkPress}
        haptic
        style={styles.targetDetailRow}
      >
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: isHabit ? "rgba(245, 158, 11, 0.12)" : `${colors.primary}16` },
          ]}
        >
          <Feather
            name={isHabit ? "activity" : "target"}
            size={16}
            color={isHabit ? "#F59E0B" : colors.primary}
          />
        </View>

        <View style={styles.titleInfo}>
          <Text numberOfLines={1} style={[styles.targetTitle, { color: colors.text }]}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.typeLabel, { color: colors.textMuted }]}>
              {isHabit ? "Habit" : "Task"}
            </Text>
            {isRecovery && (
              <View style={styles.recoveryBadge}>
                <Text style={styles.recoveryText}>💔 RECOVERY ACTIVE (10M)</Text>
              </View>
            )}
          </View>
        </View>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    width: "100%",
    gap: 8,
    alignItems: "center",
    paddingVertical: 2,
  },
  emptyLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  selectTargetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    width: "100%",
    minHeight: 36,
  },
  selectTargetText: {
    fontSize: 12,
    fontWeight: "600",
  },
  targetContainer: {
    width: "100%",
    gap: 4,
    paddingVertical: 0,
  },
  targetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  targetActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 24,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  unlinkBtn: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 24,
  },
  targetDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  titleInfo: {
    flex: 1,
    gap: 2,
  },
  targetTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  recoveryBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderWidth: 1,
  },
  recoveryText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#EF4444",
  },
});
