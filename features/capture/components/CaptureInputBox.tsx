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
 *   TextInput minHeight: 88 (4 lines allocated space)
 *   button row height : 44
 *   Total min height  : 16 + 88 + 8 + 44 + 16 = 172px
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
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { VoiceCaptureButton } from "@/features/capture/components/VoiceCaptureButton";

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
  /** Called when paperclip attachment is pressed */
  onAttachmentPress?: () => void;
}

export const CaptureInputBox = React.memo(function CaptureInputBox({
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
  onAttachmentPress,
}: CaptureInputBoxProps) {
  const handleClear = React.useCallback(() => {
    onChangeText("");
  }, [onChangeText]);

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
            onPress={handleClear}
            style={styles.actionBtn}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Feather name="x-circle" size={20} color={placeholderTextColor} />
          </TouchableOpacity>
        )}
        
        {onAttachmentPress && (
          <TouchableOpacity
            onPress={onAttachmentPress}
            style={styles.actionBtn}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Feather name="paperclip" size={20} color={placeholderTextColor} />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: placeholderTextColor, marginRight: 12 }}>
            {value.length}/500
          </Text>
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
    </View>
  );
});

export default CaptureInputBox;

export const CAPTURE_INPUT_MIN_HEIGHT = 172; // paddingV*2 + textMin (88) + gap (8) + actionRow (44)

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 8,
    marginBottom: 16,
    minHeight: CAPTURE_INPUT_MIN_HEIGHT,
  },
  textInput: {
    fontSize: 18,
    fontWeight: "600",
    padding: 0,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 88,
    maxHeight: 154,
    textAlignVertical: "top",
    lineHeight: 26,
    letterSpacing: -0.3,
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
