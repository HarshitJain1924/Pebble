import React from "react";
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppCard } from "@/shared/components/ui/AppCard";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Spacing } from "@/shared/constants/spacing";
import type { Workspace } from "@/shared/types/domain.types";
import { getWorkspaceIconName } from "@/shared/utils/workspace-icon";

export interface ChecklistWorkspaceModalProps {
  visible: boolean;
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  colors: any;
  onSelect: (workspaceId: string) => void;
  onClose: () => void;
}

export const ChecklistWorkspaceModal: React.FC<ChecklistWorkspaceModalProps> = ({
  visible,
  workspaces,
  selectedWorkspaceId,
  colors,
  onSelect,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <AppCard
          style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Select Workspace
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close workspace selector"
            >
              <Feather name="x" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }}>
            {workspaces.map((ws) => (
              <TouchableOpacity
                key={ws.id}
                style={[
                  styles.pickerRow,
                  {
                    backgroundColor:
                      selectedWorkspaceId === ws.id
                        ? `${colors.primary}15`
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  onSelect(ws.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${ws.name} workspace`}
              >
                <Feather
                  name={getWorkspaceIconName(ws)}
                  size={18}
                  color={
                    selectedWorkspaceId === ws.id
                      ? colors.primary
                      : ws.color || colors.text
                  }
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={{
                    color:
                      selectedWorkspaceId === ws.id
                        ? colors.primary
                        : colors.text,
                    fontWeight:
                      selectedWorkspaceId === ws.id ? "700" : "500",
                    fontSize: 15,
                  }}
                >
                  {ws.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </AppCard>
      </View>
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
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  closeBtn: { padding: 4 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
