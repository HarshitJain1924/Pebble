import { Platform } from "react-native";
import { Palette } from "./theme";

export const Shadows = {
  soft: Platform.select({
    ios: {
      shadowColor: Palette.black,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
    },
    android: {
      elevation: 8,
    },
    web: {
      boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.55), 0px 1px 3px rgba(255, 255, 255, 0.05) inset",
    },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: Palette.pine500,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
    },
    android: {
      elevation: 10,
    },
    web: {
      boxShadow: "0px 6px 16px rgba(53, 131, 102, 0.22)",
    },
    default: {},
  }),
};
