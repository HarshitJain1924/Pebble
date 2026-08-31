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

export const TimelineGrid: React.FC<TimelineGridProps> = React.memo(({
  hoursRange = DEFAULT_HOURS,
  colors,
  onPlaceAtTime,
}) => {
  return (
    <View style={styles.gridContainer}>
      {hoursRange.map((hr) => {
        const displayHour = hr === 12 ? 12 : hr % 12;
        const ampm = hr >= 12 ? "PM" : "AM";
        const timeStr = `${displayHour} ${ampm}`;

        return (
          <View key={hr} style={styles.hourRow}>
            <View style={styles.hourLabelCol}>
              <Text
                style={[
                  styles.hourLabelText,
                  { color: colors.textMuted },
                ]}
              >
                {timeStr}
              </Text>
            </View>
            <Pressable
              onPress={(e: GestureResponderEvent) => {
                const locationY = e.nativeEvent.locationY;
                const minuteIndex = Math.min(
                  3,
                  Math.max(0, Math.floor(locationY / 20)),
                );
                const minute = minuteIndex * 15;
                Haptics.impactAsync(
                  Haptics.ImpactFeedbackStyle.Light,
                ).catch(() => {});
                onPlaceAtTime(hr, minute);
              }}
              accessibilityLabel={`Place task at ${timeStr}`}
              style={[
                styles.hourLineCol,
                { borderColor: colors.border },
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
    paddingRight: 10,
    paddingTop: 0,
  },
  hourLabelText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  hourLineCol: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
});
