import React from "react";
import { View, Pressable, StyleSheet, GestureResponderEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";

interface TimelineGridProps {
  hoursRange?: number[];
  colors: any;
  onPlaceAtTime: (hour: number, minute: number) => void;
}

const DEFAULT_HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatTimelineHour(hr: number): string {
  if (hr === 0) return "12 AM";
  if (hr === 12) return "12 PM";
  if (hr < 12) return `${hr} AM`;
  return `${hr - 12} PM`;
}

export const TimelineGrid: React.FC<TimelineGridProps> = React.memo(({
  hoursRange = DEFAULT_HOURS,
  colors,
  onPlaceAtTime,
}) => {
  return (
    <View style={styles.gridContainer}>
      {hoursRange.map((hr) => {
        const labelStr = formatTimelineHour(hr);
        const isNoonOrMidnight = hr === 0 || hr === 12;

        return (
          <View key={hr} style={styles.hourRow}>
            {/* Hour label — right-aligned, pinned cleanly to top boundary */}
            <View style={styles.hourLabelCol}>
              <Text
                style={[
                  styles.hourLabelText,
                  {
                    color: isNoonOrMidnight ? colors.text : colors.textMuted,
                    fontWeight: isNoonOrMidnight ? "700" : "500",
                  },
                ]}
                numberOfLines={1}
              >
                {labelStr}
              </Text>
            </View>

            {/* Tappable grid line / cell */}
            <Pressable
              onPress={(e: GestureResponderEvent) => {
                const locationY = e.nativeEvent.locationY;
                const minuteIndex = Math.min(3, Math.max(0, Math.floor(locationY / 20)));
                const minute = minuteIndex * 15;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onPlaceAtTime(hr, minute);
              }}
              accessibilityLabel={`Place task at ${labelStr}`}
              style={[
                styles.hourLineCol,
                {
                  borderTopColor: isNoonOrMidnight
                    ? colors.border
                    : `${colors.border}80`,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
});

TimelineGrid.displayName = "TimelineGrid";

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: "column",
  },
  hourRow: {
    flexDirection: "row",
    height: 80,
  },
  hourLabelCol: {
    width: 65,
    alignItems: "flex-end",
    paddingRight: 12,
    justifyContent: "flex-start",
    marginTop: -7, // Aligns center of text with the horizontal grid line
  },
  hourLabelText: {
    fontSize: 11,
    textAlign: "right",
    letterSpacing: 0.2,
  },
  hourLineCol: {
    flex: 1,
    borderStyle: "solid",
  },
});
