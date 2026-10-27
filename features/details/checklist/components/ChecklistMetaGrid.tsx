import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette } from "@/shared/constants/theme";
import type { Checklist } from "@/shared/types/domain.types";
import { getRecurrenceLabel } from "@/services/scheduling/recurrence.service";
import { formatReminderDisplay } from "@/services/scheduling/schedule-formatter";
import { LiquidGlassSurface } from "@/shared/components/ui/LiquidGlassSurface";

export interface ChecklistMetaGridProps {
  item: Checklist;
  createdDate: string;
  scheduleDisplay: string;
  isLight: boolean;
  colors: any;
}

const formatDisplayDate = (dateVal?: string | number): string => {
  if (!dateVal) return "";
  try {
    let d: Date;
    if (typeof dateVal === "number") {
      d = new Date(dateVal);
    } else if (typeof dateVal === "string" && dateVal.includes("-")) {
      const parts = dateVal.split("-").map(Number);
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(dateVal);
    }
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateVal);
  }
};

const formatTimeDisplay = (timeStr?: string): string => {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMin = String(m).padStart(2, "0");
  return `${displayHour}:${displayMin} ${period}`;
};

export const ChecklistMetaGrid: React.FC<ChecklistMetaGridProps> = ({
  item,
  createdDate,
  scheduleDisplay,
  isLight,
  colors,
}) => {
  const startDateStr = item.schedule?.date
    ? formatDisplayDate(item.schedule.date)
    : item.createdAt
      ? formatDisplayDate(item.createdAt)
      : "Today";

  const endDateStr = item.schedule?.date
    ? formatDisplayDate(item.schedule.date)
    : item.recurrence
      ? getRecurrenceLabel(item.recurrence) || "Recurring"
      : "No deadline";

  const startTimeStr = item.schedule?.startTime
    ? formatTimeDisplay(item.schedule.startTime)
    : item.reminder?.triggerAt
      ? formatReminderDisplay(item.reminder.triggerAt)
      : "All Day";

  const endTimeStr = item.recurrence
    ? getRecurrenceLabel(item.recurrence) || "None"
    : item.schedule?.endTime
      ? formatTimeDisplay(item.schedule.endTime)
      : item.schedule?.startTime
        ? `${formatTimeDisplay(item.schedule.startTime)} +45m`
        : "None";

  const glassTint = isLight
    ? "rgba(0, 0, 0, 0.03)"
    : "rgba(255, 255, 255, 0.045)";

  const tileBorderStyles = isLight
    ? {
        borderTopColor: "rgba(0, 0, 0, 0.08)",
        borderLeftColor: "rgba(0, 0, 0, 0.05)",
        borderRightColor: "rgba(0, 0, 0, 0.05)",
        borderBottomColor: "rgba(0, 0, 0, 0.12)",
      }
    : {
        borderTopColor: "rgba(255, 255, 255, 0.18)",
        borderLeftColor: "rgba(255, 255, 255, 0.08)",
        borderRightColor: "rgba(255, 255, 255, 0.05)",
        borderBottomColor: "rgba(0, 0, 0, 0.35)",
      };

  return (
    <View style={styles.gridContainer}>
      <Text style={styles.srOnly}>SCHEDULE & TIMING</Text>
      <View style={styles.gridRow}>
        <LiquidGlassSurface
          borderRadius={16}
          style={[styles.gridTile, tileBorderStyles]}
          tintColor={glassTint}
          intensity={50}
          blurRadius={20}
          dim={isLight ? 0 : 0.12}
          thickness={0.85}
          edgeReflectionStrength={0.4}
        >
          <Feather
            name="calendar"
            size={18}
            color={isLight ? colors.textMuted : "rgba(255,255,255,0.65)"}
          />
          <View style={styles.tileCol}>
            <Text
              style={[
                styles.tileLabel,
                { color: isLight ? colors.textMuted : "rgba(255,255,255,0.55)" },
              ]}
            >
              Start Date
            </Text>
            <Text
              style={[
                styles.tileValue,
                { color: isLight ? colors.text : Palette.white },
              ]}
              numberOfLines={1}
            >
              {startDateStr}
            </Text>
            <Text style={styles.srOnly}>Schedule</Text>
            <Text style={styles.srOnly}>{scheduleDisplay}</Text>
          </View>
        </LiquidGlassSurface>

        <LiquidGlassSurface
          borderRadius={16}
          style={[styles.gridTile, tileBorderStyles]}
          tintColor={glassTint}
          intensity={50}
          blurRadius={20}
          dim={isLight ? 0 : 0.12}
          thickness={0.85}
          edgeReflectionStrength={0.4}
        >
          <Feather
            name="calendar"
            size={18}
            color={isLight ? colors.textMuted : "rgba(255,255,255,0.65)"}
          />
          <View style={styles.tileCol}>
            <Text
              style={[
                styles.tileLabel,
                { color: isLight ? colors.textMuted : "rgba(255,255,255,0.55)" },
              ]}
            >
              End Date
            </Text>
            <Text
              style={[
                styles.tileValue,
                { color: isLight ? colors.text : Palette.white },
              ]}
              numberOfLines={1}
            >
              {endDateStr}
            </Text>
          </View>
        </LiquidGlassSurface>
      </View>

      <View style={styles.gridRow}>
        <LiquidGlassSurface
          borderRadius={16}
          style={[styles.gridTile, tileBorderStyles]}
          tintColor={glassTint}
          intensity={50}
          blurRadius={20}
          dim={isLight ? 0 : 0.12}
          thickness={0.85}
          edgeReflectionStrength={0.4}
        >
          <Feather
            name="clock"
            size={18}
            color={isLight ? colors.textMuted : "rgba(255,255,255,0.65)"}
          />
          <View style={styles.tileCol}>
            <Text
              style={[
                styles.tileLabel,
                { color: isLight ? colors.textMuted : "rgba(255,255,255,0.55)" },
              ]}
            >
              Start Time
            </Text>
            <Text
              style={[
                styles.tileValue,
                { color: isLight ? colors.text : Palette.white },
              ]}
              numberOfLines={1}
            >
              {startTimeStr}
            </Text>
          </View>
        </LiquidGlassSurface>

        <LiquidGlassSurface
          borderRadius={16}
          style={[styles.gridTile, tileBorderStyles]}
          tintColor={glassTint}
          intensity={50}
          blurRadius={20}
          dim={isLight ? 0 : 0.12}
          thickness={0.85}
          edgeReflectionStrength={0.4}
        >
          <Feather
            name={item.recurrence ? "repeat" : "clock"}
            size={18}
            color={isLight ? colors.textMuted : "rgba(255,255,255,0.65)"}
          />
          <View style={styles.tileCol}>
            <Text
              style={[
                styles.tileLabel,
                { color: isLight ? colors.textMuted : "rgba(255,255,255,0.55)" },
              ]}
            >
              {item.recurrence ? "Repeat" : "End Time"}
            </Text>
            <Text
              style={[
                styles.tileValue,
                { color: isLight ? colors.text : Palette.white },
              ]}
              numberOfLines={1}
            >
              {endTimeStr}
            </Text>
            {item.recurrence ? (
              <>
                <Text style={styles.srOnly}>Repeat</Text>
                <Text style={styles.srOnly}>
                  {getRecurrenceLabel(item.recurrence)}
                </Text>
              </>
            ) : null}
          </View>
        </LiquidGlassSurface>
      </View>
      <Text style={styles.srOnly}>{createdDate}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    gap: 10,
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
  },
  gridTile: {
    flex: 1,
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  tileCol: {
    flex: 1,
    gap: 2,
  },
  tileLabel: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  tileValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    opacity: 0,
  },
});
