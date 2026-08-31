import * as Haptics from "expo-haptics";
import React from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { Feather } from "@expo/vector-icons";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { TimeSelectorDial } from "@/shared/components/ui/TimeSelectorDial";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type { Resource } from "@/shared/types/domain.types";
import { getDateKey } from "@/services/scheduling/recurrence.service";
import type { ChecklistFormState } from "@/features/details/checklist/hooks/useChecklistDetailForm";

export interface ChecklistDetailFormProps {
  form: ChecklistFormState;
  update: (patch: Partial<ChecklistFormState>) => void;
  toggleDay?: (idx: number) => void;
  addItem: () => void;
  setNewItemText: (text: string) => void;
  deleteItem: (id: string) => void;
  renameItem: (id: string, text: string) => void;
  moveItemUp: (index: number) => void;
  moveItemDown: (index: number) => void;
  toggleResource: (resId: string) => void;
  currentWorkspace: { name: string; emoji?: string };
  linkedResources: Resource[];
  onOpenWorkspacePicker: () => void;
  onOpenLinkPicker: () => void;
}

/**
 * Edit-mode form for a Checklist. Owns the checklist-specific editors: title /
 * description inputs, workspace dropdown, the checklist items editor
 * (reorder / rename / add / remove), schedule / reminder / repeat editors,
 * and the linked-resources editor. All mutations are local form-state updates;
 * persistence happens on Save via the content's EntityCommandService calls.
 */
export const ChecklistDetailForm: React.FC<ChecklistDetailFormProps> = ({
  form,
  update,
  toggleDay,
  addItem,
  setNewItemText,
  deleteItem,
  renameItem,
  moveItemUp,
  moveItemDown,
  toggleResource,
  currentWorkspace,
  linkedResources,
  onOpenWorkspacePicker,
  onOpenLinkPicker,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={{ gap: 20, paddingBottom: 80 }}>
      {/* Title input */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          TITLE
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
          value={form.title}
          onChangeText={(t) => update({ title: t })}
          placeholder="Checklist Title (e.g. Weekly Groceries)"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Description input */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          DESCRIPTION / NOTES
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.card,
              minHeight: 80,
            },
          ]}
          value={form.description}
          onChangeText={(t) => update({ description: t })}
          placeholder="Add notes or description..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Workspace Selection dropdown */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          WORKSPACE
        </Text>
        <TouchableOpacity
          onPress={onOpenWorkspacePicker}
          style={[
            styles.textInput,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select workspace"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 15 }}>
              {currentWorkspace.emoji || "📁"}
            </Text>
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}
            >
              {currentWorkspace.name}
            </Text>
          </View>
          <Feather name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Checklist Items Editor */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          CHECKLIST ITEMS
        </Text>

        <View style={{ gap: 8 }}>
          {form.items.map((cIt, idx) => (
            <View
              key={cIt.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 8,
                paddingVertical: 4,
                gap: 4,
              }}
            >
              {/* Reordering Up/Down controls */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => moveItemUp(idx)}
                  disabled={idx === 0}
                  style={{ padding: 6, opacity: idx === 0 ? 0.3 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move item up`}
                >
                  <Feather name="chevron-up" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveItemDown(idx)}
                  disabled={idx === form.items.length - 1}
                  style={{
                    padding: 6,
                    opacity: idx === form.items.length - 1 ? 0.3 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move item down`}
                >
                  <Feather name="chevron-down" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Inline Item Title input */}
              <TextInput
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "500",
                  paddingVertical: 8,
                  paddingHorizontal: 4,
                }}
                value={cIt.title}
                onChangeText={(txt) => renameItem(cIt.id, txt)}
                placeholder="Item name..."
                placeholderTextColor={colors.textMuted}
              />

              {/* Delete Item button */}
              <TouchableOpacity
                onPress={() => deleteItem(cIt.id)}
                style={{ padding: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Delete item`}
              >
                <Feather name="trash" size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add New Item row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              paddingVertical: 4,
              marginTop: 4,
            }}
          >
            <TextInput
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 14,
                paddingVertical: 8,
              }}
              value={form.newItemText}
              onChangeText={setNewItemText}
              placeholder="Add item..."
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={addItem}
              accessibilityLabel="Add checklist item"
            />
            <TouchableOpacity
              onPress={addItem}
              style={{ padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Feather name="plus" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* === SCHEDULE & TIMING SECTION === */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          SCHEDULE & TIMING
        </Text>
        <View style={styles.pillsContainer}>
          {[
            { label: "Unscheduled", key: "inbox" },
            { label: "Today", key: getDateKey() },
            {
              label: "Tomorrow",
              key: getDateKey(new Date(Date.now() + 86400000)),
            },
          ].map((item) => {
            const isSelected = form.scheduleDate === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected
                      ? `${colors.primary}22`
                      : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() =>
                  update({
                    scheduleDate: item.key,
                    showDatePicker: false,
                  })
                }
              >
                <Text
                  style={{
                    color: isSelected ? colors.primary : colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {item.label}
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
                  ![
                    "inbox",
                    getDateKey(),
                    getDateKey(new Date(Date.now() + 86400000)),
                  ].includes(form.scheduleDate)
                    ? `${colors.primary}22`
                    : colors.card,
                borderColor:
                  form.showDatePicker ||
                  ![
                    "inbox",
                    getDateKey(),
                    getDateKey(new Date(Date.now() + 86400000)),
                  ].includes(form.scheduleDate)
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
              {![
                "inbox",
                getDateKey(),
                getDateKey(new Date(Date.now() + 86400000)),
              ].includes(form.scheduleDate)
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
              current={
                form.scheduleDate !== "inbox" ? form.scheduleDate : undefined
              }
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
                      durationMinutes: form.durationMinutes || 45,
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
                  {[30, 45, 60, 90, 120].map((dur) => {
                    const isDurSelected = (form.durationMinutes || 45) === dur;
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
                              : colors.card,
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
                          {dur < 60 ? `${dur}m` : `${dur / 60}h`}
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

      {/* === REMINDER SECTION === */}
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
          onPress={() => update({ timePickerVisible: !form.timePickerVisible })}
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
                  (form.scheduleDate !== "inbox"
                    ? form.scheduleDate
                    : getDateKey());
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

      {/* === REPEAT / RECURRENCE SECTION === */}
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
                      : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
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

        {form.recurrenceType === "weekly" && toggleDay && (
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
                          : colors.card,
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginTop: 4,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Day of month:
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  width: 60,
                  textAlign: "center",
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
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
                styles.textInput,
                {
                  width: 80,
                  textAlign: "center",
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
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

      {/* Resource Linking Section */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          LINKED RESOURCES
        </Text>

        <View style={{ gap: 8 }}>
          {linkedResources.map((res) => (
            <View
              key={res.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 16 }}>
                  {res.type === "link"
                    ? "🔗"
                    : (res.type as string) === "image"
                      ? "🖼"
                      : "📝"}
                </Text>
                <View>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {res.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {(res as any).collectionName || "Resource"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  toggleResource(res.id);
                }}
                style={{ padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Unlink ${res.title}`}
              >
                <Feather name="x" size={16} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Link-a-resource button */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              marginTop: 4,
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              onOpenLinkPicker();
            }}
            accessibilityRole="button"
            accessibilityLabel="Link a Resource List"
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <Text
              style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}
            >
              Link a Resource List
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrap: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: "700" },
  textInput: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  metaCard: {
    borderRadius: 14,
    borderWidth: 1,
  },
  recurrencePillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  recurrencePillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  daysSelectionRow: {
    flexDirection: "row",
    gap: 8,
  },
  dayCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
