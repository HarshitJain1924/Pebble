import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import type { Resource, Attachment } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";
import { openAttachmentFile } from "@/features/resources/utils/fileOpener";

export interface MediaResourceViewProps {
  resource: Resource;
  onUpdate: (patch: Partial<Resource>) => Promise<void>;
}

export const MediaResourceView: React.FC<MediaResourceViewProps> = ({
  resource,
  onUpdate,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState(resource.body || "");
  const [imageError, setImageError] = useState(false);

  const attachment: Attachment | undefined = resource.attachments?.[0];
  const isImage = attachment?.mimeType?.startsWith("image/") || false;
  const isPdf = attachment?.mimeType?.includes("pdf") || false;

  const handleOpenOriginal = useCallback(async () => {
    if (!attachment?.uri) return;
    await openAttachmentFile(attachment.uri, {
      mimeType: attachment.mimeType,
      name: attachment.name,
    });
  }, [attachment]);

  const handleSaveCaption = async () => {
    if (draftCaption !== resource.body) {
      await onUpdate({ body: draftCaption.trim() || undefined });
    }
    setIsEditingCaption(false);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getMimeLabel = (mime?: string) => {
    if (!mime) return "FILE";
    if (mime.startsWith("image/")) return mime.replace("image/", "").toUpperCase();
    if (mime.includes("pdf")) return "PDF";
    return mime.split("/")[1]?.toUpperCase() || "DOCUMENT";
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Today";
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <View style={styles.container}>
      {/* Hero Media Display */}
      {isImage && attachment?.uri ? (
        <TouchableOpacity
          onPress={handleOpenOriginal}
          activeOpacity={0.9}
          style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {imageError ? (
            <View style={styles.imageFallback}>
              <Feather name="image" size={36} color={colors.textMuted} />
              <Text style={[styles.imageFallbackText, { color: colors.textMuted }]}>
                {attachment.name || "Image preview unavailable"}
              </Text>
              <Text style={[styles.imageFallbackSub, { color: colors.primary }]}>
                Tap to open file
              </Text>
            </View>
          ) : (
            <View style={styles.imageContainer}>
              <ExpoImage
                source={{ uri: attachment.uri }}
                style={styles.heroImage}
                contentFit="cover"
                transition={200}
                onError={() => setImageError(true)}
              />
              <View style={[styles.zoomPill, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
                <Feather name="maximize-2" size={13} color="#FFFFFF" />
                <Text style={styles.zoomText}>View Full Size</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.docIconCircle, { backgroundColor: `${colors.primary}18` }]}>
            <Feather
              name={isPdf ? "file-text" : "file"}
              size={36}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={2}>
            {attachment?.name || resource.title}
          </Text>
          <Text style={[styles.docMeta, { color: colors.textMuted }]}>
            {getMimeLabel(attachment?.mimeType)} • {formatSize(attachment?.size)}
          </Text>
          <TouchableOpacity
            style={[styles.openDocBtn, { backgroundColor: colors.primary }]}
            onPress={handleOpenOriginal}
            activeOpacity={0.85}
          >
            <Feather name="external-link" size={16} color="#FFFFFF" />
            <Text style={styles.openDocBtnText}>Open Document</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Metadata Overview Bar */}
      <View style={[styles.metaBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>FORMAT</Text>
          <Text style={[styles.metaValue, { color: colors.text }]}>
            {getMimeLabel(attachment?.mimeType)}
          </Text>
        </View>

        <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />

        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>SIZE</Text>
          <Text style={[styles.metaValue, { color: colors.text }]}>
            {formatSize(attachment?.size)}
          </Text>
        </View>

        <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />

        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CREATED</Text>
          <Text style={[styles.metaValue, { color: colors.text }]}>
            {formatDate(resource.createdAt)}
          </Text>
        </View>
      </View>

      {/* Notes / Caption Section */}
      <View style={styles.notesSection}>
        <View style={styles.notesHeader}>
          <Text style={[styles.notesHeading, { color: colors.textMuted }]}>
            CAPTION / NOTES
          </Text>
          {!isEditingCaption && (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setIsEditingCaption(true);
              }}
              style={styles.editCaptionBtn}
              hitSlop={8}
            >
              <Feather name="edit-2" size={13} color={colors.primary} />
              <Text style={[styles.editCaptionBtnText, { color: colors.primary }]}>
                {resource.body ? "Edit" : "Add Note"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditingCaption ? (
          <View style={styles.captionEditBox}>
            <TextInput
              style={[
                styles.captionInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
              ]}
              value={draftCaption}
              onChangeText={setDraftCaption}
              multiline
              placeholder="Add details, notes, or descriptions about this media..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.captionActions}>
              <TouchableOpacity
                onPress={() => {
                  setDraftCaption(resource.body || "");
                  setIsEditingCaption(false);
                }}
                style={[styles.captionActionBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.captionActionText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveCaption}
                style={[styles.captionActionBtn, styles.captionSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.captionSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : resource.body ? (
          <Text style={[styles.captionText, { color: colors.text }]}>{resource.body}</Text>
        ) : (
          <Text style={[styles.emptyCaptionText, { color: colors.textMuted }]}>
            No notes added for this file.
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
  imageCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  imageContainer: {
    width: "100%",
    height: 230,
    position: "relative",
    backgroundColor: "#000000",
  },
  heroImage: {
    width: "100%",
    height: 230,
  },
  zoomPill: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  zoomText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  imageFallback: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  imageFallbackText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  imageFallbackSub: {
    fontSize: 12,
    fontWeight: "700",
  },
  docCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  docIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  docMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  openDocBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 8,
  },
  openDocBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  metaCol: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  metaDivider: {
    width: 1,
    height: 24,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  notesSection: {
    gap: 8,
  },
  notesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notesHeading: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  editCaptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editCaptionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  captionText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  emptyCaptionText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  captionEditBox: {
    gap: 10,
  },
  captionInput: {
    fontSize: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 80,
    textAlignVertical: "top",
  },
  captionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  captionActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  captionActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  captionSaveBtn: {
    borderWidth: 0,
  },
  captionSaveText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
