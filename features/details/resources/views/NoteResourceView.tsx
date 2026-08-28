import React, { useState } from "react";
import { View, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import type { Resource } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";
import { FilePreview } from "../components/FilePreview";
import { PressableScale } from "@/shared/components/ui/PressableScale";

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
      await onUpdate({ body: draftContent.trim() || undefined });
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
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
            value={draftContent}
            onChangeText={setDraftContent}
            multiline
            placeholder="Write your note, meeting minutes, or specs..."
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <View style={styles.editActions}>
            <TouchableOpacity onPress={handleCancel} style={styles.actionBtn}>
              <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, styles.saveBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: "#FFF", fontWeight: "700" }}>Save Note</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.viewBox}>
          {resource.body ? (
            <TouchableOpacity onPress={() => setIsEditing(true)} activeOpacity={0.85}>
              <Text style={[styles.bodyText, { color: colors.text }]}>
                {resource.body}
              </Text>
              <View style={[styles.editInlineBtn, { backgroundColor: `${colors.primary}15` }]}>
                <Feather name="edit-2" size={12} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>Edit Note</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <PressableScale
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setIsEditing(true);
              }}
              haptic
              style={[styles.emptyNoteCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="edit-3" size={20} color={colors.primary} />
              <Text style={[styles.emptyNoteText, { color: colors.textMuted }]}>
                Tap here to add notes or documentation...
              </Text>
            </PressableScale>
          )}
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
    gap: 16,
  },
  viewBox: {
    gap: 12,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: "400",
  },
  editInlineBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 16,
  },
  emptyNoteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyNoteText: {
    fontSize: 14,
    fontWeight: "500",
  },
  editContainer: {
    gap: 12,
  },
  input: {
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    fontSize: 15,
    lineHeight: 24,
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveBtn: {
    borderRadius: 20,
    paddingHorizontal: 20,
  },
  attachmentsSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
