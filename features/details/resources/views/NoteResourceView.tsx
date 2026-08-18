import React, { useState } from "react";
import { View, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";

import type { Resource } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";
import { FilePreview } from "../components/FilePreview";

export interface NoteResourceViewProps {
  resource: Resource;
  onUpdate: (patch: Partial<Resource>) => Promise<void>;
}

export const NoteResourceView: React.FC<NoteResourceViewProps> = ({ resource, onUpdate }) => {
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
      {isEditing ? (
        <View style={styles.editContainer}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={draftContent}
            onChangeText={setDraftContent}
            multiline
            placeholder="Write your note here..."
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <View style={styles.editActions}>
            <TouchableOpacity onPress={handleCancel} style={styles.actionBtn}>
              <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, styles.saveBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: "#FFF", fontWeight: "600" }}>Save Note</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          <Text style={[styles.bodyText, { color: resource.body ? colors.text : colors.textMuted }]}>
            {resource.body || "No content."}
          </Text>
          <TouchableOpacity onPress={() => setIsEditing(true)} style={[styles.editInlineBtn, { backgroundColor: `${colors.primary}15` }]}>
            <Feather name="edit-2" size={12} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Edit Note</Text>
          </TouchableOpacity>
        </View>
      )}

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
    paddingHorizontal: 16,
  },
  bodyText: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "400",
  },
  editInlineBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 24,
  },
  editContainer: {
    gap: Spacing.md,
  },
  input: {
    fontSize: 18,
    lineHeight: 28,
    minHeight: 150,
    textAlignVertical: "top",
    padding: 0,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: 16,
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
