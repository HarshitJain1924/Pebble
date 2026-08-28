import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import type { Resource } from "@/shared/types/domain.types";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { openAttachmentFile } from "@/features/resources/utils/fileOpener";

export interface ConnectedResourcesViewProps {
  resources: Resource[];
  onAttachPress: () => void;
  onUnlink?: (resourceId: string) => void;
  workspaceId?: string;
  title?: string;
}

/**
 * Aesthetic, interactive preview carousel for resources attached to Tasks, Habits, and Checklists.
 * Displays interactive cards for images (photos), notes, links, and documents with 1-tap open & unlink actions.
 */
export const ConnectedResourcesView: React.FC<ConnectedResourcesViewProps> = ({
  resources,
  onAttachPress,
  onUnlink,
  workspaceId,
  title = "LINKED RESOURCES",
}) => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  const handleOpenResource = (res: Resource) => {
    Haptics.selectionAsync().catch(() => {});
    const attachment = res.attachments?.[0];
    const isImage = Boolean(attachment?.mimeType?.startsWith("image/"));
    const isPdf = Boolean(attachment?.mimeType?.includes("pdf"));

    if (res.type === "link") {
      const url = attachment?.uri || res.title;
      const targetUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
      void openAttachmentFile(targetUrl, { name: res.title });
    } else if (attachment?.uri && (isPdf || !isImage)) {
      void openAttachmentFile(attachment.uri, {
        name: attachment.name || res.title,
        mimeType: attachment.mimeType,
      });
    } else {
      router.push(`/resource-details?id=${res.id}&workspaceId=${res.workspaceId || workspaceId || ""}`);
    }
  };

  const getDomain = (url: string) => {
    try {
      const cleaned = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split("/")[0];
      return cleaned || "web";
    } catch {
      return "web";
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithCount}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {title}
          </Text>
          {resources.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                {resources.length}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onAttachPress();
          }}
          style={[styles.attachButton, { backgroundColor: `${colors.primary}15` }]}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={13} color={colors.primary} />
          <Text style={[styles.attachButtonText, { color: colors.primary }]}>
            {resources.length === 0 ? "Attach" : "Manage"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content: Horizontal Cards Carousel or Empty Prompt */}
      {resources.length === 0 ? (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onAttachPress();
          }}
          style={[
            styles.emptyPrompt,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          activeOpacity={0.8}
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: `${colors.primary}12` }]}>
            <Feather name="paperclip" size={16} color={colors.primary} />
          </View>
          <View style={styles.emptyTextCol}>
            <Text style={[styles.emptyPromptTitle, { color: colors.text }]}>
              No resources linked.
            </Text>
            <Text style={[styles.emptyPromptSubtitle, { color: colors.textMuted }]}>
              Tap to attach exercise photos, guides, recipes, or reference notes.
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsScroll}
        >
          {resources.map((res) => {
            const hasAttachment = Boolean(res.attachments && res.attachments.length > 0);
            const attachment = res.attachments?.[0];
            const isImage = Boolean(hasAttachment && attachment?.mimeType?.startsWith("image/"));
            const isPdf = Boolean(hasAttachment && attachment?.mimeType?.includes("pdf"));

            // 1. IMAGE / PHOTO CARD
            if (isImage && attachment?.uri) {
              return (
                <View
                  key={res.id}
                  style={[styles.mediaCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <TouchableOpacity
                    onPress={() => handleOpenResource(res)}
                    activeOpacity={0.9}
                    style={styles.cardTouchArea}
                  >
                    <ExpoImage
                      source={{ uri: attachment.uri }}
                      style={styles.mediaImage}
                      contentFit="cover"
                      transition={150}
                    />
                    <View style={styles.imageDarkGradient}>
                      <Text style={styles.mediaTitleText} numberOfLines={1}>
                        {res.title}
                      </Text>
                      <View style={styles.mediaChipRow}>
                        <View style={styles.mediaTypePill}>
                          <Text style={styles.mediaTypePillText}>PHOTO</Text>
                        </View>
                        {attachment.size ? (
                          <Text style={styles.mediaSizeText}>{formatSize(attachment.size)}</Text>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>

                  {onUnlink && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        onUnlink(res.id);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.cardUnlinkBtn}
                    >
                      <Feather name="x" size={11} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            // 2. NOTE / IDEA CARD
            if (res.type === "note" || res.type === "idea") {
              const isIdea = res.type === "idea";
              return (
                <View
                  key={res.id}
                  style={[
                    styles.noteCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isIdea ? `${colors.warning}50` : colors.border,
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => handleOpenResource(res)}
                    activeOpacity={0.85}
                    style={styles.noteTouchArea}
                  >
                    <View style={styles.noteTopRow}>
                      <View
                        style={[
                          styles.noteIconBadge,
                          { backgroundColor: isIdea ? `${colors.warning}18` : `${colors.primary}18` },
                        ]}
                      >
                        <Feather
                          name={isIdea ? ("lightbulb" as any) : "align-left"}
                          size={13}
                          color={isIdea ? colors.warning : colors.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.noteTypeTag,
                          { color: isIdea ? colors.warning : colors.primary },
                        ]}
                      >
                        {isIdea ? "IDEA" : "NOTE"}
                      </Text>
                    </View>

                    <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={1}>
                      {res.title}
                    </Text>

                    <Text
                      style={[styles.noteSnippet, { color: colors.textMuted }]}
                      numberOfLines={3}
                    >
                      {res.body || "Tap to read note..."}
                    </Text>
                  </TouchableOpacity>

                  {onUnlink && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        onUnlink(res.id);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[styles.cardUnlinkBtnAlt, { backgroundColor: `${colors.border}60` }]}
                    >
                      <Feather name="x" size={11} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            // 3. LINK CARD
            if (res.type === "link") {
              const domain = getDomain(attachment?.uri || res.title);
              return (
                <View
                  key={res.id}
                  style={[styles.linkCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <TouchableOpacity
                    onPress={() => handleOpenResource(res)}
                    activeOpacity={0.85}
                    style={styles.linkTouchArea}
                  >
                    <View style={styles.linkTopRow}>
                      <View style={[styles.linkIconCircle, { backgroundColor: "#3B82F618" }]}>
                        <Feather name="link" size={13} color="#3B82F6" />
                      </View>
                      <Text style={styles.domainChipText} numberOfLines={1}>
                        {domain}
                      </Text>
                    </View>

                    <Text style={[styles.linkTitle, { color: colors.text }]} numberOfLines={2}>
                      {res.title}
                    </Text>

                    <View style={styles.linkFooterRow}>
                      <Text style={[styles.linkOpenText, { color: "#3B82F6" }]}>Open Link</Text>
                      <Feather name="arrow-up-right" size={12} color="#3B82F6" />
                    </View>
                  </TouchableOpacity>

                  {onUnlink && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        onUnlink(res.id);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[styles.cardUnlinkBtnAlt, { backgroundColor: `${colors.border}60` }]}
                    >
                      <Feather name="x" size={11} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            // 4. DOCUMENT / PDF / GENERIC FILE CARD
            return (
              <View
                key={res.id}
                style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <TouchableOpacity
                  onPress={() => handleOpenResource(res)}
                  activeOpacity={0.85}
                  style={styles.docTouchArea}
                >
                  <View style={styles.docTopRow}>
                    <View
                      style={[
                        styles.docIconCircle,
                        { backgroundColor: isPdf ? "#EF444418" : "#06B6D418" },
                      ]}
                    >
                      <Feather
                        name={isPdf ? "file-text" : "file"}
                        size={14}
                        color={isPdf ? "#EF4444" : "#06B6D4"}
                      />
                    </View>
                    <Text
                      style={[
                        styles.docTypeBadge,
                        { color: isPdf ? "#EF4444" : "#06B6D4" },
                      ]}
                    >
                      {isPdf ? "PDF" : "FILE"}
                    </Text>
                  </View>

                  <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={2}>
                    {attachment?.name || res.title}
                  </Text>

                  <View style={styles.docFooterRow}>
                    <Text style={[styles.docSizeText, { color: colors.textMuted }]}>
                      {formatSize(attachment?.size) || "Document"}
                    </Text>
                    <Feather name="external-link" size={11} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>

                {onUnlink && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      onUnlink(res.id);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[styles.cardUnlinkBtnAlt, { backgroundColor: `${colors.border}60` }]}
                  >
                    <Feather name="x" size={11} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Quick Attach Plus Card at the end of Carousel */}
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onAttachPress();
            }}
            style={[
              styles.addMoreCard,
              { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}30` },
            ]}
            activeOpacity={0.7}
          >
            <View style={[styles.addMoreIconBox, { backgroundColor: `${colors.primary}18` }]}>
              <Feather name="plus" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.addMoreText, { color: colors.primary }]}>Add</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginTop: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleWithCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  attachButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyPrompt: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 12,
  },
  emptyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTextCol: {
    flex: 1,
    gap: 2,
  },
  emptyPromptTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyPromptSubtitle: {
    fontSize: 11,
  },
  cardsScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  mediaCard: {
    width: 144,
    height: 130,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  cardTouchArea: {
    width: "100%",
    height: "100%",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  imageDarkGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
    gap: 2,
  },
  mediaTitleText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  mediaChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mediaTypePill: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mediaTypePillText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  mediaSizeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 9,
    fontWeight: "600",
  },
  cardUnlinkBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardUnlinkBtnAlt: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  noteCard: {
    width: 154,
    height: 130,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    position: "relative",
  },
  noteTouchArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  noteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  noteTypeTag: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  noteSnippet: {
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
    marginTop: 2,
  },
  linkCard: {
    width: 144,
    height: 130,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    position: "relative",
  },
  linkTouchArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  linkTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  linkIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  domainChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3B82F6",
    flex: 1,
  },
  linkTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  linkFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkOpenText: {
    fontSize: 11,
    fontWeight: "700",
  },
  docCard: {
    width: 144,
    height: 130,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    position: "relative",
  },
  docTouchArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  docTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  docIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  docTypeBadge: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  docTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  docFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  docSizeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  addMoreCard: {
    width: 60,
    height: 130,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addMoreIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addMoreText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
