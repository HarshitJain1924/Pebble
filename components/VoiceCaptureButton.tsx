import React, { useEffect } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import PressableScale from "@/components/ui/PressableScale";
import { VoiceCaptureStatus } from "@/hooks/useVoiceCapture"; // Wait! We created hooks/useVoiceCapture.ts. Let's make sure the path is correct.

interface VoiceCaptureButtonProps {
  status: VoiceCaptureStatus;
  volume: number; // 0 to 1
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  themePrimary: string;
}

export function VoiceCaptureButton({
  status,
  volume,
  onStart,
  onStop,
  onCancel,
  themePrimary = "#8B5CF6",
}: VoiceCaptureButtonProps) {
  const idleScale = useSharedValue(1);

  // Breathing effect when idle
  useEffect(() => {
    if (status === "idle") {
      idleScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1500 }),
          withTiming(0.94, { duration: 1500 })
        ),
        -1,
        true
      );
    } else {
      idleScale.value = withSpring(1);
    }
  }, [status]);

  // Volume-driven glow ring styles
  const glowStyle = useAnimatedStyle(() => {
    if (status !== "listening") {
      return { opacity: 0, transform: [{ scale: 0.8 }] };
    }
    const scale = withSpring(1 + volume * 0.85, { damping: 15, stiffness: 180 });
    const opacity = withTiming(0.4 - volume * 0.15, { duration: 80 });
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const buttonStyle = useAnimatedStyle(() => {
    let scale = idleScale.value;
    if (status === "listening") {
      scale = withSpring(1.08);
    }
    return {
      transform: [{ scale }],
    };
  });

  const handlePress = () => {
    if (status === "idle") {
      onStart();
    } else if (status === "listening") {
      onStop();
    } else if (status === "error" || status === "completed") {
      onStart();
    }
  };

  // Render the center icon based on status
  const renderIcon = () => {
    switch (status) {
      case "listening":
        return <Feather name="square" size={16} color="#fff" />;
      case "processing":
        return <ActivityIndicator size="small" color="#fff" />;
      case "completed":
        return <Feather name="check" size={18} color="#fff" />;
      case "error":
        return <Feather name="alert-circle" size={18} color="#fff" />;
      case "idle":
      default:
        return <Feather name="mic" size={18} color="#fff" />;
    }
  };

  // Background color of the mic button circle
  const getButtonBgColor = () => {
    switch (status) {
      case "listening":
        return "#EF4444"; // Red for recording
      case "error":
        return "#DC2626"; // Dark Red for error
      case "completed":
        return "#10B981"; // Green for completed
      case "processing":
        return "#6366F1"; // Indigo/Purple for processing
      case "idle":
      default:
        return themePrimary; // Brand purple
    }
  };

  // Waveform bars driven by volume
  const getBarHeight = (multiplier: number, offset: number) => {
    return 6 + volume * multiplier + offset;
  };

  return (
    <View style={styles.container}>
      {/* Real-time sound wave indicator when listening */}
      {status === "listening" && (
        <View style={styles.equalizer}>
          <View style={[styles.eqBar, { height: getBarHeight(14, 2) }]} />
          <View style={[styles.eqBar, { height: getBarHeight(24, 4) }]} />
          <View style={[styles.eqBar, { height: getBarHeight(18, 3) }]} />
        </View>
      )}

      {/* Button & Pulsing Glow Ring */}
      <View style={styles.buttonWrapper}>
        <Animated.View style={[styles.glowRing, { backgroundColor: getButtonBgColor() }, glowStyle]} />
        
        <PressableScale onPress={handlePress} haptic>
          <Animated.View
            style={[
              styles.micCircle,
              { backgroundColor: getButtonBgColor() },
              buttonStyle,
            ]}
          >
            {renderIcon()}
          </Animated.View>
        </PressableScale>
      </View>

      {/* Equalizer on the right side for balance */}
      {status === "listening" && (
        <View style={styles.equalizer}>
          <View style={[styles.eqBar, { height: getBarHeight(18, 3) }]} />
          <View style={[styles.eqBar, { height: getBarHeight(24, 4) }]} />
          <View style={[styles.eqBar, { height: getBarHeight(14, 2) }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonWrapper: {
    position: "relative",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  micCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 2,
  },
  glowRing: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: 1,
  },
  equalizer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    width: 25,
    justifyContent: "center",
  },
  eqBar: {
    width: 2.5,
    borderRadius: 1.25,
    backgroundColor: "#EF4444",
  },
});
