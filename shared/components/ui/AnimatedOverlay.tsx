import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  View,
  Keyboard,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useAnimatedKeyboard,
  cancelAnimation,
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
  const isMountedRef = React.useRef(true);
  const isClosingRef = React.useRef(false);
  const hasNotifiedCloseRef = React.useRef(!visible);

  // Reanimated shared values
  const backdropOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(SCREEN_HEIGHT * 0.5);
  const contentScale = useSharedValue(0.95);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      hasNotifiedCloseRef.current = true;
      isClosingRef.current = false;
      cancelAnimation(backdropOpacity);
      cancelAnimation(contentTranslateY);
      cancelAnimation(contentScale);
      cancelAnimation(contentOpacity);
    };
  }, [backdropOpacity, contentTranslateY, contentScale, contentOpacity]);

  // Reanimated native keyboard tracking (skips web & Jest to avoid warnings)
  const isExcluded = Platform.OS === "web" || process.env.NODE_ENV === "test";
  const keyboard = !isExcluded ? useAnimatedKeyboard() : null;

  // Sync prop visibility changes
  useEffect(() => {
    if (visible) {
      hasNotifiedCloseRef.current = false;
      isClosingRef.current = false;
      setModalVisible(true);
      // Trigger entering animations
      backdropOpacity.value = withTiming(1, { duration: 250 });
      if (type === "bottom-sheet") {
        contentTranslateY.value = withSpring(0, SPRING_CONFIG);
      } else {
        contentScale.value = withSpring(1, SPRING_CONFIG);
        contentOpacity.value = withTiming(1, { duration: 200 });
      }
    } else {
      hasNotifiedCloseRef.current = true;
      isClosingRef.current = false;
      cancelAnimation(backdropOpacity);
      cancelAnimation(contentTranslateY);
      cancelAnimation(contentScale);
      cancelAnimation(contentOpacity);
      setModalVisible(false);
      // Reset values immediately to clear pending animations
      backdropOpacity.value = 0;
      if (type === "bottom-sheet") {
        contentTranslateY.value = SCREEN_HEIGHT * 0.5;
      } else {
        contentScale.value = 0.95;
        contentOpacity.value = 0;
      }
    }
  }, [visible, type, backdropOpacity, contentTranslateY, contentScale, contentOpacity]);

  const finishClose = useCallback(() => {
    if (!isMountedRef.current || hasNotifiedCloseRef.current) {
      isClosingRef.current = false;
      return;
    }
    hasNotifiedCloseRef.current = true;
    isClosingRef.current = false;
    if (isMountedRef.current) {
      setModalVisible(false);
    }
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current || hasNotifiedCloseRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    // Trigger exiting animations
    backdropOpacity.value = withTiming(0, { duration: 200 });

    const onAnimationEnd = (finished?: boolean) => {
      if (finished) {
        runOnJS(finishClose)();
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
  }, [type, backdropOpacity, contentTranslateY, contentScale, contentOpacity, finishClose]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => {
    let kh = 0;
    if (keyboard) {
      if (
        typeof keyboard.height === "object" &&
        keyboard.height !== null &&
        "value" in keyboard.height
      ) {
        kh = (keyboard.height as any).value;
      } else if (typeof keyboard.height === "number") {
        kh = keyboard.height;
      }
    }

    if (type === "bottom-sheet") {
      return {
        transform: [{ translateY: contentTranslateY.value - kh }],
      };
    } else {
      return {
        opacity: contentOpacity.value,
        transform: [
          { scale: contentScale.value },
          { translateY: -kh * 0.5 },
        ],
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
        <View style={styles.bottomWrapper}>
          {content}
        </View>
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
  bottomWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  centerWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
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

