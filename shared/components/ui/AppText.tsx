import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, StyleSheet } from "react-native";
import React from "react";

function getFontFamily(style: any) {
  const flattened = StyleSheet.flatten(style || {});
  if (flattened.fontFamily) {
    return flattened.fontFamily;
  }
  const weight = flattened.fontWeight != null ? String(flattened.fontWeight) : undefined;
  
  // 700 (bold), 800 (heavy), and 900 (black) map to Pebble's strongest shipped weight: Outfit_700Bold
  if (
    weight === "900" ||
    weight === "black" ||
    weight === "800" ||
    weight === "heavy" ||
    weight === "700" ||
    weight === "bold"
  ) {
    return "Outfit_700Bold";
  } else if (weight === "600" || weight === "semibold") {
    return "Outfit_600SemiBold";
  } else if (weight === "500" || weight === "medium") {
    return "Outfit_500Medium";
  }
  return "Outfit_400Regular";
}

// Helper to remove fontWeight so Android doesn't fallback to system font
function sanitizeStyle(style: any) {
  const flattened = StyleSheet.flatten(style || {});
  const { fontWeight, ...rest } = flattened as any;
  return rest;
}

export function AppText({ style, ...props }: TextProps) {
  const fontFamily = getFontFamily(style);
  const cleanStyle = sanitizeStyle(style);
  
  return (
    <RNText
      {...props}
      style={StyleSheet.flatten([cleanStyle, { fontFamily }])}
    />
  );
}

export function AppTextInput({ style, ...props }: TextInputProps) {
  const fontFamily = getFontFamily(style);
  const cleanStyle = sanitizeStyle(style);
  
  return (
    <RNTextInput
      {...props}
      style={StyleSheet.flatten([cleanStyle, { fontFamily }])}
    />
  );
}
