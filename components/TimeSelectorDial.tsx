import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet,  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";

interface TimeSelectorDialProps {
  initialHour?: number;
  initialMinute?: number;
  initialDays?: number[];
  colors: any;
  onSave: (hour: number, minute: number, days?: number[]) => void;
  saveLabel?: string;
  dayLabels?: string[];
}

export function TimeSelectorDial({
  initialHour = 7,
  initialMinute = 0,
  initialDays = [],
  colors,
  onSave,
  saveLabel = "Set Schedule",
  dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
}: TimeSelectorDialProps) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [days, setDays] = useState<number[]>(initialDays);

  useEffect(() => {
    setHour(initialHour);
    setMinute(initialMinute);
    setDays(initialDays);
  }, [initialHour, initialMinute, initialDays]);

  const addMinutesToTime = (offset: number) => {
    const totalMinutes = hour * 60 + minute + offset;
    const newHour = Math.floor(totalMinutes / 60) % 24;
    const newMinute = totalMinutes % 60;
    setHour(newHour >= 0 ? newHour : (newHour + 24) % 24);
    setMinute(newMinute >= 0 ? newMinute : (newMinute + 60) % 60);
  };

  const toggleDay = (idx: number) => {
    setDays((curr) =>
      curr.includes(idx) ? curr.filter((d) => d !== idx) : [...curr, idx],
    );
  };

  return (
    <View style={styles.customPicker}>
      <View style={styles.timeSelectWrap}>
        <View
          style={[
            styles.timeCol,
            {
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              borderColor: colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setHour((prev) => (prev + 1) % 24)}
            style={styles.chevronBtn}
            hitSlop={6}
          >
            <Feather name="chevron-up" size={20} color={colors.text} />
          </Pressable>
          <Text style={[styles.timeText, { color: colors.text }]}>
            {String(hour).padStart(2, "0")}
          </Text>
          <Pressable
            onPress={() => setHour((prev) => (prev - 1 + 24) % 24)}
            style={styles.chevronBtn}
            hitSlop={6}
          >
            <Feather name="chevron-down" size={20} color={colors.text} />
          </Pressable>
        </View>

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 24,
            marginHorizontal: 12,
            alignSelf: "center",
          }}
        >
          :
        </Text>

        <View
          style={[
            styles.timeCol,
            {
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              borderColor: colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setMinute((prev) => (prev + 1) % 60)}
            style={styles.chevronBtn}
            hitSlop={6}
          >
            <Feather name="chevron-up" size={20} color={colors.text} />
          </Pressable>
          <Text style={[styles.timeText, { color: colors.text }]}>
            {String(minute).padStart(2, "0")}
          </Text>
          <Pressable
            onPress={() => setMinute((prev) => (prev - 1 + 60) % 60)}
            style={styles.chevronBtn}
            hitSlop={6}
          >
            <Feather name="chevron-down" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.presetOffsetsRow}>
        <Pressable
          onPress={() => addMinutesToTime(15)}
          style={[
            styles.offsetBtn,
            {
              backgroundColor: colors.cardLight,
              borderColor: "rgba(255, 255, 255, 0.05)",
            },
          ]}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
            +15m
          </Text>
        </Pressable>
        <Pressable
          onPress={() => addMinutesToTime(30)}
          style={[
            styles.offsetBtn,
            {
              backgroundColor: colors.cardLight,
              borderColor: "rgba(255, 255, 255, 0.05)",
            },
          ]}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
            +30m
          </Text>
        </Pressable>
        <Pressable
          onPress={() => addMinutesToTime(60)}
          style={[
            styles.offsetBtn,
            {
              backgroundColor: colors.cardLight,
              borderColor: "rgba(255, 255, 255, 0.05)",
            },
          ]}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
            +1h
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const now = new Date();
            setHour(now.getHours());
            setMinute(now.getMinutes());
          }}
          style={[
            styles.offsetBtn,
            {
              backgroundColor: `${colors.error}15`,
              borderColor: "rgba(255, 255, 255, 0.05)",
            },
          ]}
        >
          <Text
            style={{ fontSize: 12, fontWeight: "600", color: colors.error }}
          >
            Now
          </Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {dayLabels.map((label, idx) => {
          const selected = days.includes(idx);
          return (
            <Pressable
              key={label}
              onPress={() => toggleDay(idx)}
              style={[
                styles.weekdayCircle,
                {
                  backgroundColor: selected ? colors.primary : "transparent",
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? "#ffffff" : colors.text,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {label.slice(0, 2)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => onSave(hour, minute, days.length > 0 ? days : undefined)}
        style={[styles.setAlarmBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: "#ffffff", fontWeight: "700" }}>{saveLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  customPicker: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 12,
  },
  timeSelectWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  timeCol: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    minWidth: 70,
  },
  chevronBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 28,
    fontWeight: "700",
    marginVertical: 2,
    fontVariant: ["tabular-nums"],
  },
  presetOffsetsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 8,
  },
  offsetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  weekdayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  setAlarmBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
});
