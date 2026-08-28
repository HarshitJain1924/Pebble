import React, { useState } from "react";
import { View, StyleSheet, TextInput, TouchableOpacity, Linking, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";

import type { Resource } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";
import { openAttachmentFile } from "@/features/resources/utils/fileOpener";

export interface LinkResourceViewProps {
  resource: Resource;
  onUpdate: (patch: Partial<Resource>) => Promise<void>;
}

export const LinkResourceView: React.FC<LinkResourceViewProps> = ({ resource, onUpdate }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(resource.body || ""); // Optional description

  // Extract URL: if title is URL-like, or attachments exist, or fallback.
  // The actual codebase treats the URL as attachments[0].uri for "link" types 
  // (per normalizeResource mapping).
  const url = resource.attachments?.[0]?.uri || resource.title;

  const handleOpen = async () => {
    const targetUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    await openAttachmentFile(targetUrl, { name: resource.title });
  };

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

  const getDomain = (fullUrl: string) => {
    try {
      const t = fullUrl.startsWith("http") ? fullUrl : `https://${fullUrl}`;
      return new URL(t).hostname;
    } catch {
      return "link";
    }
  };

  return (
    <View style={styles.container}>
      {/* Abstract Hero Preview */}
      <View style={styles.heroPreview}>
        <View style={[styles.heroDomainBox, { backgroundColor: `${colors.primary}10` }]}>
          <Feather name="link" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.heroDomainText, { color: colors.text }]} numberOfLines={1}>
          {getDomain(url)}
        </Text>
        <Text style={[styles.heroUrlText, { color: colors.textMuted }]} numberOfLines={1}>
          {url}
        </Text>
        <TouchableOpacity 
          style={[styles.heroOpenBtn, { backgroundColor: colors.primary }]} 
          onPress={handleOpen}
        >
          <Text style={styles.openBtnText}>Open Link</Text>
          <Feather name="external-link" size={16} color="#FFF" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>

      {/* Description / Notes */}
      <View style={styles.descSection}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DESCRIPTION</Text>
          {!isEditing && (
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editIconBtn}>
              <Feather name="edit-2" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              value={draftContent}
              onChangeText={setDraftContent}
              multiline
              placeholder="Add details about this link..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={handleCancel} style={styles.actionBtn}>
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, styles.saveBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#FFF", fontWeight: "600" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.bodyText, { color: resource.body ? colors.text : colors.textMuted }]}>
            {resource.body || "No description provided."}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  heroPreview: {
    alignItems: "center",
    paddingVertical: 32,
    marginBottom: 24,
  },
  heroDomainBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heroDomainText: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  heroUrlText: {
    fontSize: 15,
    marginBottom: 24,
    paddingHorizontal: 20,
    textAlign: "center",
  },
  heroOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 100, // pill
    width: "100%",
  },
  openBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  descSection: {
    marginTop: 16,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  editIconBtn: {
    padding: 4,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  editContainer: {
    gap: Spacing.md,
  },
  input: {
    fontSize: 15,
    lineHeight: 22,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 100,
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveBtn: {
    paddingHorizontal: 20,
  },
});
