import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Live "Reduce Motion" accessibility preference.
 *
 * Wraps `AccessibilityInfo.isReduceMotionEnabled()` and subscribes to the
 * `reduceMotionChanged` event so decorative/ambient motion can be disabled even
 * if the user flips the setting while the app is already running.
 *
 * Returns `false` until the initial async read resolves, so the first frames
 * keep their default (animated) behaviour rather than flickering to a static
 * state. Consumers should treat a `true` result as "skip decorative motion".
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => {
        // AccessibilityInfo is unavailable on some platforms/test envs — keep
        // the default (motion enabled) rather than throwing.
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        if (mounted) setReducedMotion(enabled);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

export default useReducedMotion;
