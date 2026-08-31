import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { formatCurrentTimeLabel } from "@/features/calendar/hooks/useCalendarState";
import {
  calculateTimeYCoordinate,
  TimelineGap,
  STANDARD_HOUR_HEIGHT,
} from "@/features/calendar/utils/timelineCollapsibleLayout";

interface CurrentTimeIndicatorProps {
  hours: number;
  minutes: number;
  top?: number;
  activeCollapsedGaps?: TimelineGap[];
  hourHeight?: number;
  isLight: boolean;
}

const RED = "#EF4444";

export const CurrentTimeIndicator: React.FC<CurrentTimeIndicatorProps> = React.memo(({
  hours,
  minutes,
  top: propTop,
  activeCollapsedGaps = [],
  hourHeight = STANDARD_HOUR_HEIGHT,
  isLight,
}) => {
  const currentMinutes = hours * 60 + minutes;
  const topPos = propTop !== undefined
    ? propTop
    : calculateTimeYCoordinate(currentMinutes, activeCollapsedGaps, hourHeight) - 1;

  const label = formatCurrentTimeLabel(hours, minutes);

  return (
    <View
      style={[styles.container, { top: Math.max(0, topPos) }]}
      pointerEvents="none"
    >
      {/* Right-aligned time label */}
      <View style={styles.labelCol}>
        <Text style={styles.labelText} numberOfLines={1}>
          {label}
        </Text>
      </View>

      {/* Circle dot marker at the timeline edge */}
      <View style={styles.dot} />

      {/* 1.5px horizontal red timeline rule */}
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
    paddingRight: 10,
    justifyContent: "center",
  },
  labelText: {
    fontSize: 11,
    fontWeight: "700",
    color: RED,
    textAlign: "right",
    letterSpacing: 0.1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: RED,
    marginLeft: -3.5,
  },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: RED,
    opacity: 0.9,
  },
});
