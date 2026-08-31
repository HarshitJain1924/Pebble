import React from "react";
import { View, Pressable, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import PressableScale from "@/shared/components/ui/PressableScale";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";

interface QuickSlotSheetProps {
  task: any | null;
  freeTimeGaps: any[];
  onClose: () => void;
  onPlanTask: (taskId: string, target: { hour?: number; minute?: number; isAllDay?: boolean }) => Promise<any>;
  onPlanChecklist: (checklistId: string, target: { hour?: number; minute?: number; isAllDay?: boolean }) => Promise<any>;
  colors: any;
  isLight: boolean;
}

export const QuickSlotSheet: React.FC<QuickSlotSheetProps> = ({
  task,
  freeTimeGaps,
  onClose,
  onPlanTask,
  onPlanChecklist,
  colors,
  isLight,
}) => {
  return (
    <AnimatedOverlay
      visible={!!task}
      onClose={onClose}
      type="bottom-sheet"
    >
      {(close) => {
        if (!task) return null;
        const taskDuration = task.schedule?.durationMinutes || 60;

        // Helper to format free gap suggestions
        const topGaps = freeTimeGaps.slice(0, 3).map((gap) => {
          const gapHour = Math.floor(gap.startMinutes / 60);
          const gapMin = gap.startMinutes % 60;
          const timeLabel =
            formatReminderTime(gapHour, gapMin) ||
            `${String(gapHour).padStart(2, "0")}:${String(gapMin).padStart(2, "0")}`;
          const durHours = Math.floor(gap.durationMinutes / 60);
          const durMins = gap.durationMinutes % 60;
          const durLabel =
            durHours > 0
              ? `${durHours}h${durMins > 0 ? ` ${durMins}m` : ""}`
              : `${durMins}m`;
          return {
            hour: gapHour,
            minute: gapMin,
            timeLabel,
            durLabel,
          };
        });

        // Common quick preset hours
        const commonPresets = [
          { hour: 9, minute: 0, label: "09:00 AM" },
          { hour: 11, minute: 0, label: "11:00 AM" },
          { hour: 14, minute: 0, label: "02:00 PM" },
          { hour: 16, minute: 0, label: "04:00 PM" },
          { hour: 18, minute: 30, label: "06:30 PM" },
        ];

        const isChecklist =
          task?.type === "checklist" || task?.items !== undefined;

        const handlePlan = async (target: { hour?: number; minute?: number; isAllDay?: boolean }) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (isChecklist) {
            await onPlanChecklist(task.id, target);
          } else {
            await onPlanTask(task.id, target);
          }
          close();
        };

        return (
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.headerRow,
                { borderBottomColor: colors.border + "40" },
              ]}
            >
              <View style={styles.headerTitleCol}>
                <Text
                  style={[styles.headerTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Schedule Task
                </Text>
                <Text
                  style={[styles.headerSubtitle, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {task.title} • {taskDuration} min
                </Text>
              </View>
              <Pressable
                onPress={close}
                hitSlop={8}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: isLight
                      ? "#F1F5F9"
                      : "rgba(255,255,255,0.06)",
                  },
                ]}
              >
                <Feather name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* 1. Suggested Free Time Windows */}
            {topGaps.length > 0 && (
              <View style={styles.sectionGroup}>
                <Text
                  style={[styles.sectionTitle, { color: colors.textMuted }]}
                >
                  Suggested Free Windows
                </Text>
                <View style={styles.gapsList}>
                  {topGaps.map((gap, idx) => (
                    <PressableScale
                      key={`gap-${gap.hour}-${gap.minute}-${idx}`}
                      onPress={() => handlePlan({ hour: gap.hour, minute: gap.minute })}
                      scaleTo={0.98}
                      contentStyle={[
                        styles.gapCard,
                        {
                          backgroundColor: `${colors.primary}12`,
                          borderColor: `${colors.primary}35`,
                        },
                      ]}
                    >
                      <View style={styles.gapLeft}>
                        <Feather
                          name="clock"
                          size={14}
                          color={colors.primary}
                        />
                        <Text
                          style={[styles.gapTimeText, { color: colors.text }]}
                        >
                          {gap.timeLabel}
                        </Text>
                      </View>
                      <Text
                        style={[styles.gapDurText, { color: colors.primary }]}
                      >
                        {gap.durLabel} free
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </View>
            )}

            {/* 2. Common Quick Slots */}
            <View style={styles.sectionGroup}>
              <Text
                style={[styles.sectionTitle, { color: colors.textMuted }]}
              >
                Quick Slots
              </Text>
              <View style={styles.presetsGrid}>
                {commonPresets.map((preset) => (
                  <PressableScale
                    key={preset.label}
                    onPress={() => handlePlan({ hour: preset.hour, minute: preset.minute })}
                    scaleTo={0.96}
                    contentStyle={[
                      styles.presetChip,
                      {
                        backgroundColor: isLight
                          ? "#F1F5F9"
                          : "rgba(255,255,255,0.04)",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather name="sun" size={12} color={colors.textMuted} />
                    <Text
                      style={[styles.presetLabel, { color: colors.text }]}
                    >
                      {preset.label}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {/* 3. All-Day / Anytime Option */}
            <View
              style={[styles.separator, { backgroundColor: colors.border }]}
            />
            <PressableScale
              onPress={() => handlePlan({ isAllDay: true })}
              scaleTo={0.98}
              contentStyle={[
                styles.allDayOption,
                {
                  backgroundColor: isLight
                    ? "#F8FAFC"
                    : "rgba(255,255,255,0.02)",
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.allDayLeft}>
                <Feather name="calendar" size={14} color={colors.textMuted} />
                <Text
                  style={[styles.allDayText, { color: colors.text }]}
                >
                  Place in All Day / Anytime
                </Text>
              </View>
              <Feather
                name="arrow-right"
                size={14}
                color={colors.textMuted}
              />
            </PressableScale>
          </View>
        );
      }}
    </AnimatedOverlay>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1.5,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleCol: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
  },
  sectionGroup: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  gapsList: {
    gap: 6,
  },
  gapCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  gapLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gapTimeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  gapDurText: {
    fontSize: 11,
    fontWeight: "600",
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  separator: {
    height: 1,
    marginVertical: 2,
  },
  allDayOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  allDayLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  allDayText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
