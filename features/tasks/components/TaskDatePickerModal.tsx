import React, { useMemo } from "react";
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import * as Haptics from "expo-haptics";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import { Palette } from "@/shared/constants/theme";
import { getTodayDateKey, getOffsetDateKey } from "@/shared/utils/date-key";

interface TaskDatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  colors: any;
  isDark: boolean;
}

export const TaskDatePickerModal: React.FC<TaskDatePickerModalProps> = ({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
  colors,
  isDark,
}) => {
  const todayKey = getTodayDateKey();

  const presets = useMemo(
    () => [
      { label: "Yesterday", dateKey: getOffsetDateKey(1, todayKey) },
      { label: "Today", dateKey: todayKey },
      { label: "Tomorrow", dateKey: getOffsetDateKey(-1, todayKey) },
      { label: "+7 Days", dateKey: getOffsetDateKey(-7, todayKey) },
    ],
    [todayKey],
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    if (selectedDate) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: colors.primary,
        selectedTextColor: Palette.white,
      };
    }
    return marks;
  }, [selectedDate, colors.primary]);

  const handleSelectDate = (dateKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelectDate(dateKey);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Dismiss date picker"
        />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleWrap}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.05)",
                  },
                ]}
              >
                <Feather name="calendar" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                Select Date
              </Text>
            </View>

            <View style={styles.headerActions}>
              {selectedDate !== todayKey && (
                <PressableScale
                  onPress={() => handleSelectDate(todayKey)}
                  haptic
                  scaleTo={0.94}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to today"
                  style={[
                    styles.todayButton,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(0, 0, 0, 0.05)",
                    },
                  ]}
                >
                  <Text style={[styles.todayButtonText, { color: colors.primary }]}>
                    Today
                  </Text>
                </PressableScale>
              )}

              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                style={styles.closeButton}
              >
                <Feather name="x" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Jump Presets */}
          <View style={styles.presetsRow}>
            {presets.map((preset) => {
              const isSelected = selectedDate === preset.dateKey;
              return (
                <PressableScale
                  key={preset.label}
                  onPress={() => handleSelectDate(preset.dateKey)}
                  haptic
                  scaleTo={0.94}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${preset.label}`}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : isDark
                        ? "rgba(255, 255, 255, 0.06)"
                        : Palette.slate100,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      {
                        color: isSelected ? Palette.white : colors.text,
                        fontWeight: isSelected ? "700" : "600",
                      },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* Calendar Month Grid */}
          <View
            style={[
              styles.calendarContainer,
              {
                borderColor: colors.border,
              },
            ]}
          >
            <Calendar
              current={selectedDate}
              key={selectedDate}
              onDayPress={(day: { dateString: string }) =>
                handleSelectDate(day.dateString)
              }
              theme={{
                calendarBackground: "transparent",
                textSectionTitleColor: colors.textMuted,
                selectedDayBackgroundColor: colors.primary,
                selectedDayTextColor: Palette.white,
                todayTextColor: colors.primary,
                dayTextColor: colors.text,
                textDisabledColor: isDark
                  ? "rgba(255, 255, 255, 0.22)"
                  : "rgba(0, 0, 0, 0.22)",
                arrowColor: colors.primary,
                monthTextColor: colors.text,
                textDayFontWeight: "600",
                textMonthFontWeight: "700",
                textDayHeaderFontWeight: "700",
                textDayFontSize: 15,
                textMonthFontSize: 16,
                textDayHeaderFontSize: 12,
              }}
              markedDates={markedDates}
              enableSwipeMonths
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  todayButtonText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  closeButton: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  presetsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 12.5,
    letterSpacing: -0.2,
  },
  calendarContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
});
