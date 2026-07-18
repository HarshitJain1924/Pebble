import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// iOS-like spring configurations
const SPRING_CONFIG = {
  damping: 24,
  stiffness: 220,
  mass: 1,
};

interface AnimatedOverlayProps {
  visible: boolean;
  onClose: () => void;
  type: "bottom-sheet" | "center-modal";
  children: (close: () => void) => React.ReactNode;
}

export const AnimatedOverlay: React.FC<AnimatedOverlayProps> = ({
  visible,
  onClose,
  type,
  children,
}) => {
  const [modalVisible, setModalVisible] = useState(visible);

  // Reanimated shared values
  const backdropOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(SCREEN_HEIGHT * 0.5);
  const contentScale = useSharedValue(0.95);
  const contentOpacity = useSharedValue(0);

  // Sync prop visibility changes
  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      // Trigger entering animations
      backdropOpacity.value = withTiming(1, { duration: 250 });
      if (type === "bottom-sheet") {
        contentTranslateY.value = withSpring(0, SPRING_CONFIG);
      } else {
        contentScale.value = withSpring(1, SPRING_CONFIG);
        contentOpacity.value = withTiming(1, { duration: 200 });
      }
    }
  }, [visible, type, backdropOpacity, contentTranslateY, contentScale, contentOpacity]);

  const handleClose = () => {
    // Trigger exiting animations
    backdropOpacity.value = withTiming(0, { duration: 200 });
    
    const onAnimationEnd = (finished?: boolean) => {
      if (finished) {
        runOnJS(setModalVisible)(false);
        runOnJS(onClose)();
      }
    };

    if (type === "bottom-sheet") {
      contentTranslateY.value = withSpring(
        SCREEN_HEIGHT * 0.5,
        SPRING_CONFIG,
        onAnimationEnd
      );
    } else {
      contentOpacity.value = withTiming(0, { duration: 150 });
      contentScale.value = withSpring(
        0.95,
        SPRING_CONFIG,
        onAnimationEnd
      );
    }
  };

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => {
    if (type === "bottom-sheet") {
      return {
        transform: [{ translateY: contentTranslateY.value }],
      };
    } else {
      return {
        opacity: contentOpacity.value,
        transform: [{ scale: contentScale.value }],
      };
    }
  });

  if (!modalVisible) return null;

  const content = (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
        <Animated.View
          style={[
            styles.backdrop,
            animatedBackdropStyle,
          ]}
        />
      </Pressable>

      <Animated.View
        style={[
          type === "bottom-sheet" ? styles.bottomSheetContainer : styles.centerModalContainer,
          animatedContentStyle,
        ]}
      >
        {children(handleClose)}
      </Animated.View>
    </>
  );

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      {type === "bottom-sheet" ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <Pressable
          style={styles.centerWrapper}
          onPress={handleClose}
        >
          {content}
        </Pressable>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  centerWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  bottomSheetContainer: {
    width: "100%",
  },
  centerModalContainer: {
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
});

export default AnimatedOverlay;
