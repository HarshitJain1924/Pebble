import React, { useCallback } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Feather } from "@expo/vector-icons";

import type { Attachment } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";
import { openAttachmentFile } from "@/features/resources/utils/fileOpener";

export interface FilePreviewProps {
  attachments: Attachment[];
}

export const FilePreview: React.FC<FilePreviewProps> = ({ attachments }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const handleOpen = useCallback(async (att: Attachment) => {
    await openAttachmentFile(att.uri, {
      mimeType: att.mimeType,
      name: att.name,
    });
  }, []);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIconForMime = (mime: string) => {
    if (mime.startsWith("image/")) return "image";
    if (mime.includes("pdf")) return "file-text";
    if (mime.includes("zip") || mime.includes("compressed")) return "archive";
    if (mime.includes("video/")) return "video";
    return "file";
  };

  if (!attachments || attachments.length === 0) return null;

  return (
    <View style={styles.container}>
      {attachments.map((att) => {
        const isImage = att.mimeType?.startsWith("image/") || false;
        
        if (isImage) {
          return (
            <TouchableOpacity
              key={att.id}
              onPress={() => handleOpen(att)}
              activeOpacity={0.85}
              style={[styles.imageWrapper, { borderColor: colors.border }]}
            >
              <ExpoImage
                source={{ uri: att.uri }}
                style={styles.imagePreview}
                contentFit="cover"
                transition={200}
              />
              <View style={styles.imageBadge}>
                <Text style={styles.imageName} numberOfLines={1}>{att.name}</Text>
                <Text style={styles.imageMeta}>{formatSize(att.size)}</Text>
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <View
            key={att.id}
            style={[
              styles.docCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.docIconContainer, { backgroundColor: `${colors.primary}12` }]}>
              <Feather name={getIconForMime(att.mimeType || "")} size={36} color={colors.primary} />
            </View>
            
            <View style={styles.docInfoContainer}>
              <Text style={[styles.docName, { color: colors.text }]} numberOfLines={2}>
                {att.name}
              </Text>
              <Text style={[styles.docMeta, { color: colors.textMuted }]}>
                {att.mimeType?.split("/")[1]?.toUpperCase() || "FILE"} · {formatSize(att.size)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.docOpenBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleOpen(att)}
              activeOpacity={0.85}
            >
              <Feather name="external-link" size={14} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.docOpenBtnText}>Open File</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    gap: 16,
  },
  imageWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
    height: 200,
    width: "100%",
  },
  imagePreview: {
    width: "100%",
    height: 200,
  },
  imageBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  imageName: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  imageMeta: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "500",
  },
  docCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  docIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  docInfoContainer: {
    alignItems: "center",
    gap: 4,
  },
  docName: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  docMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  docOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 4,
  },
  docOpenBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
