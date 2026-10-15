import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Circle,
  G,
} from "react-native-svg";
import { Palette } from "@/shared/constants/theme";

export type ArtworkMotif =
  | "work"
  | "documents"
  | "meetings"
  | "learning"
  | "health"
  | "finance"
  | "creative"
  | "mindful"
  | "home"
  | "focus"
  | "travel"
  | "shop";

export interface CategoryAtmosphericArtProps {
  motif: ArtworkMotif;
  color: string;
  isDark?: boolean;
  gradientId: string;
  testID?: string;
}

/**
 * Resolves a normalized artwork motif based on category ID or title keywords.
 * Returns null for unclassified items so the card remains clean and neutral.
 */
export function resolveArtworkMotif(
  categoryKey?: string | null,
  title?: string | null,
): ArtworkMotif | null {
  const cat = (categoryKey || "").toLowerCase().trim();
  const t = (title || "").toLowerCase().trim();

  // 1. Explicit Category ID mappings
  if (cat === "work") return "work";
  if (cat === "learning") return "learning";
  if (cat === "health" || cat === "fitness") return "health";
  if (cat === "finance") return "finance";
  if (cat === "creative") return "creative";
  if (cat === "travel") return "travel";
  if (cat === "home") return "home";
  if (cat === "focus") return "focus";
  if (cat === "personal") return "home";

  // 2. Keyword heuristic mappings
  if (
    t.includes("trip") ||
    t.includes("flight") ||
    t.includes("hotel") ||
    t.includes("travel") ||
    t.includes("vacation") ||
    t.includes("pack")
  ) {
    return "travel";
  }

  if (
    t.includes("review") ||
    t.includes("doc") ||
    t.includes("ticket") ||
    t.includes("pr") ||
    t.includes("contract") ||
    t.includes("spec") ||
    t.includes("draft") ||
    t.includes("report")
  ) {
    return "documents";
  }

  if (
    t.includes("meet") ||
    t.includes("team") ||
    t.includes("sync") ||
    t.includes("standup") ||
    t.includes("call") ||
    t.includes("1:1") ||
    t.includes("interview")
  ) {
    return "meetings";
  }

  if (
    t.includes("read") ||
    t.includes("book") ||
    t.includes("study") ||
    t.includes("learn") ||
    t.includes("course") ||
    t.includes("chapter")
  ) {
    return "learning";
  }

  if (
    t.includes("gym") ||
    t.includes("workout") ||
    t.includes("fitness") ||
    t.includes("exercise") ||
    t.includes("run") ||
    t.includes("jog") ||
    t.includes("sport") ||
    t.includes("cardio") ||
    t.includes("stretch")
  ) {
    return "health";
  }

  if (
    t.includes("meditat") ||
    t.includes("mindful") ||
    t.includes("zen") ||
    t.includes("yoga") ||
    t.includes("breath") ||
    t.includes("wellness")
  ) {
    return "mindful";
  }

  if (
    t.includes("finance") ||
    t.includes("bill") ||
    t.includes("budget") ||
    t.includes("pay") ||
    t.includes("tax") ||
    t.includes("invoice") ||
    t.includes("salary")
  ) {
    return "finance";
  }

  if (
    t.includes("design") ||
    t.includes("art") ||
    t.includes("draw") ||
    t.includes("sketch") ||
    t.includes("portfolio") ||
    t.includes("ui") ||
    t.includes("ux") ||
    t.includes("logo")
  ) {
    return "creative";
  }

  if (
    t.includes("code") ||
    t.includes("client") ||
    t.includes("deck") ||
    t.includes("work") ||
    t.includes("project") ||
    t.includes("plan") ||
    t.includes("deploy")
  ) {
    return "work";
  }

  if (
    t.includes("home") ||
    t.includes("clean") ||
    t.includes("house") ||
    t.includes("chore") ||
    t.includes("laundry") ||
    t.includes("dishes") ||
    t.includes("cook") ||
    t.includes("dinner")
  ) {
    return "home";
  }

  if (
    t.includes("shop") ||
    t.includes("grocer") ||
    t.includes("buy") ||
    t.includes("market") ||
    t.includes("store") ||
    t.includes("order")
  ) {
    return "shop";
  }

  return null;
}

/**
 * Lightweight, hardware-accelerated vector artwork rendered on the right side
 * of the task card. Anchored to the right edge with soft gradient masking that
 * smoothly dissolves into the charcoal card surface.
 */
export const CategoryAtmosphericArt: React.FC<CategoryAtmosphericArtProps> = ({
  motif,
  color,
  isDark = true,
  gradientId,
  testID = "category-atmospheric-art",
}) => {
  const strokeGradId = `${gradientId}-stroke`;
  const fillGradId = `${gradientId}-fill`;
  const accentGradId = `${gradientId}-accent`;

  // Render motif geometry
  const renderMotifPaths = () => {
    switch (motif) {
      case "documents":
        return (
          <G>
            {/* Background document sheet */}
            <Rect
              x={64}
              y={8}
              width={46}
              height={58}
              rx={4}
              transform="rotate(-6 87 37)"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            {/* Foreground document sheet */}
            <Rect
              x={76}
              y={6}
              width={50}
              height={64}
              rx={4}
              transform="rotate(4 101 38)"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
            />
            {/* Horizontal page lines on foreground sheet */}
            <Path
              d="M 85 22 L 112 24 M 86 32 L 118 34 M 87 42 L 114 44 M 88 52 L 105 53"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            {/* Top-right folded dog-ear accent */}
            <Path
              d="M 120 10 L 128 18 L 120 18 Z"
              fill={`url(#${accentGradId})`}
            />
          </G>
        );

      case "meetings":
        return (
          <G>
            {/* Subtle orbital connection arcs */}
            <Path
              d="M 60 48 C 76 28 106 20 128 32 C 140 38 148 50 148 64"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              strokeDasharray="4 4"
            />
            <Path
              d="M 72 64 C 84 50 102 46 118 52"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
            />
            {/* Overlapping collaboration node rings */}
            <Circle
              cx={92}
              cy={26}
              r={12}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.5}
            />
            <Circle
              cx={118}
              cy={44}
              r={15}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.6}
            />
            <Circle
              cx={88}
              cy={58}
              r={10}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.3}
            />
            {/* Inner accent dots */}
            <Circle cx={118} cy={44} r={4.5} fill={`url(#${accentGradId})`} />
            <Circle cx={92} cy={26} r={3} fill={`url(#${accentGradId})`} />
            <Circle cx={88} cy={58} r={2.5} fill={`url(#${accentGradId})`} />
          </G>
        );

      case "learning":
        return (
          <G>
            {/* Open book isometric wings */}
            {/* Left page */}
            <Path
              d="M 78 52 C 86 50 98 48 108 50 C 108 28 96 26 78 30 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Right page */}
            <Path
              d="M 108 50 C 118 48 130 50 138 52 C 138 30 120 26 108 28 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Layered page leaves beneath */}
            <Path
              d="M 78 56 C 88 54 98 52 108 54 C 118 52 128 54 138 56"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            <Path
              d="M 80 60 C 89 58 98 56 108 58 C 118 56 127 58 136 60"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            {/* Bookmark ribbon cascading down spine */}
            <Path
              d="M 106 28 L 106 66 L 109 63 L 112 66 L 112 28 Z"
              fill={`url(#${accentGradId})`}
            />
          </G>
        );

      case "health":
        return (
          <G>
            {/* Concentric activity metric rings */}
            <Circle
              cx={112}
              cy={38}
              r={28}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={2}
              strokeDasharray="125 35"
              fill="none"
              strokeLinecap="round"
            />
            <Circle
              cx={112}
              cy={38}
              r={20}
              stroke={`url(#${accentGradId})`}
              strokeWidth={2.4}
              strokeDasharray="80 35"
              fill="none"
              strokeLinecap="round"
            />
            <Circle
              cx={112}
              cy={38}
              r={12}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.8}
              strokeDasharray="45 20"
              fill="none"
              strokeLinecap="round"
            />
            {/* Dynamic cardio pulse wave crossing through */}
            <Path
              d="M 48 42 L 70 42 L 76 30 L 82 54 L 88 22 L 94 48 L 100 42 L 138 42"
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
        );

      case "work":
        return (
          <G>
            {/* Isometric perspective project boards / cards */}
            {/* Card 1 (Top) */}
            <Path
              d="M 72 20 L 104 8 L 132 20 L 100 32 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Card 2 (Middle) */}
            <Path
              d="M 78 36 L 110 24 L 138 36 L 106 48 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Card 3 (Bottom) */}
            <Path
              d="M 68 52 L 100 40 L 128 52 L 96 64 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Vertical project progress spine */}
            <Path
              d="M 102 12 L 102 60"
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <Circle cx={102} cy={20} r={2.5} fill={`url(#${accentGradId})`} />
            <Circle cx={102} cy={36} r={2.5} fill={`url(#${accentGradId})`} />
            <Circle cx={102} cy={52} r={2.5} fill={`url(#${accentGradId})`} />
          </G>
        );

      case "finance":
        return (
          <G>
            {/* Ascending analytics volume bars */}
            <Rect
              x={70}
              y={50}
              width={10}
              height={22}
              rx={2.5}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            <Rect
              x={86}
              y={38}
              width={10}
              height={34}
              rx={2.5}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            <Rect
              x={102}
              y={26}
              width={10}
              height={46}
              rx={2.5}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            <Rect
              x={118}
              y={14}
              width={10}
              height={58}
              rx={2.5}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            {/* Upward trendline with apex arrow indicator */}
            <Path
              d="M 62 58 Q 86 46 102 32 T 130 10"
              stroke={`url(#${accentGradId})`}
              strokeWidth={2.2}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M 122 10 L 130 10 L 130 18"
              stroke={`url(#${accentGradId})`}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
        );

      case "creative":
        return (
          <G>
            {/* Sweeping fluid bezier ribbons */}
            <Path
              d="M 54 62 C 80 62 86 16 112 18 C 128 20 134 46 142 48"
              stroke={`url(#${accentGradId})`}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M 64 68 C 90 68 96 24 120 26 C 134 28 140 52 148 54"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinecap="round"
              fill="none"
            />
            {/* 4-point sparkle diamond stars */}
            <Path
              d="M 112 12 Q 112 18 106 18 Q 112 18 112 24 Q 112 18 118 18 Q 112 18 112 12 Z"
              fill={`url(#${accentGradId})`}
            />
            <Path
              d="M 88 34 Q 88 38 84 38 Q 88 38 88 42 Q 88 38 92 38 Q 88 38 88 34 Z"
              fill={`url(#${strokeGradId})`}
            />
            <Circle cx={128} cy={42} r={2} fill={`url(#${strokeGradId})`} />
          </G>
        );

      case "mindful":
        return (
          <G>
            {/* Blossoming lotus / radiant petal arcs */}
            <Path
              d="M 110 16 C 102 30 106 50 110 56 C 114 50 118 30 110 16 Z"
              fill={`url(#${accentGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            <Path
              d="M 110 56 C 94 50 84 36 90 24 C 100 32 106 44 110 56 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            <Path
              d="M 110 56 C 114 44 120 32 130 24 C 136 36 126 50 110 56 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            {/* Serene ripple waves below */}
            <Path
              d="M 78 62 C 94 58 126 58 142 62"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            <Path
              d="M 86 68 C 98 65 122 65 134 68"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1}
              strokeLinecap="round"
            />
          </G>
        );

      case "home":
        return (
          <G>
            {/* Clean architectural roofline and dwelling geometry */}
            <Path
              d="M 76 52 L 106 22 L 136 52"
              stroke={`url(#${accentGradId})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Secondary roofline / eave contour */}
            <Path
              d="M 84 52 L 106 30 L 128 52"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              fill="none"
            />
            {/* Chimney structure */}
            <Path
              d="M 120 28 L 120 18 L 126 18 L 126 34"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              strokeLinejoin="round"
              fill={`url(#${fillGradId})`}
            />
            {/* Interior window / living planes */}
            <Rect
              x={98}
              y={38}
              width={16}
              height={14}
              rx={2}
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
            />
            {/* Warm rising sun circle */}
            <Circle
              cx={74}
              cy={28}
              r={9}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              fill={`url(#${fillGradId})`}
            />
          </G>
        );

      case "focus":
        return (
          <G>
            {/* Precision concentric focal reticle */}
            <Circle
              cx={110}
              cy={38}
              r={30}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              strokeDasharray="4 6"
              fill="none"
            />
            <Circle
              cx={110}
              cy={38}
              r={20}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              fill={`url(#${fillGradId})`}
            />
            <Circle
              cx={110}
              cy={38}
              r={10}
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.6}
              fill="none"
            />
            <Circle
              cx={110}
              cy={38}
              r={3.5}
              fill={`url(#${accentGradId})`}
            />
            {/* Reticle alignment crosshairs */}
            <Path
              d="M 110 4 L 110 12 M 110 64 L 110 72 M 76 38 L 84 38 M 136 38 L 144 38"
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </G>
        );

      case "travel":
        return (
          <G>
            {/* Topographical contour elevation curves */}
            <Path
              d="M 62 70 Q 90 32 122 42 T 144 26"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.4}
              fill="none"
            />
            <Path
              d="M 68 76 Q 96 42 128 52 T 146 38"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              strokeDasharray="3 3"
              fill="none"
            />
            {/* Navigational waypoint node & compass ring */}
            <Circle
              cx={118}
              cy={26}
              r={12}
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.4}
              fill={`url(#${fillGradId})`}
            />
            <Circle cx={118} cy={26} r={3.5} fill={`url(#${accentGradId})`} />
            <Path
              d="M 118 10 L 118 14 M 118 38 L 118 42 M 102 26 L 106 26 M 130 26 L 134 26"
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          </G>
        );

      case "shop":
        return (
          <G>
            {/* Geometric tote / parcel folds */}
            <Path
              d="M 84 30 L 126 30 L 120 66 L 90 66 Z"
              fill={`url(#${fillGradId})`}
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            {/* Handle arcs */}
            <Path
              d="M 96 30 C 96 18 114 18 114 30"
              stroke={`url(#${accentGradId})`}
              strokeWidth={1.6}
              strokeLinecap="round"
              fill="none"
            />
            {/* Angled geometric crease */}
            <Path
              d="M 90 44 L 120 44"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            {/* Tag ribbon accent */}
            <Path
              d="M 116 34 L 124 44 L 120 45 L 114 35 Z"
              fill={`url(#${accentGradId})`}
            />
          </G>
        );

      default:
        return null;
    }
  };

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      testID={testID}
      accessibilityElementsHidden={true}
      importantForAccessibility="no"
    >
      <Svg
        width={140}
        height="100%"
        viewBox="0 0 140 80"
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          {/* Fill gradient: fades from 0 opacity at x=0 to subtle tint at right */}
          <LinearGradient id={fillGradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="0.35" stopColor={color} stopOpacity={isDark ? "0.04" : "0.02"} />
            <Stop offset="0.75" stopColor={color} stopOpacity={isDark ? "0.10" : "0.06"} />
            <Stop offset="1" stopColor={color} stopOpacity={isDark ? "0.16" : "0.10"} />
          </LinearGradient>

          {/* Stroke gradient: softly illuminates details on the right */}
          <LinearGradient id={strokeGradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="0.30" stopColor={color} stopOpacity={isDark ? "0.06" : "0.04"} />
            <Stop offset="0.70" stopColor={color} stopOpacity={isDark ? "0.18" : "0.12"} />
            <Stop offset="1" stopColor={color} stopOpacity={isDark ? "0.28" : "0.18"} />
          </LinearGradient>

          {/* Accent gradient: highlights focal curves */}
          <LinearGradient id={accentGradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="0.35" stopColor={color} stopOpacity={isDark ? "0.10" : "0.06"} />
            <Stop offset="0.75" stopColor={color} stopOpacity={isDark ? "0.26" : "0.18"} />
            <Stop offset="1" stopColor={color} stopOpacity={isDark ? "0.42" : "0.28"} />
          </LinearGradient>
        </Defs>

        {renderMotifPaths()}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: -4,
    top: 0,
    bottom: 0,
    width: 140,
    overflow: "hidden",
  },
});
