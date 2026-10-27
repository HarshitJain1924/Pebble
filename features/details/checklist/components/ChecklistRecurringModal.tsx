import React from "react";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette } from "@/shared/constants/theme";
import { Spacing } from "@/shared/constants/spacing";

export interface ChecklistRecurringModalProps {
  visible: boolean;
  colors: any;
  onThisOccurrence: () => void;
  onAllOccurrences: () => void;
  onClose: () => void;
}

export const ChecklistRecurringModal: React.FC<ChecklistRecurringModalProps> = ({
  visible,
  colors,
  onThisOccurrence,
  onAllOccurrences,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: "700",
              fontSize: 16,
              marginBottom: 8,
            }}
          >
            Edit Recurring Checklist
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            Do you want to edit only this occurrence or all occurrences?
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              style={[
                styles.modalBtn,
                { flex: 1, backgroundColor: `${colors.primary}15` },
              ]}
              onPress={onThisOccurrence}
              accessibilityRole="button"
              accessibilityLabel="This occurrence"
            >
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                This occurrence
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalBtn,
                { flex: 1, backgroundColor: colors.primary },
              ]}
              onPress={onAllOccurrences}
              accessibilityRole="button"
              accessibilityLabel="All occurrences"
            >
              <Text style={{ color: Palette.white, fontWeight: "700" }}>
                All occurrences
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  modalBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
