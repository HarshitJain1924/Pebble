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

// Hours that get full "12 PM" style labels — others get condensed numeric label
const MAJOR_HOURS = new Set([0, 6, 12, 18]);

function formatHourLabel(hr: number): string {
  if (hr === 0) return "12 AM";
  if (hr === 12) return "12 PM";
  if (hr < 12) return `${hr} AM`;
  return `${hr - 12} PM`;
}

function formatMinorLabel(hr: number): string {
  if (hr === 0) return "12";
  if (hr === 12) return "12";
  return hr < 12 ? `${hr}` : `${hr - 12}`;
}

export const TimelineGrid: React.FC<TimelineGridProps> = React.memo(({
  hoursRange = DEFAULT_HOURS,
  colors,
  onPlaceAtTime,
}) => {
  return (
    <View style={styles.gridContainer}>
      {hoursRange.map((hr) => {
        const isMajor = MAJOR_HOURS.has(hr);
        const labelStr = isMajor ? formatHourLabel(hr) : formatMinorLabel(hr);

        return (
          <View key={hr} style={styles.hourRow}>
            {/* Hour label — right-aligned, pinned to top of row */}
            <View style={styles.hourLabelCol}>
              <Text
                style={[
                  isMajor ? styles.majorLabel : styles.minorLabel,
                  { color: isMajor ? colors.textMuted : colors.textMuted + "80" },
                ]}
                numberOfLines={1}
              >
                {labelStr}
              </Text>
            </View>

            {/* Tappable grid cell — hairline top border */}
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
                  borderTopColor: isMajor
                    ? colors.border
                    : (colors.border + "60"),
                  borderTopWidth: isMajor ? StyleSheet.hairlineWidth * 1.5 : StyleSheet.hairlineWidth,
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
    paddingRight: 10,
    paddingTop: 0,
    // Labels pin to top of cell — gives sense of time flowing downward
    justifyContent: "flex-start",
    paddingVertical: 0,
    marginTop: -6, // Offset so label aligns with the grid line, not below it
  },
  majorLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
  },
  minorLabel: {
    fontSize: 9,
    fontWeight: "400",
    textAlign: "right",
  },
  hourLineCol: {
    flex: 1,
    borderStyle: "solid",
  },
});
