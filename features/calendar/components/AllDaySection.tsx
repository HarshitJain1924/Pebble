import React from "react";
import { View, ScrollView, Pressable, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
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
    items?: Array<{ title: string; completed?: boolean }>;
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
      {/* Section Header Row */}
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
            style={styles.planButton}
          >
            <Feather name="plus" size={12} color={colors.primary} />
            <Text style={[styles.planLink, { color: colors.primary }]}>
              Plan
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal Chips ScrollView */}
      {items.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {items.map((item, idx) => {
            const gesture = createPanGesture(item);
            const type = getCalendarItemType(item);
            const accent = item.completed ? colors.textMuted : (ACCENT[type] ?? ACCENT.task);
            const isHabit = item.type === "habit";
            const itemCount =
              type === "checklist" && item.items && item.items.length > 0
                ? item.items.length
                : null;

            return (
              <GestureDetector key={item.id || idx} gesture={gesture}>
                <Pressable
                  onPress={() => onOpenItem(item)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: isLight ? "#FFFFFF" : "rgba(255, 255, 255, 0.05)",
                      borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255, 255, 255, 0.1)",
                      borderLeftColor: accent,
                      opacity: pressed ? 0.8 : item.completed ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: item.completed ? colors.textMuted : colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {isHabit ? `⚡ ${item.title}` : item.title}
                    {itemCount ? ` · ${itemCount}` : ""}
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
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  planButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  planLink: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 180,
  },
});
