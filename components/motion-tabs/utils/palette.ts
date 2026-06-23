import type { IPalette } from "../typings/motion-tabs";
import { Colors } from "@/constants/theme";

function palette<T extends "dark" | "light">(scheme: T): IPalette {
  const theme = Colors[scheme];
  return {
    foreground: theme.text,
    muted: theme.textMuted,
    surface: scheme === "dark" ? "rgba(24, 24, 27, 0.82)" : "rgba(255, 255, 255, 0.92)",
    border: theme.border,
    input: scheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    hover: scheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    accent: theme.primary,
  };
}

export { palette };


