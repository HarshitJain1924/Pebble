import React from "react";
import { Modal, View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/shared/components/ui/PressableScale";

export interface ReviewMyDayModalProps {
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark";
  colors: {
    border: string;
    text: string;
    textMuted: string;
    card: string;
    primary: string;
  };
  gratitudeText: string;
  setGratitudeText: (text: string) => void;
  intentionText: string;
  setIntentionText: (text: string) => void;
  onSaveReview: () => void;
}

export const ReviewMyDayModal: React.FC<ReviewMyDayModalProps> = ({
  visible,
  onClose,
  colorScheme,
  colors,
  gratitudeText,
  setGratitudeText,
  intentionText,
  setIntentionText,
  onSaveReview,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.modalContainer}>
        <BlurView
          intensity={colorScheme === "light" ? 60 : 80}
          style={StyleSheet.absoluteFill}
          tint={colorScheme === "light" ? "light" : "dark"}
        />
        <View
          style={[
            modalStyles.modalContent,
            {
              backgroundColor:
                colorScheme === "light"
                  ? "rgba(255,255,255,0.95)"
                  : "rgba(24,24,27,0.95)",
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={modalStyles.modalHeader}>
            <Text
              style={[modalStyles.modalHeaderTitle, { color: colors.text }]}
            >
              Review My Day
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                onClose();
              }}
              style={modalStyles.closeButton}
            >
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Illustration/Moon Header */}
          <View style={{ alignItems: "center", marginVertical: 8, gap: 4 }}>
            <Text style={{ fontSize: 44 }}>🌙</Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: colors.text,
                textAlign: "center",
              }}
            >
              Reflect & Plan
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
                textAlign: "center",
                marginHorizontal: 24,
              }}
            >
              Letting go of today lets you focus on tomorrow.
            </Text>
          </View>

          {/* Gratitude Input */}
          <View style={{ width: "100%", gap: 6 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              What are you grateful for today?
            </Text>
            <TextInput
              style={{
                width: "100%",
                minHeight: 64,
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1.5,
                borderRadius: 16,
                padding: 12,
                fontSize: 14,
                color: colors.text,
                textAlignVertical: "top",
              }}
              placeholder="A warm coffee, finishing a hard project..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              value={gratitudeText}
              onChangeText={setGratitudeText}
            />
          </View>

          {/* Intention Input */}
          <View style={{ width: "100%", gap: 6, marginTop: 4 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              What is your main focus for tomorrow?
            </Text>
            <TextInput
              style={{
                width: "100%",
                minHeight: 64,
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1.5,
                borderRadius: 16,
                padding: 12,
                fontSize: 14,
                color: colors.text,
                textAlignVertical: "top",
              }}
              placeholder="Finish task writing, run in morning..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              value={intentionText}
              onChangeText={setIntentionText}
            />
          </View>

          {/* Save Button */}
          <PressableScale
            onPress={onSaveReview}
            haptic
            style={{
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 14,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <Text
              style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}
            >
              Save & Close
            </Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
