import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import {
  calculateCurrentTimePosition,
  formatCurrentTimeLabel,
} from "@/features/calendar/hooks/useCalendarState";

interface CurrentTimeIndicatorProps {
  hours: number;
  minutes: number;
  hourHeight?: number;
  isLight: boolean;
}

const RED = "#EF4444";

export const CurrentTimeIndicator: React.FC<CurrentTimeIndicatorProps> = React.memo(({
  hours,
  minutes,
  hourHeight = 80,
  isLight,
}) => {
  const topPos = Math.max(
    0,
    Math.min(
      24 * hourHeight - 2,
      calculateCurrentTimePosition(hours, minutes, hourHeight) - 1,
    ),
  );

  const label = formatCurrentTimeLabel(hours, minutes);

  return (
    <View
      style={[styles.container, { top: topPos }]}
      pointerEvents="none"
    >
      {/* Right-aligned time label — sits in the label column naturally */}
      <View style={styles.labelCol}>
        <Text style={styles.labelText} numberOfLines={1}>
          {label}
        </Text>
      </View>

      {/* Small dot marker at the grid edge */}
      <View style={styles.dot} />

      {/* Thin horizontal line across the timeline */}
      <View style={styles.line} />
    </View>
  );
});

CurrentTimeIndicator.displayName = "CurrentTimeIndicator";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: -65,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 30,
  },
  labelCol: {
    width: 65,
    alignItems: "flex-end",
    paddingRight: 8,
    justifyContent: "center",
  },
  labelText: {
    fontSize: 10,
    fontWeight: "600",
    color: RED,
    textAlign: "right",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: RED,
    marginLeft: -3,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: RED,
    opacity: 0.85,
  },
});
