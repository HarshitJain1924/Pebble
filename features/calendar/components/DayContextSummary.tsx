import React from "react";
import { View, StyleSheet } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";

interface DayContextSummaryProps {
  scheduledCount: number;
  plannedMinutes: number;
  freeMinutes: number;
  colors: any;
  isLight: boolean;
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

export const DayContextSummary: React.FC<DayContextSummaryProps> = React.memo(({
  scheduledCount,
  plannedMinutes,
  freeMinutes,
  colors,
  isLight,
}) => {
  const plannedText = formatDuration(plannedMinutes);
  const freeText = formatDuration(freeMinutes);

  let summaryText = "";
  if (scheduledCount === 0) {
    summaryText = freeMinutes > 0
      ? `0 scheduled · ${freeText} open`
      : "0 scheduled · Free day";
  } else {
    summaryText = `${scheduledCount} scheduled · ${plannedText} planned${
      freeMinutes > 0 ? ` · ${freeText} free` : ""
    }`;
  }

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.summaryText,
          { color: colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {summaryText}
      </Text>
    </View>
  );
});

DayContextSummary.displayName = "DayContextSummary";

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 2,
    marginTop: 2,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
});
