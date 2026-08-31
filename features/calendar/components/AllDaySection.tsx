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
    [key: string]: any;
  }>;
  hasPendingItems: boolean;
  onPlanAllDay: () => void;
  onOpenItem: (item: any) => void;
  createPanGesture: (item: any) => any;
  colors: any;
  isLight: boolean;
}

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
      <View style={styles.headerRow}>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          ALL DAY
        </Text>
        {hasPendingItems && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPlanAllDay();
            }}
            hitSlop={8}
            style={[
              styles.planButton,
              {
                backgroundColor: isLight
                  ? "#F1F5F9"
                  : "rgba(255,255,255,0.06)",
              },
            ]}
          >
            <Feather name="plus" size={11} color={colors.primary} />
            <Text style={[styles.planButtonText, { color: colors.primary }]}>
              Plan All Day
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {items.map((item, idx) => {
            const gesture = createPanGesture(item);
            const type = getCalendarItemType(item);
            const themeColor =
              {
                task: "#6C63FF",
                habit: "#10B981",
                checklist: "#3B82F6",
              }[type] || "#6C63FF";

            return (
              <GestureDetector key={item.id || idx} gesture={gesture}>
                <Pressable
                  onPress={() => onOpenItem(item)}
                  style={[
                    styles.allDayCard,
                    {
                      backgroundColor: item.completed
                        ? isLight
                          ? "#F1F5F9"
                          : "rgba(255, 255, 255, 0.03)"
                        : isLight
                          ? "#E2E8F0"
                          : "rgba(255, 255, 255, 0.08)",
                      borderColor: item.completed
                        ? colors.border
                        : themeColor,
                      borderLeftWidth: 3,
                      borderLeftColor: item.completed
                        ? colors.border
                        : themeColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.allDayCardText,
                      {
                        color: item.completed
                          ? colors.textMuted
                          : colors.text,
                        textDecorationLine: item.completed
                          ? "line-through"
                          : "none",
                      },
                    ]}
                  >
                    {item.type === "habit"
                      ? `⚡ ${item.title}`
                      : item.title}
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
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  planButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  planButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  allDayCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 4,
  },
  allDayCardText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
