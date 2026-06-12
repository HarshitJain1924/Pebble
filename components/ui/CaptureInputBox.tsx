/**
 * CaptureInputBox
 * ---------------
 * Shared input card used by both Quick Add (BottomSheet) and Pebble Capture.
 * Keeps padding, minHeight, button row gap, and border identical so both
 * screens feel the same on every Android screen size.
 *
 * Canonical measurements (do not change without updating both callers):
 *   paddingHorizontal : 16
 *   paddingVertical   : 16
 *   gap (children)    : 8
 *   TextInput minHeight: 44
 *   button row height : 44
 *   Total min height  : 16 + 44 + 8 + 44 + 16 = 128px
 *
 * middleSlot
 *   Optional content rendered between the TextInput and the action row —
 *   stays visually inside the card border. Use for description fields,
 *   tags, etc. so they are grouped with the title input.
 */
import React from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { VoiceCaptureButton } from "@/components/VoiceCaptureButton";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "processing"
  | "completed"
  | "error";

interface CaptureInputBoxProps {
  /** Controlled text value */
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  /** Called when focus gained */
  onFocus?: () => void;
  /** Called when focus lost */
  onBlur?: () => void;
  /** Additional props forwarded to TextInput */
  textInputProps?: Omit<TextInputProps, "value" | "onChangeText" | "placeholder" | "placeholderTextColor" | "onFocus" | "onBlur">;
  /** Voice capture state */
  voiceStatus: VoiceStatus;
  voiceVolume?: number;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onVoiceCancel: () => void;
  themePrimary: string;
  /** Colors */
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  /** Extra style for outer container */
  containerStyle?: ViewStyle;
  /** Whether to use BottomSheetTextInput (pass it in for BottomSheet context) */
  TextInputComponent?: React.ComponentType<TextInputProps>;
  /**
   * Rendered between the TextInput and the action row, inside the card border.
   * Use for description fields, tags, or any secondary input grouped with title.
   */
  middleSlot?: React.ReactNode;
}

export default function CaptureInputBox({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  onFocus,
  onBlur,
  textInputProps,
  voiceStatus,
  voiceVolume = 0,
  onVoiceStart,
  onVoiceStop,
  onVoiceCancel,
  themePrimary,
  backgroundColor,
  borderColor,
  textColor,
  containerStyle,
  TextInputComponent = TextInput,
  middleSlot,
}: CaptureInputBoxProps) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor, borderColor },
        containerStyle,
      ]}
    >
      <TextInputComponent
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        onFocus={onFocus}
        onBlur={onBlur}
        multiline
        style={[styles.textInput, { color: textColor }]}
        {...(textInputProps as any)}
      />

      {/* middleSlot — description, tags, etc. Always inside the card */}
      {middleSlot}

      {/* Action row — always below text (and middleSlot), never overlapping */}
      <View style={styles.actionRow}>
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText("")}
            style={styles.actionBtn}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Feather name="x-circle" size={20} color={placeholderTextColor} />
          </TouchableOpacity>
        )}
        <View style={styles.actionBtn}>
          <VoiceCaptureButton
            status={voiceStatus}
            volume={voiceVolume}
            onStart={onVoiceStart}
            onStop={onVoiceStop}
            onCancel={onVoiceCancel}
            themePrimary={themePrimary}
          />
        </View>
      </View>
    </View>
  );
}

export const CAPTURE_INPUT_MIN_HEIGHT = 128; // paddingV*2 + textMin + gap + actionRow

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,   // ← canonical: 16 on both sides
    gap: 8,                // ← canonical: uniform gap between children
    marginBottom: 16,
  },
  textInput: {
    fontSize: 16,
    fontWeight: "600",
    padding: 0,
    minHeight: 44,          // ← canonical: comfortable on Android
    textAlignVertical: "top",
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    alignSelf: "stretch",   // ← canonical: must span full width on Android
    gap: 12,
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
