import { Platform } from "react-native";

/**
 * Raw, mode-independent color primitives.
 *
 * `Palette` (here) and `categoryColors.ts` are the ONLY two modules in the app
 * allowed to contain raw hex literals. Everything else must reference a named
 * token so that a single edit re-themes the whole product and so that the
 * `pebble/no-raw-hex-colors` ESLint guard can keep it that way.
 *
 * Prefer, in order:
 *   1. `Colors[scheme].<semanticToken>` for theme-reactive surfaces/text/borders.
 *   2. `categoryColors.ts` maps/hooks for semantic entity, priority & status hues.
 *   3. `Palette.*` only for primitive scale steps used inside light/dark ternaries.
 */
export const Palette = {
  // Absolute
  white: "#FFFFFF",
  black: "#000000",
  whiteSmoke: "#E5E5E5",

  // Neutral — slate / gray / zinc scales used for surfaces and text
  slate50: "#F8FAFC",
  slate100: "#F1F5F9",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1E293B",
  gray100: "#F3F4F6",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  gray900: "#111827",
  gray950: "#030712",
  zinc200: "#E5E7EB",
  zinc300: "#D1D5DB",
  zinc800: "#27272A",
  zinc900: "#18181B",

  // Indigo — retained for one-off illustration/ambient tints (not the primary)
  indigo200: "#C7D2FE",
  indigo300: "#A5B4FC",
  indigo400: "#818CF8",
  indigo500: "#6366F1",
  indigo600: "#4F46E5",
  indigo900: "#312E81",
  indigoVivid: "#6C63FF",

  // Pine — brand primary ramp. Grounded, botanical green that shines on dark charcoal
  // and stays crisp in light mode. Lightness calibrated for WCAG AA compliance.
  pine200: "#B8DEC9",
  pine300: "#8AC4A6",
  pine400: "#44A782",
  pine500: "#358366",
  pine600: "#2C6C54",
  pine900: "#1A4434",

  // Violet — note / creative ramp
  violet50: "#F3E8FF",
  violet100: "#EDE9FE",
  violet200: "#DDD6FE",
  violet300: "#C4B5FD",
  violet400: "#A78BFA",
  violet500: "#8B5CF6",
  violet600: "#7C3AED",
  violet800: "#581C87",
  violet900: "#4C1D95",
  violet950: "#2E1065",
  violetVivid: "#7C62F0",

  // Blue — checklist / link ramp
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue400: "#60A5FA",
  blue500: "#3B82F6",
  blue600: "#2563EB",
  blue700: "#1D4ED8",
  blue800: "#1E3A8A",

  // Sky — image / media ramp
  sky100: "#E0F2FE",
  sky200: "#BAE6FD",
  sky400: "#38BDF8",
  sky500: "#0EA5E9",
  sky600: "#0284C7",
  sky700: "#0369A1",
  sky800: "#075985",

  // Cyan / teal — file & file-type ramp
  cyan500: "#06B6D4",
  cyan600: "#0891B2",
  teal500: "#14B8A6",

  // Emerald — habit / success ramp
  emerald100: "#D1FAE5",
  emerald400: "#34D399",
  emerald500: "#10B981",
  emerald600: "#059669",
  emerald700: "#047857",
  emerald900: "#064E3B",
  green50: "#F0FDF4",
  green100: "#DCFCE7",

  // Amber — task / streak / warning ramp
  amber50: "#FFFBEB",
  amber100: "#FEF3C7",
  amber200: "#FDE047",
  amber300: "#FDE68A",
  amber400: "#FBBF24",
  amber500: "#F59E0B",
  amber600: "#D97706",
  amber700: "#B45309",
  amber900: "#78350F",
  amberSoft: "#FFE082",

  // Orange / yellow
  orange100: "#FFEDD5",
  orange400: "#FB923C",
  orange500: "#F97316",
  orange700: "#C2410C",
  orange900: "#7C2D12",
  yellow100: "#FEF08A",
  yellow500: "#EAB308",

  // Red / pink — destructive & alert ramp
  red100: "#FEE2E2",
  red200: "#FECACA",
  red400: "#F87171",
  red500: "#EF4444",
  red600: "#DC2626",
  pink500: "#EC4899",
  pink900: "#831843",

  // Brown — mascot feathers & the "home" category
  brown400: "#A1887F",
  brown500: "#A78B68",
  brown700: "#8C714E",

  // Project-specific surfaces (no equivalent in the standard scales)
  inkDeep: "#1E1B4B",
  ink900: "#171922",
  ink850: "#1E1E24",
  ice100: "#E2E8F8",
  mist100: "#EEF2F6",
  blush100: "#F8E2E2",

  // Ambient wash pastels (shared by AmbientBackground & onboarding)
  indigoPastel: "#B0BAFF",
  violetPastel: "#E2C4FF",
  cyanPastel: "#AFF5F9",
};

export const Colors = {
  dark: {
    background: "#121215",       // Canvas Base
    card: "#1C1C21",             // Soft raised card surface
    cardLight: "#26262B",        // Slightly lighter card
    primary: "#358366",          // Pine accent (pine500)
    primaryLight: "#44A782",     // Pine lighter accent (pine400)
    secondary: "#3B82F6",        // Blue accent
    text: "#E4E4E7",             // Highly readable off-white body text
    textMuted: "#A1A1AA",        // desaturated subtext/labels
    success: "#10B981",          // Emerald green achievements
    warning: "#F59E0B",          // Desaturated warm amber for streaks/alarms
    error: "#EF4444",            // Soft red for delete/warning
    border: "#2B2B32",           // Extremely faint divider/boundary representation
    tint: "#358366",
    icon: "#A1A1AA",
    tabIconDefault: "#71717A",
    tabIconSelected: "#358366",
  },
  light: {
    background: "#FAFAFA",       // Premium bright canvas base
    card: "#FFFFFF",             // Pure white card pop
    cardLight: "#F3F4F6",        // Soft grey accent
    primary: "#2C6C54",          // Pine deep accent (pine600)
    primaryLight: "#358366",     // Pine accent (pine500)
    secondary: "#2563EB",
    text: "#111827",
    textMuted: "#4B5563",        // Darker textMuted for high readability
    success: "#059669",
    warning: "#D97706",
    error: "#DC2626",
    border: "#E2E8F0",           // Highly visible borders
    tint: "#2C6C54",
    icon: "#4B5563",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: "#2C6C54",
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
