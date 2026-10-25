import React from "react";
import { View, Pressable, Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { AnimatedOverlay } from "@/shared/components/ui/AnimatedOverlay";
import { getDateKey } from "@/features/calendar/hooks/useCalendarState";

interface QuickJumpSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectDate: (date: string) => void;
  colors: any;
}

export const QuickJumpSheet: React.FC<QuickJumpSheetProps> = ({
  visible,
  onClose,
  onSelectDate,
  colors,
}) => {
  const jumpOptions = [
    {
      label: "Today",
      icon: "calendar",
      date: getDateKey(new Date()),
    },
    {
      label: "Tomorrow",
      icon: "arrow-right",
      date: getDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    },
    {
      label: "Next Week",
      icon: "chevrons-right",
      date: getDateKey(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ),
    },
  ];

  return (
    <AnimatedOverlay
      visible={visible}
      onClose={onClose}
      type="bottom-sheet"
    >
      {(close) => (
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
            <Text
              style={[styles.headerTitle, { color: colors.text }]}
            >
              Quick Jump
            </Text>
          </View>

          {/* Jump Options */}
          <Text
            style={[styles.sectionTitle, { color: colors.textMuted }]}
          >
            Jump To
          </Text>
          <View>
            {jumpOptions.map((opt, idx) => (
              <Pressable
                key={opt.label}
                onPress={() => {
                  onSelectDate(opt.date);
                  close();
                }}
                style={[
                  styles.optionRow,
                  {
                    borderBottomWidth: idx < 2 ? 1 : 0,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Feather
                  name={opt.icon as any}
                  size={14}
                  color={colors.textMuted}
                />
                <Text
                  style={[styles.optionLabel, { color: colors.text }]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
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
  },
  headerRow: {
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
