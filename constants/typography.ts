import { Platform } from "react-native";

export const Typography = {
  fontFamily: {
    headline: Platform.select({
      ios: "System",
      android: "sans-serif-medium",
      web: "Manrope, system-ui, sans-serif",
    }) || "System",
    body: Platform.select({
      ios: "System",
      android: "sans-serif",
      web: "Inter, system-ui, sans-serif",
    }) || "System",
  },
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    display: 34,
  },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
};
