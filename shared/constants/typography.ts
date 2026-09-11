import { Platform } from "react-native";

export const Typography = {
  fontFamily: {
    headline: "Outfit_700Bold",
    body: "Outfit_400Regular",
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
  // Pebble ships 400, 500, 600, and 700 weights. Weights 700, 800 (heavy), and 900 (black)
  // intentionally map to Outfit_700Bold via AppText to provide consistent strong-weight hierarchy.
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
};
