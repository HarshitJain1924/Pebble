import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ResourceRepository } from "@/repositories";
import { WorkspaceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Resource, Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

import { DetailShell } from "@/features/details/components/DetailShell";
import { DetailHeader } from "@/features/details/components/DetailHeader";
import { DetailSection } from "@/features/details/components/DetailSection";
import { DetailActions } from "@/features/details/components/DetailActions";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { PressableScale } from "@/shared/components/ui/PressableScale";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useUndo } from "@/shared/components/ui/UndoContext";

import { NoteResourceView } from "./views/NoteResourceView";
import { IdeaResourceView } from "./views/IdeaResourceView";
import { LinkResourceView } from "./views/LinkResourceView";
import { MediaResourceView } from "./views/MediaResourceView";
import { ResourceRelationships } from "./components/ResourceRelationships";

export interface ResourceDetailContentProps {
  resourceId: string;
  workspaceId?: string;
  onBack: () => void;
}

export const ResourceDetailContent: React.FC<ResourceDetailContentProps> = ({
  resourceId,
  workspaceId,
  onBack,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const { showUndo } = useUndo();

  const [resource, setResource] = useState<Resource | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editWorkspaceId, setEditWorkspaceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!resourceId) return;
    setLoading(true);
    try {
      const wss = await WorkspaceRepository.getWorkspaces();
      setWorkspaces(wss);

      let res: Resource | null = null;
      if (workspaceId) {
        res = await ResourceRepository.getResource(resourceId, workspaceId);
      }
      if (!res) {
        const allWss = [INBOX_WORKSPACE_ID, ...wss.map((w) => w.id)];
        for (const wId of allWss) {
          res = await ResourceRepository.getResource(resourceId, wId);
          if (res) break;
        }
      }
      setResource(res);
      if (res) {
        setEditTitle(res.title || "");
        setEditBody(res.body || "");
        setEditUrl(res.attachments?.[0]?.uri || "");
        setEditWorkspaceId(res.workspaceId || INBOX_WORKSPACE_ID);
      }
    } catch (e) {
      console.warn("Failed to load resource detail", e);
    } finally {
      setLoading(false);
    }
  }, [resourceId, workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdate = async (patch: Partial<Resource>) => {
    if (!resource) return;
    try {
      const updated = { ...resource, ...patch, updatedAt: Date.now() };
      await ResourceRepository.saveResource(updated);
      setResource(updated);
      setEditTitle(updated.title || "");
      setEditBody(updated.body || "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.warn("Failed to update resource", e);
      Alert.alert("Error", "Could not save changes.");
    }
  };

  const handleSaveEdit = async () => {
    if (!resource) return;
    if (!editTitle.trim()) {
      Alert.alert("Required", "Please provide a resource title.");
      return;
    }

    setIsSaving(true);
    try {
      let currentWs = resource.workspaceId;

      // Handle moving workspace if changed
      if (editWorkspaceId && editWorkspaceId !== currentWs) {
        await EntityCommandService.moveResource(resource.id, currentWs, editWorkspaceId);
        currentWs = editWorkspaceId;
      }

      // Update resource fields
      const updatedAttachments = resource.type === "link" && editUrl.trim()
        ? [{ id: `att-${Date.now()}-url`, name: editUrl.trim(), uri: editUrl.trim(), mimeType: "text/plain" }]
        : resource.attachments;

      const updated: Resource = {
        ...resource,
        workspaceId: currentWs,
        title: editTitle.trim(),
        body: editBody.trim() || undefined,
        attachments: updatedAttachments,
        updatedAt: Date.now(),
      };

      await ResourceRepository.saveResource(updated);
      setResource(updated);
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.warn("Failed to save resource edits", e);
      Alert.alert("Error", "Could not save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!resource) return;
    setEditTitle(resource.title || "");
    setEditBody(resource.body || "");
    setEditUrl(resource.attachments?.[0]?.uri || "");
    setEditWorkspaceId(resource.workspaceId || INBOX_WORKSPACE_ID);
    setIsEditing(false);
  };

  const handleToggleArchive = async () => {
    if (!resource) return;
    try {
      const isArchived = Boolean(resource.archivedAt);
      const updated: Resource = {
        ...resource,
        archivedAt: isArchived ? undefined : Date.now(),
        updatedAt: Date.now(),
      };
      await ResourceRepository.saveResource(updated);
      setResource(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.warn("Failed to toggle archive resource", e);
    }
  };

  const handleDelete = async () => {
    if (!resource) return;
    Alert.alert("Delete Resource", `Delete "${resource.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await EntityCommandService.recycleResource(resource.id, resource.workspaceId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onBack();
          } catch (e) {
            console.warn("Failed to delete resource", e);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!resource) {
    return (
      <DetailShell
        header={
          <DetailHeader title="Resource Not Found" onBack={onBack} />
        }
      >
        <View style={styles.center}>
          <Feather name="file-minus" size={48} color={colors.border} style={{ marginBottom: 16 }} />
          <Text style={{ color: colors.textMuted }}>This resource has been deleted or is unavailable.</Text>
        </View>
      </DetailShell>
    );
  }

  const currentWorkspace = workspaces.find((w) => w.id === resource.workspaceId) || { name: "Inbox", emoji: "📥" };
  const hasAttachment = Boolean(resource.attachments && resource.attachments.length > 0);
  const isImageAttachment = Boolean(hasAttachment && resource.attachments?.[0]?.mimeType?.startsWith("image/"));
  const isArchived = Boolean(resource.archivedAt);

  const getIcon = () => {
    if (hasAttachment) {
      return isImageAttachment ? (
        <Feather name="image" size={18} color="#10B981" />
      ) : (
        <Feather name="paperclip" size={18} color="#06B6D4" />
      );
    }
    switch (resource.type) {
      case "idea": return <Feather name={"lightbulb" as any} size={18} color="#EAB308" />;
      case "link": return <Feather name="link" size={18} color="#3B82F6" />;
      default: return <Feather name="align-left" size={18} color="#8B5CF6" />;
    }
  };

  const getSubtitle = () => {
    if (hasAttachment) {
      return isImageAttachment ? "Media" : "Document";
    }
    switch (resource.type) {
      case "idea": return "Idea";
      case "link": return "Link";
      default: return "Note";
    }
  };

  const header = (
    <View style={styles.header}>
      <DetailHeader
        title={isEditing ? "Edit Resource" : "Resource Details"}
        onBack={isEditing ? handleCancelEdit : onBack}
        icon={getIcon()}
        action={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (isEditing) {
                  void handleSaveEdit();
                } else {
                  setIsEditing(true);
                }
              }}
              style={[
                styles.editSaveBtn,
                {
                  backgroundColor: isEditing ? `${colors.primary}20` : "transparent",
                  borderColor: isEditing ? colors.primary : colors.border,
                },
              ]}
              disabled={isSaving}
            >
              <Feather
                name={isEditing ? "check" : "edit-2"}
                size={15}
                color={colors.primary}
              />
              <Text style={[styles.editSaveBtnText, { color: colors.primary }]}>
                {isEditing ? (isSaving ? "Saving..." : "Save") : "Edit"}
              </Text>
            </TouchableOpacity>

            {!isEditing && (
              <TouchableOpacity
                onPress={handleDelete}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.deleteIconBtn}
              >
                <Feather name="trash-2" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );

  return (
    <DetailShell header={header} contentContainerStyle={styles.content}>
      {isArchived && (
        <View style={[styles.archiveBanner, { backgroundColor: `${colors.warning}15`, borderColor: colors.warning }]}>
          <Feather name="archive" size={15} color={colors.warning} />
          <Text style={[styles.archiveBannerText, { color: colors.warning }]}>
            This resource is currently archived.
          </Text>
        </View>
      )}

      {/* VIEW MODE */}
      {!isEditing ? (
        <View style={{ gap: 20 }}>
          {/* Strong Resource Identity */}
          <View style={styles.identitySection}>
            <Text style={[styles.title, { color: colors.text }]}>{resource.title || "Untitled"}</Text>
            <View style={styles.metadataRow}>
              {getIcon()}
              <Text style={[styles.metadataText, { color: colors.textMuted }]}>
                {`${currentWorkspace.emoji || ""} ${currentWorkspace.name}`.trim()} · {getSubtitle()}
              </Text>
            </View>
          </View>

          {/* Type-Specific Content View */}
          {hasAttachment ? (
            <MediaResourceView resource={resource} onUpdate={handleUpdate} />
          ) : resource.type === "idea" ? (
            <IdeaResourceView resource={resource} onUpdate={handleUpdate} />
          ) : resource.type === "link" ? (
            <LinkResourceView resource={resource} onUpdate={handleUpdate} />
          ) : (
            <NoteResourceView resource={resource} onUpdate={handleUpdate} />
          )}

          {/* Connected Relationships */}
          <ResourceRelationships resourceId={resource.id} workspaceId={resource.workspaceId} />

          {/* Actions Section */}
          <DetailActions
            actions={[
              {
                key: "archive",
                label: isArchived ? "Restore from Archive" : "Archive Resource",
                icon: <Feather name={isArchived ? "unlock" : "archive"} size={16} color={colors.primary} />,
                onPress: handleToggleArchive,
              },
              {
                key: "delete",
                label: "Delete Resource",
                tone: "danger",
                icon: <Feather name="trash-2" size={16} color="#FFFFFF" />,
                onPress: handleDelete,
              },
            ]}
          />
        </View>
      ) : (
        /* EDIT MODE */
        <View style={styles.editForm}>
          {/* Title Field */}
          <DetailSection title="Title">
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              style={[styles.formInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Resource Title..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
          </DetailSection>

          {/* Workspace Folder Field */}
          <DetailSection title="Workspace">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wsRow}>
              {workspaces.map((ws) => {
                const isSelected = editWorkspaceId === ws.id;
                return (
                  <PressableScale
                    key={ws.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setEditWorkspaceId(ws.id);
                    }}
                    style={[
                      styles.wsPill,
                      {
                        backgroundColor: isSelected ? `${colors.primary}20` : `${colors.border}30`,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.wsEmoji}>{ws.emoji || "📁"}</Text>
                    <Text style={[styles.wsName, { color: isSelected ? colors.primary : colors.text }]}>
                      {ws.name}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </DetailSection>

          {/* Link URL (if Link Resource) */}
          {resource.type === "link" && (
            <DetailSection title="Link URL">
              <TextInput
                value={editUrl}
                onChangeText={setEditUrl}
                style={[styles.formInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                keyboardType="url"
                autoCapitalize="none"
              />
            </DetailSection>
          )}

          {/* Content / Notes / Caption */}
          <DetailSection title={hasAttachment ? "Notes / Caption" : "Content & Notes"}>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              style={[styles.formInput, styles.formTextArea, { color: colors.text, borderColor: colors.border }]}
              placeholder="Add details, notes, or caption..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
            />
          </DetailSection>

          {/* Bottom Save / Cancel CTAs */}
          <View style={styles.editButtonsRow}>
            <TouchableOpacity
              onPress={handleCancelEdit}
              style={[styles.cancelBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>

            <PressableScale
              onPress={handleSaveEdit}
              haptic
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>Save Changes</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </DetailShell>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  content: {
    paddingBottom: 64,
  },
  archiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  archiveBannerText: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
  },
  identitySection: {
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metadataText: {
    fontSize: 14,
    fontWeight: "600",
  },
  editSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  editSaveBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  deleteIconBtn: {
    padding: 4,
  },
  editForm: {
    gap: 20,
  },
  formInput: {
    fontSize: 15,
    padding: 0,
  },
  formTextArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  wsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  wsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  wsEmoji: {
    fontSize: 14,
  },
  wsName: {
    fontSize: 13,
    fontWeight: "700",
  },
  editButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  saveBtn: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 20,
  },
});
