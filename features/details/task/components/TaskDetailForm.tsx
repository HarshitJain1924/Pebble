import React from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { Feather } from "@expo/vector-icons";

import { TimeSelectorDial } from "@/shared/components/ui/TimeSelectorDial";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { CategoryChip } from "@/shared/components/design-system";
import { Colors } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type { Workspace } from "@/shared/types/domain.types";
import { getDateKey } from "@/services/scheduling/recurrence.service";
import { DetailActions } from "@/features/details";
import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/features/details/options";
import type { TaskFormState } from "@/features/details/task/hooks/useTaskDetailForm";

export interface TaskDetailFormProps {
  form: TaskFormState;
  update: (patch: Partial<TaskFormState>) => void;
  toggleDay: (idx: number) => void;
  workspaces: Workspace[];
  hasChanges: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Task-specific edit form. Presents the exact field set the pre-extraction
 * Task edit mode supported (name, notes, category, priority, workspace,
 * schedule, reminder, repeat) with unchanged validation/save semantics. Pure
 * presentation — all state lives in the caller's form hook and all mutations
 * are delegated through the caller.
 */
export function TaskDetailForm({
  form,
  update,
  toggleDay,
  workspaces,
  hasChanges,
  onSave,
  onCancel,
}: TaskDetailFormProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme === "dark";

  const textInputStyle = [
    styles.textInput,
    {
      color: colors.text,
      borderColor: colors.border,
      backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
    },
  ];

  return (
    <View style={{ gap: 16 }}>
      {/* Title Input */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          Name
        </Text>
        <TextInput
          style={textInputStyle}
          value={form.title}
          onChangeText={(v) => update({ title: v })}
          placeholder="Item Title"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Description Input */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          Notes
        </Text>
        <TextInput
          style={[textInputStyle, styles.notesInput]}
          value={form.description}
          onChangeText={(v) => update({ description: v })}
          placeholder="Add details..."
          placeholderTextColor={colors.textMuted}
          multiline
        />
      </View>

      {/* Category Selector */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          Category
        </Text>
        <View style={styles.pillsContainer}>
          {CATEGORY_OPTIONS.map((cat) => {
            const isSelected = form.category === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected
                      ? `${cat.color}22`
                      : colors.card,
                    borderColor: isSelected ? cat.color : colors.border,
                  },
                ]}
                onPress={() => update({ category: cat.key })}
              >
                <CategoryChip category={cat.key} size="xs" />
                <Text
                  style={{
                    color: isSelected ? cat.color : colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                    marginLeft: 6,
                  }}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Priority Selector */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          Priority
        </Text>
        <View style={styles.pillsContainer}>
          {PRIORITY_OPTIONS.map((prio) => {
            const isSelected = form.priority === prio.key;
            return (
              <TouchableOpacity
                key={prio.key}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected
                      ? `${prio.color}22`
                      : colors.card,
                    borderColor: isSelected ? prio.color : colors.border,
                  },
                ]}
                onPress={() => update({ priority: prio.key })}
              >
                <Text
                  style={{
                    color: isSelected ? prio.color : colors.text,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {prio.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Workspace Selector */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          Workspace
        </Text>
        <View style={styles.pillsContainer}>
          {workspaces.map((ws) => {
            const isSelected = form.workspaceId === ws.id;
            return (
              <TouchableOpacity
                key={ws.id}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected
                      ? `${colors.primary}22`
                      : colors.card,
                    borderColor: isSelected
                      ? colors.primary
                      : colors.border,
                  },
                ]}
                onPress={() => update({ workspaceId: ws.id })}
              >
                <Text
                  style={{
                    color: isSelected ? colors.primary : colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {ws.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* === SCHEDULE (canonical) === */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          Schedule
        </Text>
        <View style={styles.pillsContainer}>
          {[
            { label: "Today", val: getDateKey() },
            {
              label: "Tomorrow",
              val: getDateKey(new Date(Date.now() + 86400000)),
            },
            { label: "Inbox", val: "inbox" },
          ].map((opt) => {
            const isSelected = form.scheduleDate === opt.val;
            return (
              <TouchableOpacity
                key={opt.val}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected
                      ? `${colors.primary}22`
                      : colors.card,
                    borderColor: isSelected
                      ? colors.primary
                      : colors.border,
                  },
                ]}
                onPress={() =>
                  update({ scheduleDate: opt.val, showDatePicker: false })
                }
              >
                <Text
                  style={{
                    color: isSelected ? colors.primary : colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[
              styles.pill,
              {
                backgroundColor:
                  form.showDatePicker ||
                  !["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(form.scheduleDate)
                    ? `${colors.primary}22`
                    : colors.card,
                borderColor:
                  form.showDatePicker ||
                  !["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(form.scheduleDate)
                    ? colors.primary
                    : colors.border,
              },
            ]}
            onPress={() => update({ showDatePicker: !form.showDatePicker })}
          >
            <Feather name="calendar" size={12} color={colors.primary} />
            <Text
              style={{
                color: colors.text,
                fontSize: 13,
                fontWeight: "600",
                marginLeft: 4,
              }}
            >
              {!["inbox", getDateKey(), getDateKey(new Date(Date.now() + 86400000))].includes(form.scheduleDate)
                ? form.scheduleDate
                : "Custom..."}
            </Text>
          </TouchableOpacity>
        </View>

        {form.showDatePicker && (
          <View
            style={{
              marginTop: 12,
              borderRadius: 12,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Calendar
              current={form.scheduleDate !== "inbox" ? form.scheduleDate : undefined}
              onDayPress={(day: { dateString: string }) => {
                update({ scheduleDate: day.dateString, showDatePicker: false });
              }}
              theme={{
                backgroundColor: colors.card,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.textMuted,
                selectedDayBackgroundColor: colors.primary,
                selectedDayTextColor: "#ffffff",
                todayTextColor: colors.primary,
                dayTextColor: colors.text,
                textDisabledColor: colors.textMuted + "50",
                monthTextColor: colors.text,
                arrowColor: colors.primary,
              }}
              markedDates={
                form.scheduleDate && form.scheduleDate !== "inbox"
                  ? {
                      [form.scheduleDate]: {
                        selected: true,
                        selectedColor: colors.primary,
                      },
                    }
                  : {}
              }
            />
          </View>
        )}

        {/* Schedule Time & Duration */}
        {form.scheduleDate !== "inbox" && (
          <View
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                onPress={() =>
                  update({
                    scheduleTimePickerVisible: !form.scheduleTimePickerVisible,
                  })
                }
              >
                <Feather name="clock" size={14} color={colors.primary} />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {form.startTime
                    ? `Time: ${form.startTime}`
                    : "All-Day (No specific time)"}
                </Text>
                <Feather
                  name={
                    form.scheduleTimePickerVisible
                      ? "chevron-up"
                      : "chevron-down"
                  }
                  size={14}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
              {form.startTime && (
                <TouchableOpacity
                  onPress={() =>
                    update({
                      startTime: undefined,
                      durationMinutes: undefined,
                      scheduleTimePickerVisible: false,
                    })
                  }
                >
                  <Text
                    style={{
                      color: colors.error,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Clear Time
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {form.scheduleTimePickerVisible && (
              <View style={{ marginTop: 6 }}>
                <TimeSelectorDial
                  colors={colors}
                  initialHour={
                    form.startTime ? Number(form.startTime.split(":")[0]) : 9
                  }
                  initialMinute={
                    form.startTime ? Number(form.startTime.split(":")[1]) : 0
                  }
                  onSave={(h, m) => {
                    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    update({
                      startTime: formatted,
                      durationMinutes: form.durationMinutes || 60,
                      scheduleTimePickerVisible: false,
                    });
                  }}
                  saveLabel="Confirm Start Time"
                />
              </View>
            )}

            {form.startTime && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Duration:
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                >
                  {[30, 60, 90, 120].map((dur) => {
                    const isDurSelected = (form.durationMinutes || 60) === dur;
                    return (
                      <TouchableOpacity
                        key={dur}
                        style={[
                          styles.pill,
                          {
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            backgroundColor: isDurSelected
                              ? `${colors.primary}22`
                              : colors.cardLight,
                            borderColor: isDurSelected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        onPress={() => update({ durationMinutes: dur })}
                      >
                        <Text
                          style={{
                            color: isDurSelected ? colors.primary : colors.text,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {dur < 60
                            ? `${dur}m`
                            : dur % 60 === 0
                              ? `${dur / 60}h`
                              : `${dur / 60}h`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* === REMINDER (canonical — time only, no weekdays) === */}
      <View
        style={[
          styles.metaCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            padding: 12,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() =>
            update({ timePickerVisible: !form.timePickerVisible })
          }
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="bell" size={16} color={colors.primary} />
            <Text
              style={{
                color: colors.text,
                fontWeight: "600",
                marginLeft: 8,
              }}
            >
              Reminder
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {form.reminderTime
                ? `${String(form.reminderTime.hour).padStart(2, "0")}:${String(form.reminderTime.minute).padStart(2, "0")}`
                : "Off"}
            </Text>
            <Feather
              name={form.timePickerVisible ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
              style={{ marginLeft: 6 }}
            />
          </View>
        </TouchableOpacity>

        {form.timePickerVisible && (
          <View style={{ marginTop: 12 }}>
            <TimeSelectorDial
              colors={colors}
              initialHour={form.reminderTime?.hour ?? 9}
              initialMinute={form.reminderTime?.minute ?? 0}
              onSave={(h, m) => {
                const effectiveReminderDate =
                  form.reminderDate ||
                  (form.scheduleDate !== "inbox" ? form.scheduleDate : getDateKey());
                update({
                  reminderDate: effectiveReminderDate,
                  reminderTime: { hour: h, minute: m },
                  timePickerVisible: false,
                });
              }}
              saveLabel="Confirm Time"
            />
            <TouchableOpacity
              style={{ alignSelf: "center", marginTop: 8 }}
              onPress={() =>
                update({
                  reminderDate: undefined,
                  reminderTime: undefined,
                  timePickerVisible: false,
                })
              }
            >
              <Text
                style={{
                  color: colors.error,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                Disable Reminder
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* === REPEAT (canonical RecurrenceRule — weekdays live here only) === */}
      <View
        style={[
          styles.metaCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            padding: 12,
            gap: 12,
          },
        ]}
      >
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
          Repeat
        </Text>

        <View style={styles.recurrencePillsRow}>
          {["none", "daily", "weekly", "monthly", "custom"].map((r) => {
            const isSelected = form.recurrenceType === r;
            return (
              <TouchableOpacity
                key={r}
                style={[
                  styles.recurrencePillBtn,
                  {
                    backgroundColor: isSelected
                      ? `${colors.primary}22`
                      : colors.cardLight,
                    borderColor: isSelected
                      ? colors.primary
                      : "transparent",
                    borderWidth: 1,
                  },
                ]}
                onPress={() => update({ recurrenceType: r })}
              >
                <Text
                  style={{
                    color: isSelected ? colors.primary : colors.text,
                    fontSize: 12,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {form.recurrenceType === "weekly" && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Repeat on days:
            </Text>
            <View style={styles.daysSelectionRow}>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => {
                const isDaySelected = form.recurrenceDays.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.dayCircleBtn,
                      {
                        backgroundColor: isDaySelected
                          ? colors.primary
                          : colors.cardLight,
                        borderColor: isDaySelected
                          ? colors.primary
                          : colors.border,
                        borderWidth: 1,
                      },
                    ]}
                    onPress={() => toggleDay(idx)}
                  >
                    <Text
                      style={{
                        color: isDaySelected ? "#fff" : colors.text,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {form.recurrenceType === "monthly" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Day of month:
            </Text>
            <TextInput
              style={[
                textInputStyle,
                {
                  width: 60,
                  textAlign: "center",
                },
              ]}
              value={String(form.recurrenceDayOfMonth)}
              onChangeText={(val) => {
                const num = Number(val);
                if (!isNaN(num) && num >= 1 && num <= 31) {
                  update({ recurrenceDayOfMonth: num });
                }
              }}
              keyboardType="number-pad"
            />
          </View>
        )}

        {form.recurrenceType === "custom" && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Every how many days?
            </Text>
            <TextInput
              style={[
                textInputStyle,
                {
                  width: 80,
                  textAlign: "center",
                },
              ]}
              value={String(form.intervalVal)}
              onChangeText={(val) => {
                const num = Number(val);
                if (!isNaN(num) && num >= 1) {
                  update({ intervalVal: num });
                }
              }}
              keyboardType="number-pad"
            />
          </View>
        )}
      </View>

      {/* Cancel / Save buttons */}
      <View style={{ marginTop: Spacing.md, marginBottom: 40 }}>
        <DetailActions
          actions={[
            {
              key: "cancel",
              label: "Cancel",
              onPress: onCancel,
            },
            {
              key: "save",
              label: "Save",
              tone: "primary",
              disabled: !hasChanges,
              onPress: onSave,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
    marginLeft: 2,
  },
  textInput: {
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  notesInput: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  pillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  metaCard: {
    borderRadius: 20,
    borderWidth: 1.5,
  },
  recurrencePillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  recurrencePillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  daysSelectionRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
