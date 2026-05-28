import { Platform } from "react-native";

export const Colors = {
  dark: {
    background: "#121215",       // Canvas Base
    card: "#1C1C21",             // Soft raised card surface
    cardLight: "#26262B",        // Slightly lighter card
    primary: "#6366F1",          // Indigo accent
    primaryLight: "#818cf8",     // Indigo lighter accent
    secondary: "#3B82F6",        // Blue accent
    text: "#E4E4E7",             // Highly readable off-white body text
    textMuted: "#A1A1AA",        // desaturated subtext/labels
    success: "#10B981",          // Emerald green achievements
    warning: "#F59E0B",          // Desaturated warm amber for streaks/alarms
    error: "#EF4444",            // Soft red for delete/warning
    border: "#2B2B32",           // Extremely faint divider/boundary representation
    tint: "#6366F1",
    icon: "#A1A1AA",
    tabIconDefault: "#71717A",
    tabIconSelected: "#6366F1",
  },
  light: {
    background: "#FAFAFA",       // Premium bright canvas base
    card: "#FFFFFF",             // Pure white card pop
    cardLight: "#F3F4F6",        // Soft grey accent
    primary: "#4F46E5",
    primaryLight: "#6366F1",
    secondary: "#2563EB",
    text: "#111827",
    textMuted: "#4B5563",        // Darker textMuted for high readability
    success: "#059669",
    warning: "#D97706",
    error: "#DC2626",
    border: "#E2E8F0",           // Highly visible borders
    tint: "#4F46E5",
    icon: "#4B5563",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: "#4F46E5",
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "System",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});
export type ThemeColors = typeof Colors.dark;
export const getTheme = (isDark = true): ThemeColors => (isDark ? Colors.dark : Colors.light);
