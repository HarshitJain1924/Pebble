import React, { useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, Linking, Alert, Image } from "react-native";
import { Feather } from "@expo/vector-icons";

import type { Attachment } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Spacing } from "@/shared/constants/spacing";

export interface FilePreviewProps {
  attachments: Attachment[];
}

export const FilePreview: React.FC<FilePreviewProps> = ({ attachments }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const handleOpen = useCallback(async (uri: string) => {
    try {
      const supported = await Linking.canOpenURL(uri);
      if (supported) {
        await Linking.openURL(uri);
      } else {
        // Fallback for local uris that might not be directly openable via Linking
        Alert.alert("Open File", `Cannot automatically open this file type. URI: ${uri}`);
      }
    } catch {
      Alert.alert("Error", "Could not open the file.");
    }
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
        const isImage = att.mimeType.startsWith("image/");
        
        if (isImage) {
          return (
            <TouchableOpacity key={att.id} onPress={() => handleOpen(att.uri)} activeOpacity={0.9}>
              <View style={[styles.imageWrapper, { borderColor: colors.border }]}>
                <Image source={{ uri: att.uri }} style={styles.imagePreview} resizeMode="cover" />
                <View style={[styles.imageOverlay, { backgroundColor: `${colors.background}80` }]}>
                  <Text style={styles.imageName} numberOfLines={1}>{att.name}</Text>
                  <Text style={[styles.imageMeta, { color: colors.textMuted }]}>{formatSize(att.size)}</Text>
                </View>
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
            <View style={[styles.docIconContainer, { backgroundColor: `${colors.primary}10` }]}>
              <Feather name={getIconForMime(att.mimeType)} size={40} color={colors.primary} />
            </View>
            
            <View style={styles.docInfoContainer}>
              <Text style={[styles.docName, { textAlign: "center" }]} numberOfLines={2}>
                {att.name}
              </Text>
              <Text style={[styles.docMeta, { color: colors.textMuted }]}>
                {att.mimeType.split("/")[1]?.toUpperCase() || "FILE"} · {formatSize(att.size)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.docOpenBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleOpen(att.uri)}
            >
              <Text style={styles.docOpenBtnText}>Open</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
  },
  imageWrapper: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  imageName: {
    fontSize: 14,
    fontWeight: "600",
  },
  imageMeta: {
    fontSize: 12,
  },
  docCard: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  docIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  docInfoContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  docName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  docMeta: {
    fontSize: 13,
  },
  docOpenBtn: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 100, // pill
  },
  docOpenBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },
});
