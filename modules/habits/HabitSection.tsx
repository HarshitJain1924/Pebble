import React from "react";
import { useRouter } from "expo-router";
import { View, Pressable } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { SwipeableCard } from "@/components/SwipeableCard";
import { HabitStreakCard } from "@/components/dashboard/HabitStreakCard";
import { HabitsEmptyGraphic } from "@/components/AppGraphics";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "@/constants/taskStyles";
import { type Habit } from "../types";

interface HabitSectionProps {
  displayedHabits: Habit[];
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits: (nextHabits: Habit[]) => Promise<void>;
  toggleHabit: (id: string) => void;
  deleteHabit: (id: string) => void;
  unfinishedHabitCount: number;
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleSelectItem?: (id: string) => void;
  onEditHabit?: (habit: Habit) => void;
}

export function HabitSection({
  displayedHabits,
  toggleHabit,
  deleteHabit,
  isSelectionMode = false,
  selectedItemIds = new Set(),
  onToggleSelectItem,
}: HabitSectionProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={styles.listContent}>
      {displayedHabits.length > 0 ? (
        displayedHabits.map((item) => {
          return (
            <View key={item.id} style={styles.habitWrap}>
              <SwipeableCard
                onSwipeRight={() => toggleHabit(item.id)}
                onSwipeLeft={() => deleteHabit(item.id)}
                disabled={isSelectionMode}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {isSelectionMode && (
                    <Pressable
                      onPress={() => onToggleSelectItem?.(item.id)}
                      style={{ paddingLeft: 6, paddingRight: 4 }}
                    >
                      <Feather
                        name={selectedItemIds.has(item.id) ? "check-circle" : "circle"}
                        size={18}
                        color={selectedItemIds.has(item.id) ? colors.primary : colors.textMuted}
                      />
                    </Pressable>
                  )}
                  <View style={{ flex: 1 }}>
                    <HabitStreakCard
                      title={item.title}
                      streak={item.streak}
                      bestStreak={item.bestStreak}
                      completedToday={item.completedToday}
                      priority={item.priority}
                      onPressToggle={isSelectionMode ? () => onToggleSelectItem?.(item.id) : () => toggleHabit(item.id)}
                      onCardPress={isSelectionMode ? () => onToggleSelectItem?.(item.id) : () =>
                        router.push(`/task-details?id=${item.id}&type=habit`)
                      }
                    />
                  </View>
                </View>
              </SwipeableCard>
            </View>
          );
        })
      ) : (
        <View
          style={[
            styles.emptyState,
            { borderColor: colors.border, gap: 16 },
          ]}
        >
          <HabitsEmptyGraphic />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Consistency starts with one pebble.
          </Text>
        </View>
      )}
    </View>
  );
}
