import React from "react";
import { View, ScrollView, Pressable, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import PressableScale from "@/shared/components/ui/PressableScale";
import { formatReminderTime } from "@/services/scheduling/schedule-formatter";
import { ENTITY_ACCENT } from "./TimelineItem";

interface CalendarPlanningSheetProps {
  visible: boolean;
  target: {
    hour?: number;
    minute?: number;
    isAllDay?: boolean;
  } | null;
  pendingTasks: any[];
  pendingChecklists: any[];
  onClose: () => void;
  onPlanTask: (taskId: string, target: { hour?: number; minute?: number; isAllDay?: boolean }) => Promise<any>;
  onPlanChecklist: (checklistId: string, target: { hour?: number; minute?: number; isAllDay?: boolean }) => Promise<any>;
  colors: any;
  isLight: boolean;
}

export const CalendarPlanningSheet: React.FC<CalendarPlanningSheetProps> = ({
  visible,
  target,
  pendingTasks,
  pendingChecklists,
  onClose,
  onPlanTask,
  onPlanChecklist,
  colors,
  isLight,
}) => {
  return (
    <AnimatedOverlay
      visible={visible}
      onClose={onClose}
      type="bottom-sheet"
    >
      {(close) => {
        if (!target) return null;
        const targetTimeLabel =
          target.isAllDay
            ? "All Day"
            : (target.hour !== undefined && target.minute !== undefined
                ? formatReminderTime(target.hour, target.minute) ||
                  `${String(target.hour).padStart(2, "0")}:${String(target.minute).padStart(2, "0")}`
                : "Timeline");

        const hasUnplacedItems =
          pendingTasks.length > 0 || pendingChecklists.length > 0;

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
            {/* Sheet Header */}
            <View
              style={[
                styles.headerRow,
                { borderBottomColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)" },
              ]}
            >
              <View style={styles.headerTitleCol}>
                <Text
                  style={[styles.headerTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {target.isAllDay
                    ? "Plan for All Day"
                    : `Place at ${targetTimeLabel}`}
                </Text>
                <Text
                  style={[styles.headerSubtitle, { color: colors.textMuted }]}
                >
                  Select an unplaced task or checklist to schedule
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

            {/* Items List or Empty State */}
            {!hasUnplacedItems ? (
              <View style={styles.emptyContainer}>
                <Feather
                  name="check-circle"
                  size={28}
                  color={colors.success}
                />
                <Text
                  style={[styles.emptyTitle, { color: colors.text }]}
                >
                  No Unplaced Items
                </Text>
                <Text
                  style={[styles.emptySubtitle, { color: colors.textMuted }]}
                >
                  All tasks and checklists for this workspace are already scheduled.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.scrollList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {/* Tasks Section */}
                {pendingTasks.length > 0 && (
                  <View style={styles.sectionGroup}>
                    <Text
                      style={[styles.sectionTitle, { color: colors.textMuted }]}
                    >
                      Tasks ({pendingTasks.length})
                    </Text>
                    {pendingTasks.map((task) => {
                      const taskDuration =
                        task.schedule?.durationMinutes || 60;
                      const taskAccent = ENTITY_ACCENT.task;

                      return (
                        <PressableScale
                          key={task.id}
                          onPress={async () => {
                            Haptics.notificationAsync(
                              Haptics.NotificationFeedbackType.Success,
                            ).catch(() => {});
                            await onPlanTask(task.id, {
                              hour: target.hour,
                              minute: target.minute,
                              isAllDay: target.isAllDay,
                            });
                            close();
                          }}
                          scaleTo={0.98}
                          contentStyle={[
                            styles.itemRow,
                            {
                              borderBottomColor: isLight
                                ? "rgba(0,0,0,0.05)"
                                : "rgba(255,255,255,0.06)",
                            },
                          ]}
                        >
                          <View style={styles.itemLeft}>
                            <Feather
                              name={taskAccent.icon}
                              size={15}
                              color={taskAccent.main}
                            />
                            <View style={styles.itemTextCol}>
                              <Text
                                style={[styles.itemTitle, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {task.title}
                              </Text>
                              <Text
                                style={[styles.itemMeta, { color: colors.textMuted }]}
                              >
                                {taskDuration} min
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.placeButton,
                              { backgroundColor: `${taskAccent.main}15` },
                            ]}
                          >
                            <Feather
                              name="plus"
                              size={13}
                              color={taskAccent.main}
                            />
                            <Text
                              style={[styles.placeButtonText, { color: taskAccent.main }]}
                            >
                              Place
                            </Text>
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}

                {/* Checklists Section */}
                {pendingChecklists.length > 0 && (
                  <View style={styles.sectionGroup}>
                    <Text
                      style={[styles.sectionTitle, { color: colors.textMuted }]}
                    >
                      Checklists ({pendingChecklists.length})
                    </Text>
                    {pendingChecklists.map((checklist) => {
                      const itemsSummary =
                        checklist.items && checklist.items.length > 0
                          ? checklist.items
                              .slice(0, 3)
                              .map((it: any) => it.title)
                              .join(" · ")
                          : "Empty checklist";
                      const duration =
                        checklist.schedule?.durationMinutes || 45;
                      const chkAccent = ENTITY_ACCENT.checklist;

                      return (
                        <PressableScale
                          key={checklist.id}
                          onPress={async () => {
                            Haptics.notificationAsync(
                              Haptics.NotificationFeedbackType.Success,
                            ).catch(() => {});
                            await onPlanChecklist(checklist.id, {
                              hour: target.hour,
                              minute: target.minute,
                              isAllDay: target.isAllDay,
                            });
                            close();
                          }}
                          scaleTo={0.98}
                          contentStyle={[
                            styles.itemRow,
                            {
                              borderBottomColor: isLight
                                ? "rgba(0,0,0,0.05)"
                                : "rgba(255,255,255,0.06)",
                            },
                          ]}
                        >
                          <View style={styles.itemLeft}>
                            <Feather
                              name={chkAccent.icon}
                              size={15}
                              color={chkAccent.main}
                            />
                            <View style={styles.itemTextCol}>
                              <Text
                                style={[styles.itemTitle, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {checklist.title}
                              </Text>
                              <Text
                                style={[styles.itemMeta, { color: colors.textMuted }]}
                                numberOfLines={1}
                              >
                                {itemsSummary} · {duration}m
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.placeButton,
                              { backgroundColor: `${chkAccent.main}15` },
                            ]}
                          >
                            <Feather
                              name="plus"
                              size={13}
                              color={chkAccent.main}
                            />
                            <Text
                              style={[styles.placeButtonText, { color: chkAccent.main }]}
                            >
                              Place
                            </Text>
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            )}

            {/* Cancel Button */}
            <PressableScale
              onPress={close}
              scaleTo={0.97}
              contentStyle={styles.cancelButton}
            >
              <Text
                style={[styles.cancelButtonText, { color: colors.textMuted }]}
              >
                Cancel
              </Text>
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
    borderWidth: 1,
    gap: 12,
    maxHeight: 500,
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
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  scrollList: {
    maxHeight: 320,
  },
  scrollContent: {
    gap: 16,
  },
  sectionGroup: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemTextCol: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  placeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  placeButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
