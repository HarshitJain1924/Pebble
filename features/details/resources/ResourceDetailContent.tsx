import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ResourceRepository } from "@/repositories";
import { WorkspaceRepository } from "@/repositories";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import type { Resource, Workspace } from "@/shared/types/domain.types";
import { INBOX_WORKSPACE_ID } from "@/shared/types/domain.types";

import { DetailShell } from "@/features/details/components/DetailShell";
import { DetailHeader } from "@/features/details/components/DetailHeader";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useUndo } from "@/shared/components/ui/UndoContext";

import { NoteResourceView } from "./views/NoteResourceView";
import { IdeaResourceView } from "./views/IdeaResourceView";
import { LinkResourceView } from "./views/LinkResourceView";
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

  const loadData = useCallback(async () => {
    if (!resourceId) return;
    setLoading(true);
    try {
      const wss = await WorkspaceRepository.getWorkspaces();
      setWorkspaces(wss);

      // If workspaceId is passed, use it. Otherwise guess it's in inbox or try to find it.
      // Wait, ResourceRepository.getResource requires workspaceId. If not provided, we might have to search.
      // Usually the list passes workspaceId. Let's try the provided one, or search all.
      let res: Resource | null = null;
      if (workspaceId) {
        res = await ResourceRepository.getResource(resourceId, workspaceId);
      } 
      if (!res) {
        // Fallback search across workspaces
        const allWss = [INBOX_WORKSPACE_ID, ...wss.map(w => w.id)];
        for (const wId of allWss) {
          res = await ResourceRepository.getResource(resourceId, wId);
          if (res) break;
        }
      }
      setResource(res);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.warn("Failed to update resource", e);
      Alert.alert("Error", "Could not save changes.");
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

  const currentWorkspace = workspaces.find(w => w.id === resource.workspaceId) || { name: "Inbox", emoji: "📥" };

  const getIcon = () => {
    switch (resource.type) {
      case "idea": return <Feather name={"lightbulb" as any} size={18} color="#EAB308" />;
      case "link": return <Feather name="link" size={18} color="#3B82F6" />;
      default: return <Feather name="align-left" size={18} color="#8B5CF6" />;
    }
  };

  const getSubtitle = () => {
    switch (resource.type) {
      case "idea": return "Idea";
      case "link": return "Link";
      default: return "Note";
    }
  };

  const header = (
    <View style={styles.header}>
      <DetailHeader
        title=""
        onBack={onBack}
        action={
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="trash-2" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        }
      />
    </View>
  );

  return (
    <DetailShell header={header} contentContainerStyle={styles.content}>
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

      {/* Type-Specific View */}
      {resource.type === "idea" ? (
        <IdeaResourceView resource={resource} onUpdate={handleUpdate} />
      ) : resource.type === "link" ? (
        <LinkResourceView resource={resource} onUpdate={handleUpdate} />
      ) : (
        <NoteResourceView resource={resource} onUpdate={handleUpdate} />
      )}

      {/* Relationships */}
      <ResourceRelationships resourceId={resource.id} workspaceId={resource.workspaceId} />
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
  identitySection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metadataText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
