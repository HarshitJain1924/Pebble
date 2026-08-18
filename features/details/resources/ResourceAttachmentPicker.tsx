import React from "react";
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type { Resource } from "@/shared/types/domain.types";

export interface ResourceAttachmentPickerProps {
  visible: boolean;
  resources: Resource[];
  selectedResourceIds: string[];
  onToggle: (resourceId: string) => void;
  onClose: () => void;
}

/**
 * Shared Resource Attachment Picker used by Task, Habit, and Checklist Detail screens.
 * Pure UI component that modifies draft resource selections.
 */
export const ResourceAttachmentPicker: React.FC<ResourceAttachmentPickerProps> = ({
  visible,
  resources,
  selectedResourceIds,
  onToggle,
  onClose,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <AppCard
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Link Resources
          </Text>
          <Text
            style={{ fontSize: 11, color: colors.textMuted, marginTop: -4 }}
          >
            Select items to link:
          </Text>

          <ScrollView
            contentContainerStyle={{ gap: 14, paddingVertical: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {resources.length === 0 ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 13,
                  fontStyle: "italic",
                  textAlign: "center",
                  paddingVertical: 30,
                }}
              >
                No resources available.
              </Text>
            ) : (
              resources
                .filter((i) => !i.archivedAt)
                .map((res) => {
                  const isChecked = selectedResourceIds.includes(res.id);
                  return (
                    <TouchableOpacity
                      key={res.id}
                      onPress={() => onToggle(res.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: isChecked
                          ? `${colors.primary}15`
                          : colors.cardLight,
                        borderWidth: 1,
                        borderColor: isChecked
                          ? colors.primary
                          : colors.border,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Link ${res.title}`}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {res.title}
                      </Text>
                      <Feather
                        name={isChecked ? "check-square" : "square"}
                        size={18}
                        color={
                          isChecked ? colors.primary : colors.textMuted
                        }
                      />
                    </TouchableOpacity>
                  );
                })
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              marginTop: 6,
            }}
            accessibilityRole="button"
            accessibilityLabel="Done linking resources"
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Done</Text>
          </TouchableOpacity>
        </AppCard>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxHeight: "80%",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  modalTitle: { 
    fontSize: 18, 
    fontWeight: "800" 
  },
});
