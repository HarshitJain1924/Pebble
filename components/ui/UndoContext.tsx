import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";

type UndoOptions = {
  message: string;
  actionLabel?: string;
  duration?: number; // ms
  onUndo?: () => Promise<void> | void;
};

type BannerOptions = {
  title?: string;
  body?: string;
  duration?: number; // ms, 0 = persistent
  onSnooze?: () => void;
};

type UndoContextType = {
  showUndo: (opts: UndoOptions) => void;
  showBanner: (opts: BannerOptions) => void;
};

const UndoContext = createContext<UndoContextType | null>(null);

export const useUndo = () => {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
};

export const UndoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<UndoOptions | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const [bannerAnim] = useState(() => new Animated.Value(0));
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const [banner, setBanner] = useState<BannerOptions | null>(null);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (visible && opts?.duration !== 0) {
      t = setTimeout(() => setVisible(false), opts?.duration ?? 4000);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [visible, opts]);

  const showUndo = useCallback((options: UndoOptions) => {
    setOpts(options);
    setVisible(false);
    // allow re-show animation
    setTimeout(() => setVisible(true), 50);
  }, []);

  const showBanner = useCallback(
    (options: BannerOptions) => {
      setBanner(options);
      // animate down
      bannerAnim.setValue(0);
      Animated.timing(bannerAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
      if (options.duration && options.duration > 0) {
        setTimeout(() => {
          Animated.timing(bannerAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => setBanner(null));
        }, options.duration);
      }
    },
    [bannerAnim],
  );

  const handleUndo = async () => {
    if (!opts) return;
    try {
      await opts.onUndo?.();
    } catch {
      // ignore
    } finally {
      setVisible(false);
    }
  };

  return (
    <UndoContext.Provider value={{ showUndo, showBanner }}>
      {children}
      {opts && (
        <Animated.View
          pointerEvents={visible ? "auto" : "none"}
          style={[
            styles.container,
            {
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [80, 0],
                  }),
                },
              ],
              opacity: anim,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[styles.message, { color: colors.text }]}
            numberOfLines={1}
          >
            {opts.message}
          </Text>
          <Pressable
            onPress={handleUndo}
            style={styles.action}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {opts.actionLabel ?? "Undo"}
            </Text>
          </Pressable>
        </Animated.View>
      )}
      {banner && (
        <Animated.View
          pointerEvents={"box-none"}
          style={[
            bannerStyles.container,
            {
              transform: [
                {
                  translateY: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-80, 12],
                  }),
                },
              ],
              opacity: bannerAnim,
            },
          ]}
        >
          <Animated.View
            style={[
              bannerStyles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Animated.View style={{ flex: 1 }}>
              <Text
                style={[bannerStyles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {banner.title ?? "Alert"}
              </Text>
              {banner.body ? (
                <Text
                  style={[bannerStyles.body, { color: colors.textMuted }]}
                  numberOfLines={2}
                >
                  {banner.body}
                </Text>
              ) : null}
            </Animated.View>
            <Animated.View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Pressable
                onPress={() => {
                  Animated.timing(bannerAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => setBanner(null));
                }}
                style={{ padding: 8 }}
              >
                <Text style={[bannerStyles.action, { color: colors.primary }]}>
                  Dismiss
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  try {
                    banner.onSnooze?.();
                  } catch {}
                  Animated.timing(bannerAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => setBanner(null));
                }}
                style={{ padding: 8 }}
              >
                <Text style={[bannerStyles.action, { color: colors.primary }]}>
                  Snooze
                </Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}
    </UndoContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 6,
  },
  message: { fontSize: 14, fontWeight: "600", flex: 1, marginRight: 12 },
  action: { paddingHorizontal: 8, paddingVertical: 6 },
  actionText: { fontSize: 13, fontWeight: "800" },
});

export default UndoProvider;

const bannerStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    elevation: 12,
    zIndex: 1200,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: "800", marginBottom: 2 },
  body: { fontSize: 12 },
  action: { fontSize: 13, fontWeight: "800" },
});
