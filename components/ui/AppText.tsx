import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, StyleSheet } from "react-native";
import React from "react";

function getFontFamily(style: any) {
  const flattened = StyleSheet.flatten(style || {});
  const weight = flattened.fontWeight;
  
  if (weight === "700" || weight === "bold") {
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

export function AppText(props: TextProps) {
  const fontFamily = getFontFamily(props.style);
  const cleanStyle = sanitizeStyle(props.style);
  
  return (
    <RNText
      {...props}
      style={[cleanStyle, { fontFamily }]}
    />
  );
}

export function AppTextInput(props: TextInputProps) {
  const fontFamily = getFontFamily(props.style);
  const cleanStyle = sanitizeStyle(props.style);
  
  return (
    <RNTextInput
      {...props}
      style={[cleanStyle, { fontFamily }]}
    />
  );
}
