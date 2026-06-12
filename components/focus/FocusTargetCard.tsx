import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/components/ui/AppText";
import { AppCard } from "@/components/AppCard";

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
            Focus Target
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            {focusedTaskId ? (isHabit ? "Linked to active habit" : "Linked to active task") : "No target linked"}
          </Text>
        </View>
        {focusedTaskId && (
          <Pressable onPress={onUnlinkPress} style={styles.unlinkBtn}>
            <Feather name="x" size={16} color={colors.error} />
          </Pressable>
        )}
      </View>
      <View style={styles.divider} />

      {focusedTaskId ? (
        <View style={styles.linkedRow}>
          <Feather name={isHabit ? "activity" : "target"} size={18} color={isHabit ? "#F59E0B" : colors.primary} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, flex: 1 }}>
            {title}
          </Text>
          {isRecovery && (
            <View style={{ backgroundColor: "rgba(239, 68, 68, 0.12)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderColor: "rgba(239, 68, 68, 0.25)", borderWidth: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#EF4444" }}>
                💔 RECOVERY ACTIVE (10M)
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Pressable onPress={onLinkPress} style={styles.selectTaskBtn}>
          <Feather name="plus-circle" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
            Link a task or habit to focus on
          </Text>
        </Pressable>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  taskCard: {
    padding: 16,
    gap: 12,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    gap: 4,
  },
  taskCardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  unlinkBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  selectTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
});
