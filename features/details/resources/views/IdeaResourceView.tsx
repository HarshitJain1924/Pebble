import React, { useState } from "react";
import { View, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";

import type { Resource } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";
import { FilePreview } from "../components/FilePreview";

export interface IdeaResourceViewProps {
  resource: Resource;
  onUpdate: (patch: Partial<Resource>) => Promise<void>;
}

export const IdeaResourceView: React.FC<IdeaResourceViewProps> = ({ resource, onUpdate }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(resource.body || "");

  const handleSave = async () => {
    if (draftContent !== resource.body) {
      await onUpdate({ body: draftContent });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftContent(resource.body || "");
    setIsEditing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.ideaContainer}>
        <View style={styles.iconWrapper}>
          <Text style={styles.emoji}>💡</Text>
        </View>

        {isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: `${colors.warning}40`, backgroundColor: colors.background }]}
              value={draftContent}
              onChangeText={setDraftContent}
              multiline
              placeholder="Expand on your idea..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={handleCancel} style={styles.actionBtn}>
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, styles.saveBtn, { backgroundColor: colors.warning }]}>
                <Text style={{ color: "#FFF", fontWeight: "700" }}>Save Idea</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <Text style={[styles.bodyText, { color: resource.body ? colors.text : colors.textMuted }]}>
              {resource.body || "No additional details for this idea."}
            </Text>
            <TouchableOpacity onPress={() => setIsEditing(true)} style={[styles.editInlineBtn, { backgroundColor: `${colors.warning}20` }]}>
              <Feather name="edit-2" size={12} color={colors.warning} style={{ marginRight: 6 }} />
              <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "700" }}>Edit Idea</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {resource.attachments && resource.attachments.length > 0 && (
        <View style={styles.attachmentsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
            ATTACHMENTS
          </Text>
          <FilePreview attachments={resource.attachments} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  ideaContainer: {
    flexDirection: "column",
  },
  iconWrapper: {
    marginBottom: 24,
  },
  emoji: {
    fontSize: 48,
  },
  bodyText: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "500",
  },
  editInlineBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 32,
  },
  editContainer: {
    gap: Spacing.md,
  },
  input: {
    fontSize: 18,
    lineHeight: 28,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 150,
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveBtn: {
    paddingHorizontal: 20,
  },
  attachmentsSection: {
    marginTop: 40,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
});
