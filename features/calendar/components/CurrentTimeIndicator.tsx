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

  return (
    <View
      style={[styles.container, { top: topPos }]}
      pointerEvents="none"
    >
      {/* Left Time Label (Aligned with hour labels in hourLabelCol) */}
      <View style={styles.labelWrapper}>
        <View
          style={[
            styles.labelBadge,
            {
              backgroundColor: isLight
                ? "#FEE2E2"
                : "rgba(239, 68, 68, 0.25)",
            },
          ]}
        >
          <Text style={styles.labelText} numberOfLines={1}>
            {formatCurrentTimeLabel(hours, minutes)}
          </Text>
        </View>
      </View>

      {/* Center Dot Marker (At the grid line boundary) */}
      <View style={styles.dotMarker} />

      {/* Horizontal Red Line (Spanning the task timeline grid) */}
      <View style={styles.horizontalLine} />
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
  labelWrapper: {
    width: 65,
    alignItems: "flex-end",
    paddingRight: 6,
    justifyContent: "center",
  },
  labelBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#EF4444",
    textAlign: "right",
    lineHeight: 11,
  },
  dotMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    marginLeft: -4,
  },
  horizontalLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#EF4444",
    borderRadius: 1,
  },
});
