import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Spacing } from "@/shared/constants/spacing";

export interface ChecklistDetailSkeletonProps {
  isLight?: boolean;
}

/**
 * Calm, tactile skeleton placeholder for the Checklist Details screen.
 * Displays immediate visual feedback matching the 2x2 grid, progress bar,
 * and checklist item geometry so the screen never displays a harsh blank cut.
 */
export const ChecklistDetailSkeleton: React.FC<ChecklistDetailSkeletonProps> = ({
  isLight = false,
}) => {
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.0, { duration: 850, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const placeholderBg = isLight
    ? "rgba(0, 0, 0, 0.08)"
    : "rgba(255, 255, 255, 0.10)";

  return (
    <Animated.View
      style={[styles.container, animatedStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading checklist details"
    >
      {/* Title Placeholder */}
      <View style={[styles.titleSkeleton, { backgroundColor: placeholderBg }]} />

      {/* 2x2 Meta Grid Skeleton */}
      <View style={styles.gridContainer}>
        <View style={styles.gridRow}>
          <View style={[styles.gridTile, { backgroundColor: placeholderBg }]} />
          <View style={[styles.gridTile, { backgroundColor: placeholderBg }]} />
        </View>
        <View style={styles.gridRow}>
          <View style={[styles.gridTile, { backgroundColor: placeholderBg }]} />
          <View style={[styles.gridTile, { backgroundColor: placeholderBg }]} />
        </View>
      </View>

      {/* Progress Bar Skeleton */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <View
            style={[styles.labelSkeleton, { width: 72, backgroundColor: placeholderBg }]}
          />
          <View
            style={[styles.labelSkeleton, { width: 36, backgroundColor: placeholderBg }]}
          />
        </View>
        <View
          style={[
            styles.progressTrack,
            {
              backgroundColor: isLight
                ? "rgba(0,0,0,0.06)"
                : "rgba(255, 255, 255, 0.08)",
            },
          ]}
        >
          <View
            style={[
              styles.progressBar,
              { width: "35%", backgroundColor: placeholderBg },
            ]}
          />
        </View>
        <View
          style={[
            styles.labelSkeleton,
            { width: 130, height: 11, backgroundColor: placeholderBg },
          ]}
        />
      </View>

      {/* Description Section Skeleton */}
      <View style={styles.sectionWrap}>
        <View
          style={[
            styles.labelSkeleton,
            { width: 85, backgroundColor: placeholderBg },
          ]}
        />
        <View
          style={[
            styles.lineSkeleton,
            { width: "90%", backgroundColor: placeholderBg },
          ]}
        />
        <View
          style={[
            styles.lineSkeleton,
            { width: "58%", backgroundColor: placeholderBg },
          ]}
        />
      </View>

      {/* Items Section Skeleton */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <View
            style={[styles.labelSkeleton, { width: 48, backgroundColor: placeholderBg }]}
          />
          <View
            style={[styles.labelSkeleton, { width: 40, backgroundColor: placeholderBg }]}
          />
        </View>
        {[1, 2, 3].map((key) => (
          <View key={key} style={styles.itemRow}>
            <View style={[styles.itemBox, { backgroundColor: placeholderBg }]} />
            <View
              style={[
                styles.itemText,
                {
                  width: key === 1 ? "68%" : key === 2 ? "85%" : "52%",
                  backgroundColor: placeholderBg,
                },
              ]}
            />
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xl,
  },
  titleSkeleton: {
    height: 30,
    width: "55%",
    borderRadius: 8,
    marginBottom: 4,
  },
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
    height: 62,
    borderRadius: 16,
  },
  sectionWrap: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelSkeleton: {
    height: 12,
    borderRadius: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  lineSkeleton: {
    height: 13,
    borderRadius: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  itemBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
  },
  itemText: {
    height: 15,
    borderRadius: 4,
  },
});
