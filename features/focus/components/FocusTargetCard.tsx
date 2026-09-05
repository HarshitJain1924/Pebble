import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AppCard } from "@/shared/components/ui/AppCard";
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

  return (
    <AppCard style={styles.taskCard}>
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={[styles.taskCardTitle, { color: colors.text }]}>
            What are you focusing on?
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            {focusedTaskId
              ? isHabit
                ? "Linked Habit"
                : "Linked Task"
              : "Choose a task or habit for this session"}
          </Text>
        </View>
        {focusedTaskId && (
          <View style={styles.headerActions}>
            <PressableScale
              onPress={onLinkPress}
              haptic
              style={[styles.changeBtn, { backgroundColor: `${colors.primary}15` }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                Change
              </Text>
            </PressableScale>
            <PressableScale
              onPress={onUnlinkPress}
              haptic
              style={styles.unlinkBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            >
              <Feather name="x" size={16} color={colors.textMuted} />
            </PressableScale>
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border || "rgba(255, 255, 255, 0.05)" }]} />

      {focusedTaskId ? (
        <PressableScale
          onPress={onLinkPress}
          haptic
          style={styles.linkedRow}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: isHabit ? "rgba(245, 158, 11, 0.12)" : `${colors.primary}18` },
            ]}
          >
            <Feather
              name={isHabit ? "activity" : "target"}
              size={18}
              color={isHabit ? "#F59E0B" : colors.primary}
            />
          </View>
          <View style={styles.targetInfo}>
            <Text numberOfLines={1} style={[styles.targetTitle, { color: colors.text }]}>
              {title}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "500" }}>
              {isHabit ? "Habit" : "Task"}
            </Text>
          </View>
          {isRecovery && (
            <View style={styles.recoveryBadge}>
              <Text style={styles.recoveryText}>
                💔 RECOVERY ACTIVE (10M)
              </Text>
            </View>
          )}
        </PressableScale>
      ) : (
        <PressableScale
          onPress={onLinkPress}
          haptic
          style={[styles.selectTaskBtn, { borderColor: `${colors.primary}44` }]}
        >
          <Feather name="plus-circle" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
            Choose a task or habit
          </Text>
        </PressableScale>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  taskCard: {
    padding: Spacing.lg,
    gap: 12,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    gap: 2,
    flex: 1,
  },
  taskCardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  unlinkBtn: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  divider: {
    height: 1,
  },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  targetInfo: {
    flex: 1,
    gap: 2,
  },
  targetTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  recoveryBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderWidth: 1,
  },
  recoveryText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#EF4444",
  },
  selectTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    minHeight: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
  },
});
