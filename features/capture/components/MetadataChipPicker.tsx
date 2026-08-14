/**
 * MetadataChipPicker.tsx
 * ───────────────────────
 * Centered contextual modal picker for Quick Capture metadata chips.
 * Supports Type, Priority, Date+Time, Reminder, Category, Recurrence, and Workspace.
 *
 * Architecture (ONE coherent layer):
 *   Quick Capture is a BottomSheet; the picker is a single transparent RN Modal
 *   rendered above it. The card is centered, width-constrained, and every option
 *   row is a plain Pressable whose children are ICON + LABEL (+ optional checkmark)
 *   directly — no intermediate animated wrapper — so labels always receive real,
 *   measurable width and can never collapse to zero.
 *
 * Date: a real calendar (react-native-calendars — the same component used in
 *   task-details) with an inline TimeSelectorDial for time editing.
 * Reminder: preset offsets + an inline custom-minute stepper.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Calendar } from "react-native-calendars";
import { TimeSelectorDial } from "@/shared/components/ui/TimeSelectorDial";

export interface ChipPickerOption {
  id: string;
  label: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  color?: string;
  subtitle?: string;
  isSelected?: boolean;
}

export interface MetadataChipPickerProps {
  visible: boolean;
  title: string;
  options: ChipPickerOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  isDark?: boolean;
  /**
   * When false, selecting an option keeps the picker open.
   * Used by the "Details" editor to drill into a specific field's picker.
   */
  closeOnSelect?: boolean;
  /** Currently selected date (YYYY-MM-DD) highlighted in the calendar. */
  calendarDate?: string;
  /** When provided, renders a real calendar above the quick options. */
  onCalendarSelect?: (dateStr: string) => void;
  /** Current time (HH:MM) shown in the time section. */
  timeValue?: string;
  /** When provided, renders the time section with the real time dial. */
  onTimeSelect?: (timeStr: string) => void;
}

function formatTimeShort(timeStr?: string): string {
  if (!timeStr) return "Set time";
  const [h, m] = timeStr.split(":").map(Number);
  const isPm = h >= 12;
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
}

export function MetadataChipPicker({
  visible,
  title,
  options,
  onSelect,
  onClose,
  isDark = true,
  closeOnSelect = true,
  calendarDate,
  onCalendarSelect,
  timeValue,
  onTimeSelect,
}: MetadataChipPickerProps) {
  const [timeExpanded, setTimeExpanded] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(30);

  // Reset sub-states whenever the picker context (title) changes.
  useEffect(() => {
    setTimeExpanded(false);
    setCustomOpen(false);
    setCustomMinutes(30);
  }, [title]);

  if (!visible) return null;

  const bgCard = isDark ? "#1E1E24" : "#FFFFFF";
  const textPrimary = isDark ? "#F3F4F6" : "#111827";
  const textMuted = isDark ? "#9CA3AF" : "#6B7280";
  const borderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)";
  const accentColor = "#6366F1";

  const dialColors = {
    text: textPrimary,
    textMuted,
    border: borderColor,
    cardLight: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
    primary: accentColor,
    error: "#EF4444",
  };

  const handleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelect(id);
    if (closeOnSelect) onClose();
  };

  const handleCalendarSelect = (dateStr: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onCalendarSelect?.(dateStr);
    onClose();
  };

  const initialTime = (() => {
    if (!timeValue) return { hour: 9, minute: 0 };
    const [h, m] = timeValue.split(":").map(Number);
    return { hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 };
  })();

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(100)}
          style={styles.backdrop}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.modalCard,
                {
                  backgroundColor: bgCard,
                  borderColor,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color={textMuted} />
                </TouchableOpacity>
              </View>

              {/* Options List (calendar + rows scroll together so nothing clips) */}
              <ScrollView
                style={styles.scrollList}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {onCalendarSelect && (
                  <View style={styles.calendarWrap}>
                    <Calendar
                      current={calendarDate || undefined}
                      onDayPress={(day: any) => handleCalendarSelect(day.dateString)}
                      theme={{
                        calendarBackground: bgCard,
                        textSectionTitleColor: textMuted,
                        selectedDayBackgroundColor: accentColor,
                        selectedDayTextColor: "#FFFFFF",
                        todayTextColor: accentColor,
                        dayTextColor: textPrimary,
                        textDisabledColor: `${textMuted}55`,
                        arrowColor: accentColor,
                        monthTextColor: textPrimary,
                        textDayFontWeight: "600",
                        textMonthFontWeight: "700",
                        textDayHeaderFontWeight: "700",
                        textDayFontSize: 13,
                        textMonthFontSize: 14,
                        textDayHeaderFontSize: 11,
                      }}
                      markedDates={
                        calendarDate
                          ? { [calendarDate]: { selected: true, selectedColor: accentColor } }
                          : {}
                      }
                    />
                  </View>
                )}

                {/* Time section (real time dial) */}
                {onTimeSelect && (
                  <View style={styles.timeSection}>
                    <Pressable
                      onPress={() => setTimeExpanded((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel="Edit time"
                      style={[
                        styles.timeRow,
                        { backgroundColor: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.01)" },
                      ]}
                    >
                      <Feather name="clock" size={15} color={textMuted} />
                      <Text style={[styles.timeLabel, { color: textPrimary }]}>Time</Text>
                      <Text style={[styles.timeValue, { color: timeValue ? textPrimary : textMuted }]}>
                        {formatTimeShort(timeValue)}
                      </Text>
                      <Feather name={timeExpanded ? "chevron-up" : "chevron-down"} size={14} color={textMuted} />
                    </Pressable>
                    {timeExpanded && (
                      <TimeSelectorDial
                        initialHour={initialTime.hour}
                        initialMinute={initialTime.minute}
                        colors={dialColors}
                        saveLabel="Set time"
                        onSave={(h: number, m: number) => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          onTimeSelect?.(`${pad(h)}:${pad(m)}`);
                          onClose();
                        }}
                      />
                    )}
                  </View>
                )}

                {options.map((opt) => {
                  if (opt.id === "custom" && customOpen) {
                    return (
                      <View key={opt.id} style={[styles.customRow, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.01)" }]}>
                        <Text style={[styles.customLabel, { color: textPrimary }]}>Minutes before</Text>
                        <Pressable
                          onPress={() => setCustomMinutes((m) => Math.max(1, m - 5))}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease minutes"
                          style={[styles.stepBtn, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)" }]}
                        >
                          <Feather name="minus" size={14} color={textMuted} />
                        </Pressable>
                        <Text style={[styles.customValue, { color: textPrimary }]}>{customMinutes} min</Text>
                        <Pressable
                          onPress={() => setCustomMinutes((m) => m + 5)}
                          accessibilityRole="button"
                          accessibilityLabel="Increase minutes"
                          style={[styles.stepBtn, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)" }]}
                        >
                          <Feather name="plus" size={14} color={textMuted} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleSelect(String(customMinutes))}
                          accessibilityRole="button"
                          style={[styles.applyBtn, { backgroundColor: accentColor }]}
                        >
                          <Text style={styles.applyBtnText}>Set</Text>
                        </Pressable>
                      </View>
                    );
                  }

                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => (opt.id === "custom" ? setCustomOpen(true) : handleSelect(opt.id))}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected: opt.isSelected }}
                      style={({ pressed }) => [
                        styles.optionRow,
                        {
                          backgroundColor: opt.isSelected
                            ? isDark
                              ? "rgba(99, 102, 241, 0.16)"
                              : "rgba(99, 102, 241, 0.08)"
                            : isDark
                              ? "rgba(255, 255, 255, 0.02)"
                              : "rgba(0, 0, 0, 0.01)",
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View style={styles.optionLeft}>
                        {opt.icon ? (
                          <Feather
                            name={opt.icon}
                            size={16}
                            color={opt.isSelected ? accentColor : textMuted}
                          />
                        ) : opt.color ? (
                          <View style={[styles.optionDot, { backgroundColor: opt.color }]} />
                        ) : null}
                        <View style={styles.optionText}>
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[
                              styles.optionLabel,
                              {
                                color: textPrimary,
                                fontWeight: opt.isSelected ? "700" : "500",
                              },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          {opt.subtitle && (
                            <Text numberOfLines={1} style={[styles.optionSubtitle, { color: textMuted }]}>
                              {opt.subtitle}
                            </Text>
                          )}
                        </View>
                      </View>

                      {opt.isSelected && (
                        <Feather name="check" size={16} color={accentColor} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    maxHeight: 560,
    borderRadius: 20,
    borderWidth: 1.2,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150, 150, 150, 0.15)",
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  calendarWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
    padding: 4,
  },
  timeSection: {
    gap: 4,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  timeValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  scrollList: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 14,
  },
  optionSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  customLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  customValue: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 52,
    textAlign: "center",
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
