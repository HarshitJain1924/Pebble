import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette } from "@/shared/constants/theme";

export interface ChecklistProgressBarProps {
  completedCount: number;
  totalCount: number;
  isLight: boolean;
  colors: any;
  accentColor?: string;
}

export const ChecklistProgressBar: React.FC<ChecklistProgressBarProps> = ({
  completedCount,
  totalCount,
  isLight,
  colors,
  accentColor = "#E07A5F",
}) => {
  const progress = totalCount > 0 ? completedCount / totalCount : 0;
  const progressPercent = Math.round(progress * 100);

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <Text
          style={[
            styles.sectionLabel,
            { color: isLight ? colors.textMuted : "rgba(255,255,255,0.6)" },
          ]}
        >
          PROGRESS
        </Text>
        <Text
          style={[
            styles.progressPercent,
            { color: isLight ? colors.text : Palette.white },
          ]}
        >
          {`${progressPercent}%`}
        </Text>
      </View>

      <View
        style={[
          styles.progressTrack,
          {
            backgroundColor: isLight
              ? "rgba(0,0,0,0.08)"
              : "rgba(255, 255, 255, 0.12)",
          },
        ]}
      >
        <View
          style={[
            styles.progressBar,
            { width: `${progress * 100}%`, backgroundColor: accentColor },
          ]}
        />
        <View
          style={[
            styles.progressThumb,
            {
              left: `${Math.min(Math.max(progress * 100, 2), 98)}%`,
              borderColor: accentColor,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.progressSubtitle,
          { color: isLight ? colors.textMuted : "rgba(255,255,255,0.5)" },
        ]}
      >
        {`${completedCount} of ${totalCount} completed`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionWrap: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: "700",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    position: "relative",
    justifyContent: "center",
    overflow: "visible",
    marginTop: 4,
    marginBottom: 4,
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  progressThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: "#FFFFFF",
    borderWidth: 2.5,
    borderColor: "#E07A5F",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  progressSubtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
});
