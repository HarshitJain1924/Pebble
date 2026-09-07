import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
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
  const colorScheme = useColorScheme() ?? "dark";
  const isDark = colorScheme !== "light";

  const linkedTask = focusedTaskId ? todoList.find((t) => t.id === focusedTaskId) : null;
  const linkedHabit = focusedTaskId ? habitList.find((h) => h.id === focusedTaskId) : null;

  const isHabit = !!linkedHabit;
  const title = linkedTask ? linkedTask.title : (linkedHabit ? linkedHabit.title : "Selected Target");
  const isRecovery = isHabit && !!linkedHabit.previousStreak && linkedHabit.previousStreak > 0;

  if (!focusedTaskId) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            backgroundColor: isDark ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.65)",
            borderColor: isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.05)",
          },
        ]}
      >
        <View style={styles.emptyHeaderRow}>
          <View
            style={[
              styles.targetIconCircle,
              { backgroundColor: `${colors.primary}18` },
            ]}
          >
            <Feather name="target" size={13} color={colors.primary} />
          </View>
          <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>
            What are you focusing on?
          </Text>
        </View>
        <PressableScale
          onPress={onLinkPress}
          haptic
          style={styles.selectTargetWrapper}
          contentStyle={[
            styles.selectTargetBtn,
            {
              backgroundColor: isDark ? `${colors.primary}18` : `${colors.primary}10`,
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
    <View
      style={[
        styles.targetContainer,
        {
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.65)",
          borderColor: isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.05)",
        },
      ]}
    >
      <View style={styles.targetHeaderRow}>
        <View style={styles.targetHeaderTitleGroup}>
          <Feather name="target" size={12} color={colors.primary} />
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            Focus target
          </Text>
        </View>
        <View style={styles.targetActions}>
          <PressableScale
            onPress={onLinkPress}
            haptic
            style={[styles.changeBtn, { backgroundColor: `${colors.primary}16` }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          >
            <Text style={[styles.changeBtnText, { color: colors.primary }]}>
              Change
            </Text>
          </PressableScale>
          <PressableScale
            onPress={onUnlinkPress}
            haptic
            style={[
              styles.unlinkBtn,
              { backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)" },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Feather name="x" size={14} color={colors.textMuted} />
          </PressableScale>
        </View>
      </View>

      <PressableScale
        onPress={onLinkPress}
        haptic
        style={styles.targetDetailWrapper}
        contentStyle={styles.targetDetailRow}
      >
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: isHabit ? "rgba(245, 158, 11, 0.14)" : `${colors.primary}18` },
          ]}
        >
          <Feather
            name={isHabit ? "repeat" : "check-square"}
            size={16}
            color={isHabit ? "#F59E0B" : colors.primary}
          />
        </View>

        <View style={styles.titleInfo}>
          <Text numberOfLines={1} style={[styles.targetTitle, { color: colors.text }]}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <Feather
              name={isHabit ? "repeat" : "check-square"}
              size={11}
              color={colors.textMuted}
            />
            <Text style={[styles.typeLabel, { color: colors.textMuted }]}>
              {isHabit ? "Habit" : "Task"}
            </Text>
            <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
            <Text style={[styles.metaTimeframe, { color: colors.textMuted }]}>
              {isHabit ? "Daily" : "Today"}
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    alignItems: "center",
  },
  emptyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  targetIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLabel: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  selectTargetWrapper: {
    width: "100%",
  },
  selectTargetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    width: "100%",
    minHeight: 40,
  },
  selectTargetText: {
    fontSize: 13,
    fontWeight: "700",
  },
  targetContainer: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  targetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  targetHeaderTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  targetActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 26,
  },
  changeBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  unlinkBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  targetDetailWrapper: {
    width: "100%",
  },
  targetDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    paddingTop: 2,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  titleInfo: {
    flex: 1,
    gap: 2,
  },
  targetTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metaDot: {
    fontSize: 12,
    fontWeight: "600",
  },
  metaTimeframe: {
    fontSize: 12,
    fontWeight: "500",
  },
  recoveryBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderWidth: 1,
  },
  recoveryText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#EF4444",
  },
});
