import React from "react";
import { View, TouchableOpacity, Alert } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { addXp } from "@/services/settingsService";
import { resolveSuggestion, type SmartSuggestion } from "@/services/suggestions";
import { type Todo, type Habit, type TaskList } from "../types";

interface SuggestionBannerProps {
  activeSuggestions: SmartSuggestion[];
  loadSuggestions: () => Promise<void> | void;
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  persistHabits: (nextHabits: Habit[]) => Promise<void> | void;
  setTodos: React.Dispatch<React.SetStateAction<Record<string, Todo[]>>>;
  persistState: (
    lists: TaskList[],
    selected: string,
    todos: Record<string, Todo[]>,
  ) => Promise<void> | void;
  lists: TaskList[];
  selectedList: string;
  openedFolderId: string | null;
  getDateKey: (date?: Date) => string;
}

export function SuggestionBanner({
  activeSuggestions,
  loadSuggestions,
  setHabits,
  persistHabits,
  setTodos,
  persistState,
  lists,
  selectedList,
  openedFolderId,
  getDateKey,
}: SuggestionBannerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  if (activeSuggestions.length === 0) return null;

  const bannerBg = isDark
    ? "rgba(99, 102, 241, 0.15)"
    : "rgba(99, 102, 241, 0.08)";
  const borderColor = isDark
    ? "rgba(99, 102, 241, 0.3)"
    : "rgba(99, 102, 241, 0.2)";

  return (
    <View style={{ gap: 8, marginVertical: 8, paddingHorizontal: 4 }}>
      {activeSuggestions.map((suggestion) => (
        <Animated.View
          entering={FadeInDown}
          key={suggestion.id}
          style={{
            backgroundColor: bannerBg,
            borderWidth: 1.5,
            borderColor: borderColor,
            borderRadius: 16,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Feather name="zap" size={18} color="#6366F1" />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Smart Suggestion
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: "500",
                  marginTop: 2,
                }}
              >
                {suggestion.message}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (suggestion.type === "convert_habit") {
                  const newHabit: Habit = {
                    id: `habit-${Date.now()}`,
                    title: suggestion.title,
                    streak: 0,
                    bestStreak: 0,
                    completedToday: false,
                    priority: "medium",
                  };
                  setHabits((current) => {
                    const updated = [newHabit, ...current];
                    void persistHabits(updated);
                    return updated;
                  });
                  await addXp(5).catch(() => {});
                  Alert.alert(
                    "Success",
                    `"${suggestion.title}" has been converted to a recurring daily habit!`,
                  );
                } else {
                  const newTodo: Todo = {
                    id: String(Date.now()),
                    title: `Study schedule: ${suggestion.title}`,
                    completed: false,
                    category: "learning",
                    priority: "high",
                    scheduledDate: getDateKey(),
                    folderId: openedFolderId || "default",
                  };
                  setTodos((current) => {
                    const listId = openedFolderId || "default";
                    const listTodos = current[listId] ?? [];
                    const updated = {
                      ...current,
                      [listId]: [newTodo, ...listTodos],
                    };
                    void persistState(lists, selectedList, updated);
                    return updated;
                  });
                  await addXp(10).catch(() => {});
                  Alert.alert(
                    "Success",
                    `Created recurring study schedule task for "${suggestion.title}"!`,
                  );
                }
                await resolveSuggestion(suggestion.id);
                await loadSuggestions();
              }}
              style={{
                backgroundColor: "#6366F1",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
              }}
            >
              <Text
                style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}
              >
                Accept
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                await resolveSuggestion(suggestion.id);
                await loadSuggestions();
              }}
              style={{
                backgroundColor: isDark
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(0, 0, 0, 0.05)",
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                Dismiss
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
