import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { ThemeColors } from "@/shared/constants/theme";
import * as Haptics from "expo-haptics";
import React from "react";
import { ScrollView, View } from "react-native";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "tasks", label: "Tasks" },
  { key: "habits", label: "Habits" },
  { key: "checklists", label: "Checklists" },
  { key: "overdue", label: "Overdue" },
] as const;

export interface DashboardFilterBarProps {
  activeFilter: string;
  onSelectFilter: (filterKey: string) => void;
  colors: ThemeColors;
}

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  activeFilter,
  onSelectFilter,
  colors,
}) => {
  return (
    <View style={{ marginTop: 16, marginHorizontal: -16 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 8,
          paddingVertical: 4,
        }}
      >
        {FILTERS.map((filter) => {
          const isSelected = activeFilter === filter.key;
          return (
            <PressableScale
              key={filter.key}
              onPress={() => {
                onSelectFilter(filter.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isSelected ? colors.primary : colors.card,
                borderColor: isSelected ? colors.primary : colors.border,
                borderWidth: 1.5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isSelected ? 0.1 : 0.02,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: isSelected ? "#FFFFFF" : colors.textMuted,
                }}
              >
                {filter.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
};
