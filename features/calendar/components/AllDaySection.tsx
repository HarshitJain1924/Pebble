import React from "react";
import { View, ScrollView, Pressable, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { GestureDetector } from "react-native-gesture-handler";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { getCalendarItemType } from "@/features/calendar/types";

interface AllDaySectionProps {
  items: Array<{
    id: string;
    title: string;
    type: string;
    completed?: boolean;
    [key: string]: any;
  }>;
  hasPendingItems: boolean;
  onPlanAllDay: () => void;
  onOpenItem: (item: any) => void;
  createPanGesture: (item: any) => any;
  colors: any;
  isLight: boolean;
}

const ACCENT: Record<string, string> = {
  task:      "#6366F1",
  habit:     "#10B981",
  checklist: "#3B82F6",
};

export const AllDaySection: React.FC<AllDaySectionProps> = React.memo(({
  items,
  hasPendingItems,
  onPlanAllDay,
  onOpenItem,
  createPanGesture,
  colors,
  isLight,
}) => {
  if (items.length === 0 && !hasPendingItems) return null;

  return (
    <View style={styles.container}>
      {/* Section header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          ALL DAY
        </Text>
        {hasPendingItems && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPlanAllDay();
            }}
            hitSlop={12}
          >
            <Text style={[styles.planLink, { color: colors.primary }]}>
              + Plan
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Compact horizontal chips */}
      {items.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {items.map((item, idx) => {
            const gesture = createPanGesture(item);
            const type = getCalendarItemType(item);
            const accent = item.completed ? colors.border : (ACCENT[type] ?? ACCENT.task);
            const isHabit = item.type === "habit";

            return (
              <GestureDetector key={item.id || idx} gesture={gesture}>
                <Pressable
                  onPress={() => onOpenItem(item)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: isLight ? "#F8FAFC" : "rgba(255,255,255,0.05)",
                      borderColor: isLight ? colors.border : "rgba(255,255,255,0.08)",
                      borderLeftColor: accent,
                      opacity: pressed ? 0.75 : item.completed ? 0.45 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {isHabit ? `⚡ ${item.title}` : item.title}
                  </Text>
                </Pressable>
              </GestureDetector>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

AllDaySection.displayName = "AllDaySection";

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  planLink: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 160,
  },
});
