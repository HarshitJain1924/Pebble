import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  Image,
  Dimensions,
  Share,
} from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppCard } from "@/components/AppCard";
import { AnimatedOverlay } from "@/components/ui/AnimatedOverlay";
import { type Collection, type CollectionItem, type TaskList, type Todo, type Habit, type Checklist } from "../types";
import PressableScale from "@/components/ui/PressableScale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const QUICK_ACCESS_CARD_WIDTH = (SCREEN_WIDTH - 48) / 2.5;

// ─── Types ──────────────────────────────────────────────────────────
type ResourceWithMeta = CollectionItem & { collectionId: string };

interface VaultSectionProps {
  collections: Record<string, Collection[]>;
  lists: TaskList[];
  createCollection: (workspaceId: string, name: string, emoji: string) => Promise<void>;
  deleteCollection: (id: string, workspaceId: string) => Promise<void>;
  renameCollection: (id: string, workspaceId: string, name: string, emoji: string) => Promise<void>;
  addCollectionItem: (workspaceId: string, collectionId: string, item: any) => Promise<void>;
  updateCollectionItem: (itemId: string, collectionId: string, workspaceId: string, updates: any) => Promise<void>;
  deleteCollectionItem: (id: string, collectionId: string, workspaceId: string) => Promise<void>;
  toggleArchiveCollectionItem: (id: string, collectionId: string, workspaceId: string) => Promise<void>;
  togglePinCollectionItem: (id: string, collectionId: string, workspaceId: string) => Promise<void>;
  convertCollectionItemToTask: (item: any) => Promise<void>;
  searchQuery: string;
  activeFolderId: string;
  stateTodos?: Todo[];
  stateHabits?: Habit[];
  stateChecklists?: Checklist[];
  onToggleLinkResource?: (itemId: string, itemType: "task" | "habit" | "checklist", resourceId: string) => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────────────
export function VaultSection({
  collections,
  lists,
  createCollection,
  deleteCollection,
  renameCollection,
  addCollectionItem,
  updateCollectionItem,
  deleteCollectionItem,
  toggleArchiveCollectionItem,
  togglePinCollectionItem,
  convertCollectionItemToTask,
  searchQuery,
  activeFolderId,
  stateTodos = [],
  stateHabits = [],
  stateChecklists = [],
  onToggleLinkResource,
}: VaultSectionProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  // ─── State ──────────────────────────────────────────────────────
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [newResType, setNewResType] = useState<"link" | "note" | "file">("note");
  const [newResTitle, setNewResTitle] = useState("");
  const [newResUrl, setNewResUrl] = useState("");
  const [newResContent, setNewResContent] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // File picker state
  const [pickedFile, setPickedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);

  // Detail sheet
  const [selectedResource, setSelectedResource] = useState<ResourceWithMeta | null>(null);

  // Edit Resource modal/sheet state
  const [editingResource, setEditingResource] = useState<ResourceWithMeta | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editContent, setEditContent] = useState("");

  // Overflow menu
  const [overflowResource, setOverflowResource] = useState<ResourceWithMeta | null>(null);

  // Link manager
  const [linkingResource, setLinkingResource] = useState<ResourceWithMeta | null>(null);
  const [linkingSearch, setLinkingSearch] = useState("");
  const [linkingSegment, setLinkingSegment] = useState<"task" | "habit" | "checklist">("task");



  // ─── Derived Data ─────────────────────────────────────────────────
  const allResources = useMemo<ResourceWithMeta[]>(() => {
    const list = collections[activeFolderId] || [];
    const items: ResourceWithMeta[] = [];
    list.forEach((coll) => {
      if (coll.items) {
        coll.items.forEach((item) => {
          if (!item.archived) {
            items.push({ ...item, collectionId: coll.id });
          }
        });
      }
    });
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [collections, activeFolderId]);

  const getLinkedItems = useCallback(
    (resourceId: string) => {
      const linked: { id: string; title: string; type: "task" | "habit" | "checklist" }[] = [];
      stateTodos.forEach((todo) => {
        if (todo.linkedCollectionIds?.includes(resourceId)) {
          linked.push({ id: todo.id, title: todo.title, type: "task" });
        }
      });
      stateHabits.forEach((habit) => {
        if (habit.linkedCollectionIds?.includes(resourceId)) {
          linked.push({ id: habit.id, title: habit.title, type: "habit" });
        }
      });
      stateChecklists.forEach((chk) => {
        if (chk.linkedCollectionIds?.includes(resourceId)) {
          linked.push({ id: chk.id, title: chk.title, type: "checklist" });
        }
      });
      return linked;
    },
    [stateTodos, stateHabits, stateChecklists]
  );

  // Knowledge Hub sections
  const pinnedResources = useMemo(
    () => allResources.filter((r) => r.pinned),
    [allResources]
  );

  const recentResources = useMemo(
    () => allResources.filter((r) => !r.pinned).slice(0, 5),
    [allResources]
  );

  const everythingResources = useMemo(
    () =>
      allResources
        .filter((r) => !r.pinned)
        .slice(5)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [allResources]
  );

  // Search results - flat filtered list
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return allResources.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.content?.toLowerCase().includes(q) ||
        r.url?.toLowerCase().includes(q)
    );
  }, [allResources, searchQuery]);

  const connectedCount = useMemo(
    () => allResources.filter((r) => getLinkedItems(r.id).length > 0).length,
    [allResources, getLinkedItems]
  );

  // Link manager filtering
  const filteredLinkingOptions = useMemo(() => {
    const q = linkingSearch.toLowerCase().trim();
    if (linkingSegment === "task") {
      return q === "" ? stateTodos : stateTodos.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (linkingSegment === "habit") {
      return q === "" ? stateHabits : stateHabits.filter((h) => h.title.toLowerCase().includes(q));
    }
    return q === "" ? stateChecklists : stateChecklists.filter((c) => c.title.toLowerCase().includes(q));
  }, [linkingSearch, linkingSegment, stateTodos, stateHabits, stateChecklists]);

  // ─── Helpers ──────────────────────────────────────────────────────
  const getDomainName = (url?: string) => {
    if (!url) return "";
    try {
      const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^:\/\s]+)/i);
      return match ? match[1] : url;
    } catch {
      return url;
    }
  };

  const getRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const getFileCategory = (mimeType?: string): string => {
    if (!mimeType) return "file";
    const mime = mimeType.toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    if (mime.includes("zip") || mime.includes("archive") || mime.includes("compressed") || mime.includes("tar") || mime.includes("rar")) return "archive";
    if (mime.includes("audio") || mime.includes("mp3") || mime.includes("wav") || mime.includes("m4a") || mime.includes("ogg")) return "audio";
    if (mime.includes("video") || mime.includes("mp4") || mime.includes("mov") || mime.includes("avi") || mime.includes("mkv")) return "video";
    if (mime.includes("word") || mime.includes("document") || mime.includes("docx") || mime.includes("doc") || mime.includes("rtf")) return "document";
    if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv") || mime.includes("xlsx") || mime.includes("xls")) return "spreadsheet";
    if (mime.includes("presentation") || mime.includes("powerpoint") || mime.includes("pptx") || mime.includes("ppt")) return "presentation";
    if (mime.includes("text/plain") || mime.includes("text/markdown")) return "document";
    return "file";
  };

  const getTypeIcon = (type: string, mimeType?: string): string => {
    if (type === "link") return "globe";
    if (type === "note") return "file-text";
    const category = getFileCategory(mimeType);
    switch (category) {
      case "image": return "image";
      case "pdf": return "file-text";
      case "archive": return "archive";
      case "audio": return "music";
      case "video": return "video";
      case "document": return "file-text";
      case "spreadsheet": return "grid";
      case "presentation": return "monitor";
      default: return "file";
    }
  };

  const getTypeColor = (type: string, mimeType?: string) => {
    if (type === "link") return theme.primary;
    if (type === "note") return "#A78BFA"; // Lavender
    const category = getFileCategory(mimeType);
    switch (category) {
      case "image": return "#F59E0B"; // Amber
      case "pdf": return "#EF4444"; // Red
      case "archive": return "#6366F1"; // Indigo
      case "audio": return "#EC4899"; // Pink
      case "video": return "#8B5CF6"; // Violet
      case "document": return "#3B82F6"; // Blue
      case "spreadsheet": return "#10B981"; // Green
      case "presentation": return "#F59E0B"; // Orange
      default: return theme.textMuted;
    }
  };

  const getFileLabel = (item: CollectionItem): string => {
    if (item.type === "link") return `Link • ${getDomainName(item.url)}`;
    if (item.type === "note") return "Note";
    // File: show category + human-readable size
    const category = getFileCategory(item.mimeType);
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    if (item.fileSize) {
      const kb = item.fileSize / 1024;
      const sizeStr = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
      return `${label} • ${sizeStr}`;
    }
    return label;
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${Math.round(kb)} KB`;
  };

  const handleOpenUrl = async (url?: string) => {
    if (!url) return;
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      await Linking.openURL(formattedUrl);
    } catch {
      Alert.alert("Error", `Could not open link: ${formattedUrl}`);
    }
  };

  const handleOpenFile = async (localUri: string, mimeType?: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: mimeType || "application/pdf",
          dialogTitle: "Open File",
        });
      } else {
        Alert.alert("Error", "Sharing and file viewing is not supported on this device.");
      }
    } catch (e: any) {
      console.warn("Failed to open file", e);
      Alert.alert(
        "Open File",
        "Could not open file directly.",
        [
          { text: "OK", style: "default" },
        ]
      );
    }
  };

  const handleShare = async (item: CollectionItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const shareContent =
      item.type === "link"
        ? item.url
        : item.type === "note"
        ? `${item.title}\n\n${item.content}`
        : item.type === "file"
        ? item.localUri || item.fileName || item.title
        : item.mediaUri || item.title;
    if (!shareContent) return;
    try {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        await Share.share({ message: shareContent, title: item.title });
      } else {
        await Clipboard.setStringAsync(shareContent);
        Alert.alert("Copied to Clipboard", "Resource details copied successfully.");
      }
    } catch (error: any) {
      Alert.alert("Error Sharing", error.message);
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];

      // Create the pebble-resources directory inside app's document dir
      const resourcesDir = new FileSystem.Directory(FileSystem.Paths.document, "pebble-resources");
      if (!resourcesDir.exists) {
        resourcesDir.create();
      }

      const fileName = asset.name || `file-${Date.now()}`;
      const destFileName = `${Date.now()}-${fileName}`;

      // Copy picked file from cache to persistent storage
      const sourceFile = new FileSystem.File(asset.uri);
      const destFile = new FileSystem.File(resourcesDir, destFileName);
      sourceFile.copy(destFile);

      setPickedFile({
        uri: destFile.uri,
        name: fileName,
        size: asset.size,
        mimeType: asset.mimeType || undefined,
      });

      // Auto-fill title from file name if empty
      if (!newResTitle.trim()) {
        const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
        setNewResTitle(nameWithoutExt);
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e) {
      console.warn("File pick failed", e);
    }
  };

  const handleAddResource = async () => {
    // For file type, we need a picked file. For others, we need a title.
    if (newResType === "file" && !pickedFile) return;
    if (newResType !== "file" && !newResTitle.trim()) return;

    let targetCollectionId = "default";
    const workspaceCollections = collections[activeFolderId] || [];
    if (workspaceCollections.length === 0) {
      await createCollection(activeFolderId, "General Resources", "📎");
      const updatedCollections = collections[activeFolderId] || [];
      const newColl = updatedCollections[0];
      if (newColl) targetCollectionId = newColl.id;
    } else {
      targetCollectionId = workspaceCollections[0].id;
    }

    const itemPayload: any = {
      type: newResType,
      title: newResTitle.trim() || (pickedFile?.name || "Untitled"),
      createdAt: Date.now(),
    };

    if (newResType === "link") {
      itemPayload.url = newResUrl.trim();
    } else if (newResType === "note") {
      itemPayload.content = newResContent.trim();
    } else if (newResType === "file" && pickedFile) {
      itemPayload.localUri = pickedFile.uri;
      itemPayload.fileName = pickedFile.name;
      itemPayload.fileSize = pickedFile.size;
      itemPayload.mimeType = pickedFile.mimeType;
      // For images, also set mediaUri for thumbnail previews
      if (pickedFile.mimeType?.startsWith("image/")) {
        itemPayload.mediaUri = pickedFile.uri;
      }
    }

    await addCollectionItem(activeFolderId, targetCollectionId, itemPayload);
    setNewResTitle("");
    setNewResUrl("");
    setNewResContent("");
    setPickedFile(null);
    setIsAddingResource(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // ─── Sub-Components ───────────────────────────────────────────────

  /** Connection count badge for resource cards */
  const ConnectionCountBadge = ({ resourceId }: { resourceId: string }) => {
    const linked = getLinkedItems(resourceId);
    if (linked.length === 0) return null;
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: isLight ? "#EEF2F6" : `${theme.primary}12`,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isLight ? "#E2E8F0" : `${theme.primary}20`,
        }}
      >
        <Feather name="paperclip" size={10} color={theme.primary} />
        <Text style={{ fontSize: 10, fontWeight: "700", color: theme.primary }}>
          {linked.length}
        </Text>
      </View>
    );
  };

  /** Standard resource row used in Recently Added and Everything sections */
  const ResourceRow = ({ item }: { item: ResourceWithMeta }) => {
    const linked = getLinkedItems(item.id);
    const colorAccent = getTypeColor(item.type, item.mimeType);
    const iconBg = isLight ? "#EEF2F6" : colorAccent + "12";
    
    // Note preview snippet
    const hasSnippet = item.type === "note" && item.content;
    const snippet = hasSnippet ? item.content?.trim().replace(/\n+/g, " ") : "";

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 4,
        }}
      >
        {/* Tappable content area */}
        <PressableScale
          onPress={() => setSelectedResource(item)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setOverflowResource(item);
          }}
          style={{ flex: 1 }}
          contentStyle={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Icon/Thumbnail Container */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: iconBg,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderWidth: 1,
              borderColor: isLight ? "#E2E8F0" : colorAccent + "25",
              flexShrink: 0,
            }}
          >
            {item.mediaUri || (item.type === "file" && item.mimeType?.startsWith("image/") && item.localUri) ? (
              <Image
                source={{ uri: item.mediaUri || item.localUri }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Feather name={getTypeIcon(item.type, item.mimeType) as any} size={20} color={colorAccent} />
            )}
          </View>

          {/* Text Content */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, flex: 1 }} numberOfLines={1}>
                {item.title}
              </Text>
              <ConnectionCountBadge resourceId={item.id} />
            </View>

            {hasSnippet ? (
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 3, lineHeight: 16 }} numberOfLines={1}>
                {snippet}
              </Text>
            ) : null}

            {/* Metadata line */}
            <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }} numberOfLines={1}>
              {getFileLabel(item)}
              {" • "}
              {getRelativeTime(item.createdAt)}
            </Text>
          </View>
        </PressableScale>

        {/* Overflow dots — separate touch target */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setOverflowResource(item);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ padding: 6 }}
        >
          <Feather name="more-horizontal" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  /** Quick Access pinned card */
  const QuickAccessCard = ({ item }: { item: ResourceWithMeta }) => {
    const linked = getLinkedItems(item.id);
    const colorAccent = getTypeColor(item.type, item.mimeType);
    const iconBg = isLight ? "#EEF2F6" : colorAccent + "12";
    const hasSnippet = item.type === "note" && item.content;
    const snippet = hasSnippet ? item.content?.trim().replace(/\n+/g, " ") : "";

    return (
      <PressableScale
        onPress={() => setSelectedResource(item)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          setOverflowResource(item);
        }}
        style={{
          width: QUICK_ACCESS_CARD_WIDTH,
          height: 120,
        }}
        contentStyle={{
          height: 120,
          borderRadius: 16,
          backgroundColor: isLight ? "#F8FAFC" : "#1F1F23",
          borderWidth: 1,
          borderColor: theme.border,
          padding: 14,
          justifyContent: "space-between",
        }}
      >
        {/* Icon / Thumbnail Row */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: iconBg,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderWidth: 1,
              borderColor: isLight ? "#E2E8F0" : colorAccent + "20",
            }}
          >
            {item.mediaUri || (item.type === "file" && item.mimeType?.startsWith("image/") && item.localUri) ? (
              <Image
                source={{ uri: item.mediaUri || item.localUri }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Feather name={getTypeIcon(item.type, item.mimeType) as any} size={16} color={colorAccent} />
            )}
          </View>

          {linked.length > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Feather name="paperclip" size={10} color={theme.primary} style={{ opacity: 0.8 }} />
              <Text style={{ fontSize: 10, fontWeight: "700", color: theme.primary }}>{linked.length}</Text>
            </View>
          ) : null}
        </View>

        {/* Title + content snippet */}
        <View style={{ gap: 2, flex: 1, justifyContent: "flex-end", marginTop: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }} numberOfLines={hasSnippet ? 1 : 2}>
            {item.title}
          </Text>
          {hasSnippet ? (
            <Text style={{ fontSize: 10, color: theme.textMuted }} numberOfLines={1}>
              {snippet}
            </Text>
          ) : (
            <Text style={{ fontSize: 10, color: theme.textMuted }}>
              {getFileLabel(item).split(" • ")[0]}
            </Text>
          )}
        </View>
      </PressableScale>
    );
  };

  /** Section header */
  const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, marginBottom: 8 }}>
      <Text style={{ fontSize: 12, color: theme.textMuted }}>{icon}</Text>
      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {title}
      </Text>
    </View>
  );

  /** Separator line between rows */
  const RowSeparator = () => (
    <View style={{ height: 1, backgroundColor: theme.border, opacity: 0.4, marginHorizontal: 4 }} />
  );

  // ─── Render ───────────────────────────────────────────────────────
  const isSearching = searchQuery.trim() !== "";
  const isEmptyWorkspace = allResources.length === 0;

  return (
    <View style={styles.container}>
      {/* ── Header Metrics ──────────────────────────────────────── */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 4, marginBottom: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: theme.text }}>
          Resources
        </Text>
        {!isEmptyWorkspace && (
          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textMuted }}>
            {allResources.length} {allResources.length === 1 ? "resource" : "resources"} • {connectedCount} connected
          </Text>
        )}
      </View>

      {/* ── Quick Add Form ──────────────────────────────────────── */}
      {isAddingResource && (
        <AppCard
          style={{
            padding: 14,
            borderRadius: 18,
            borderWidth: 1.5,
            borderColor: theme.border,
            backgroundColor: theme.card,
            gap: 10,
            marginTop: 8,
            marginBottom: 4,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Add Resource
          </Text>

          {/* Type selector - Descriptive Option Cards */}
          <View style={{ gap: 8, marginVertical: 4 }}>
            {(["note", "link", "file"] as const).map((t) => {
              const isActive = newResType === t;
              const icon = t === "note" ? "file-text" : t === "link" ? "globe" : "folder";
              const title = t === "note" ? "Note" : t === "link" ? "Link" : "File";
              const subtitle =
                t === "note"
                  ? "Capture ideas, meeting notes and thoughts"
                  : t === "link"
                  ? "Save websites and online references"
                  : "Import PDFs, images, documents and more";

              const colorAccent = t === "note" ? "#A78BFA" : t === "link" ? theme.primary : "#EF4444";

              return (
                <PressableScale
                  key={t}
                  onPress={() => {
                    setNewResType(t);
                    if (t !== "file") setPickedFile(null);
                  }}
                  scaleTo={0.98}
                  contentStyle={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: isActive 
                      ? (isLight ? "#EEF2F6" : `${theme.primary}12`) 
                      : (isLight ? "#F8FAFC" : "#1F1F23"),
                    borderWidth: 1.5,
                    borderColor: isActive ? theme.primary : theme.border,
                  }}
                >
                  {/* Icon Container */}
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: isActive ? `${colorAccent}20` : (isLight ? "#E2E8F0" : "#27272A"),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name={icon as any} size={16} color={isActive ? colorAccent : theme.textMuted} />
                  </View>

                  {/* Text details */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>
                      {title}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {subtitle}
                    </Text>
                  </View>

                  {/* Check indicator */}
                  {isActive ? (
                    <Feather name="check" size={16} color={theme.primary} />
                  ) : null}
                </PressableScale>
              );
            })}
          </View>

          <TextInput
            value={newResTitle}
            onChangeText={setNewResTitle}
            placeholder={newResType === "file" ? "Resource title (auto-filled from file)..." : "Resource Title (e.g. Figma Design)..."}
            placeholderTextColor={theme.textMuted}
            style={{
              backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
              color: theme.text,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
            }}
          />

          {newResType === "link" && (
            <TextInput
              value={newResUrl}
              onChangeText={setNewResUrl}
              placeholder="URL (e.g. figma.com/file/...)..."
              placeholderTextColor={theme.textMuted}
              style={{
                backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                color: theme.text,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
              }}
            />
          )}

          {newResType === "note" && (
            <TextInput
              value={newResContent}
              onChangeText={setNewResContent}
              placeholder="Note content..."
              placeholderTextColor={theme.textMuted}
              style={{
                backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                color: theme.text,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                minHeight: 60,
              }}
              multiline
            />
          )}

          {newResType === "file" && (
            <TouchableOpacity
              onPress={handlePickFile}
              style={{
                borderWidth: 1.5,
                borderColor: pickedFile ? theme.primary + "60" : theme.border,
                borderStyle: pickedFile ? "solid" : "dashed",
                borderRadius: 12,
                paddingVertical: pickedFile ? 12 : 20,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pickedFile ? (isLight ? "#F0F0FF" : `${theme.primary}08`) : "transparent",
                gap: 6,
              }}
            >
              {pickedFile ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%" }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: isLight ? "#E2E8F0" : "#27272A",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {pickedFile.mimeType?.startsWith("image/") ? (
                      <Image source={{ uri: pickedFile.uri }} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <Feather
                        name={getTypeIcon("file", pickedFile.mimeType) as any}
                        size={16}
                        color={getTypeColor("file", pickedFile.mimeType)}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }} numberOfLines={1}>
                      {pickedFile.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.textMuted }}>
                      {getFileCategory(pickedFile.mimeType).charAt(0).toUpperCase() + getFileCategory(pickedFile.mimeType).slice(1)}
                      {pickedFile.size ? ` • ${formatFileSize(pickedFile.size)}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPickedFile(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Feather name="upload" size={20} color={theme.primary} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.primary }}>Choose File</Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted }}>Images, PDFs, documents, and more</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => {
                setIsAddingResource(false);
                setPickedFile(null);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddResource}
              disabled={newResType === "file" ? !pickedFile : !newResTitle.trim()}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: theme.primary,
                opacity: (newResType === "file" ? !!pickedFile : !!newResTitle.trim()) ? 1 : 0.5,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>Add</Text>
            </TouchableOpacity>
          </View>
        </AppCard>
      )}

      {/* ── Empty State ─────────────────────────────────────────── */}
      {isEmptyWorkspace && !isAddingResource ? (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 16 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: isLight ? "#F1F5F9" : "#1F1F23",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 36 }}>🐦‍⬛</Text>
          </View>
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}>
              Your workspace library
            </Text>
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 13,
                textAlign: "center",
                maxWidth: 240,
                lineHeight: 19,
              }}
            >
              Add links, notes, images, or files to build a knowledge base for this workspace.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsAddingResource(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: theme.primary,
              marginTop: 4,
            }}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}>Add Resource</Text>
          </TouchableOpacity>
        </View>
      ) : !isEmptyWorkspace ? (
        <View>
          {/* ── Search Results (flat list) ───────────────────────── */}
          {isSearching && searchResults ? (
            <View>
              <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textMuted, marginTop: 12, marginBottom: 4, paddingHorizontal: 4 }}>
                {searchResults.length} {searchResults.length === 1 ? "result" : "results"}
              </Text>
              {searchResults.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                  <Feather name="search" size={28} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>No resources found</Text>
                </View>
              ) : (
                searchResults.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    <ResourceRow item={item} />
                    {idx < searchResults.length - 1 && <RowSeparator />}
                  </React.Fragment>
                ))
              )}
            </View>
          ) : (
            /* ── Knowledge Hub Sections ───────────────────────── */
            <View>
              {/* ── ⭐ Quick Access ──────────────────────────── */}
              {pinnedResources.length > 0 && (
                <View>
                  <SectionHeader icon="⭐" title="Quick Access" />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingBottom: 4 }}
                  >
                    {pinnedResources.map((item) => (
                      <QuickAccessCard key={item.id} item={item} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── 🕐 Recently Added ────────────────────────── */}
              {recentResources.length > 0 && (
                <View>
                  <SectionHeader icon="🕐" title="Recently Added" />
                  {recentResources.map((item, idx) => (
                    <React.Fragment key={item.id}>
                      <ResourceRow item={item} />
                      {idx < recentResources.length - 1 && <RowSeparator />}
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* ── 📚 Everything ────────────────────────────── */}
              {everythingResources.length > 0 && (
                <View>
                  <SectionHeader icon="📚" title="Everything" />
                  {everythingResources.map((item, idx) => (
                    <React.Fragment key={item.id}>
                      <ResourceRow item={item} />
                      {idx < everythingResources.length - 1 && <RowSeparator />}
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* ── Persistent Add Button ────────────────────── */}
              {!isAddingResource && (
                <TouchableOpacity
                  onPress={() => setIsAddingResource(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                    gap: 6,
                    marginTop: 16,
                    marginBottom: 20,
                  }}
                >
                  <Feather name="plus" size={16} color={theme.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "800", color: theme.primary }}>Add Resource</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      ) : null}

      {/* ── OVERFLOW MENU BOTTOM SHEET ─────────────────────────── */}
      <AnimatedOverlay
        visible={!!overflowResource}
        onClose={() => setOverflowResource(null)}
        type="bottom-sheet"
      >
        {(close) => {
          if (!overflowResource) return null;
          const isPinned = overflowResource.pinned;

          const menuItems: { icon: string; label: string; color?: string; destructive?: boolean; onPress: () => void }[] = [
            {
              icon: isPinned ? "star" : "star",
              label: isPinned ? "Remove from Quick Access" : "Pin to Quick Access",
              onPress: () => {
                close();
                setTimeout(() => {
                  togglePinCollectionItem(overflowResource.id, overflowResource.collectionId, activeFolderId);
                }, 250);
              },
            },
            {
              icon: "edit-2",
              label: "Edit Resource",
              onPress: () => {
                close();
                // Edit is the same as opening the detail sheet for now
                setTimeout(() => setSelectedResource(overflowResource), 250);
              },
            },
            {
              icon: "refresh-cw",
              label: "Convert to Task",
              onPress: async () => {
                close();
                setTimeout(async () => {
                  await convertCollectionItemToTask({ ...overflowResource, folderId: activeFolderId });
                }, 250);
              },
            },
            {
              icon: "archive",
              label: overflowResource.archived ? "Unarchive" : "Archive",
              onPress: () => {
                close();
                setTimeout(() => {
                  toggleArchiveCollectionItem(overflowResource.id, overflowResource.collectionId, activeFolderId);
                }, 250);
              },
            },
          ];

          return (
            <View
              style={{
                backgroundColor: theme.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 16,
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === "ios" ? 36 : 24,
                borderWidth: 1.5,
                borderColor: theme.border,
              }}
            >
              {/* Title */}
              <View style={{ alignItems: "center", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border + "40", marginBottom: 6 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
                  {overflowResource.title}
                </Text>
              </View>

              {/* Menu Items */}
              {menuItems.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={item.onPress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 4,
                    borderBottomWidth: idx < menuItems.length - 1 ? 1 : 0,
                    borderBottomColor: theme.border + "30",
                  }}
                >
                  <Feather name={item.icon as any} size={16} color={theme.text} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              {/* Destructive: Delete */}
              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 6 }} />
              <TouchableOpacity
                onPress={() => {
                  close();
                  setTimeout(() => {
                    Alert.alert(
                      "Delete Resource",
                      `Delete "${overflowResource.title}" permanently?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            deleteCollectionItem(overflowResource.id, overflowResource.collectionId, activeFolderId);
                            if (selectedResource?.id === overflowResource.id) setSelectedResource(null);
                          },
                        },
                      ]
                    );
                  }, 250);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                }}
              >
                <Feather name="trash-2" size={16} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>Delete Resource</Text>
              </TouchableOpacity>

              {/* Cancel */}
              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 6 }} />
              <TouchableOpacity
                onPress={close}
                style={{
                  alignItems: "center",
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: isLight ? "#F1F5F9" : "#27272A",
                }}
              >
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      </AnimatedOverlay>

      {/* ── RESOURCE DETAIL BOTTOM SHEET ───────────────────────── */}
      <AnimatedOverlay
        visible={!!selectedResource}
        onClose={() => setSelectedResource(null)}
        type="bottom-sheet"
      >
        {(close) => {
          if (!selectedResource) return null;
          const linked = getLinkedItems(selectedResource.id);
          const dateStr = new Date(selectedResource.createdAt).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const workspaceName = lists.find((l) => l.id === activeFolderId)?.name || "Inbox";

          return (
            <View
              style={{
                backgroundColor: theme.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 16,
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === "ios" ? 36 : 24,
                borderWidth: 1.5,
                borderColor: theme.border,
                maxHeight: "85%",
              }}
            >
              {/* Header */}
              <View style={{ alignItems: "center", paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border + "40" }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}>
                  {selectedResource.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}>
                  {getFileLabel(selectedResource)}
                </Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                {/* 1. Hero Content Preview (shown directly at the top) */}
                <View style={{ marginBottom: 20 }}>
                  {selectedResource.type === "note" ? (
                    <View
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: isLight ? "#F8FAFC" : "#18181B",
                        minHeight: 120,
                      }}
                    >
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
                        <Text style={{ color: theme.text, fontSize: 13, lineHeight: 20 }}>
                          {selectedResource.content || "No content inside note."}
                        </Text>
                      </ScrollView>
                    </View>
                  ) : (selectedResource.mediaUri || (selectedResource.type === "file" && selectedResource.mimeType?.startsWith("image/") && selectedResource.localUri)) ? (
                    <View 
                      style={{ 
                        borderRadius: 16, 
                        overflow: "hidden", 
                        borderWidth: 1, 
                        borderColor: theme.border, 
                        height: 220, 
                        width: "100%",
                        backgroundColor: isLight ? "#F8FAFC" : "#18181B",
                      }}
                    >
                      <Image
                        source={{ uri: selectedResource.mediaUri || selectedResource.localUri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="contain"
                      />
                    </View>
                  ) : selectedResource.type === "link" ? (
                    <TouchableOpacity
                      onPress={() => handleOpenUrl(selectedResource.url)}
                      activeOpacity={0.9}
                      style={{
                        padding: 18,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: theme.border,
                        backgroundColor: isLight ? "#F8FAFC" : "#18181B",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          backgroundColor: `${theme.primary}12`,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Feather name="globe" size={24} color={theme.primary} />
                      </View>
                      <View style={{ alignItems: "center", gap: 2 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", textAlign: "center" }} numberOfLines={1}>
                          {getDomainName(selectedResource.url)}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center" }} numberOfLines={1}>
                          {selectedResource.url || "No link URL"}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 4,
                          backgroundColor: theme.primary,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
                          Open Link
                        </Text>
                        <Feather name="external-link" size={12} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    // Other files (including PDF and Docs)
                    <TouchableOpacity
                      onPress={() => {
                        if (selectedResource.localUri) {
                          handleOpenFile(selectedResource.localUri, selectedResource.mimeType);
                        }
                      }}
                      activeOpacity={selectedResource.localUri ? 0.9 : 1}
                      style={{
                        padding: 20,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: isLight ? "#F8FAFC" : "#18181B",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 16,
                          backgroundColor: isLight ? "#EEF2F6" : getTypeColor("file", selectedResource.mimeType) + "12",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: isLight ? "#E2E8F0" : getTypeColor("file", selectedResource.mimeType) + "20",
                        }}
                      >
                        <Feather
                          name={getTypeIcon("file", selectedResource.mimeType) as any}
                          size={32}
                          color={getTypeColor("file", selectedResource.mimeType)}
                        />
                      </View>
                      <View style={{ alignItems: "center", gap: 3 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", textAlign: "center" }} numberOfLines={2}>
                          {selectedResource.fileName || selectedResource.title}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                          {getFileCategory(selectedResource.mimeType).toUpperCase()}
                          {selectedResource.fileSize ? ` • ${formatFileSize(selectedResource.fileSize)}` : ""}
                        </Text>
                      </View>

                      {selectedResource.localUri ? (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 4,
                            backgroundColor: theme.primary,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>
                            Open File
                          </Text>
                          <Feather name="file" size={12} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── Connected To (elevated above details) ─── */}
                <View style={{ gap: 8, marginBottom: 16 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Used in
                  </Text>
                  {linked.length > 0 ? (
                    <View style={{ gap: 6 }}>
                      {linked.map((link) => (
                        <View
                          key={link.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: theme.border,
                            backgroundColor: isLight ? "#F8FAFC" : "#18181B",
                            justifyContent: "space-between",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                            <Feather
                              name="check-circle"
                              size={12}
                              color={theme.primary}
                            />
                            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text, flex: 1 }} numberOfLines={1}>
                              {link.title}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: "700", textTransform: "uppercase" }}>
                            {link.type}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic", paddingVertical: 4 }}>
                      Not connected to any items yet.
                    </Text>
                  )}

                  {/* Inline connect button */}
                  <TouchableOpacity
                    onPress={() => {
                      close();
                      setTimeout(() => setLinkingResource(selectedResource), 300);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderStyle: "dashed",
                    }}
                  >
                    <Feather name="plus" size={13} color={theme.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: theme.primary }}>
                      Connect to item...
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ── Details (minimal) ────────────────────── */}
                <View style={{ gap: 8, marginBottom: 16 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Details
                  </Text>
                  <View style={{ gap: 8 }}>
                    {[
                      { label: "Added", value: dateStr },
                      { label: "Type", value: selectedResource.type === "file" ? getFileCategory(selectedResource.mimeType).charAt(0).toUpperCase() + getFileCategory(selectedResource.mimeType).slice(1) : selectedResource.type.charAt(0).toUpperCase() + selectedResource.type.slice(1) },
                      ...(selectedResource.type === "file" && selectedResource.fileSize ? [{ label: "Size", value: formatFileSize(selectedResource.fileSize) }] : []),
                      ...(selectedResource.type === "file" && selectedResource.fileName ? [{ label: "File", value: selectedResource.fileName }] : []),
                      { label: "Workspace", value: workspaceName },
                      { label: "Storage", value: selectedResource.localUri ? "Local" : "Cloud" },
                    ].map((row) => (
                      <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 12, color: theme.textMuted }}>{row.label}</Text>
                        <Text style={{ fontSize: 12, color: theme.text, fontWeight: "600" }} numberOfLines={1}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {/* ── Action Buttons ──────────────────────────── */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                {/* Share Button */}
                <TouchableOpacity
                  onPress={() => {
                    handleShare(selectedResource);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  }}
                >
                  <Feather name="share-2" size={13} color={theme.text} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>Share</Text>
                </TouchableOpacity>

                {/* Edit Button */}
                <TouchableOpacity
                  onPress={() => {
                    close();
                    setEditTitle(selectedResource.title);
                    setEditUrl(selectedResource.url || "");
                    setEditContent(selectedResource.content || "");
                    setTimeout(() => setEditingResource(selectedResource), 250);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  }}
                >
                  <Feather name="edit-2" size={13} color={theme.text} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>Edit</Text>
                </TouchableOpacity>

                {/* More Options Button */}
                <TouchableOpacity
                  onPress={() => {
                    close();
                    setTimeout(() => {
                      setOverflowResource(selectedResource);
                    }, 250);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  }}
                >
                  <Feather name="more-horizontal" size={13} color={theme.text} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>More</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      </AnimatedOverlay>

      {/* ── EDIT RESOURCE MODAL ─────────────────────────────────── */}
      <AnimatedOverlay
        visible={!!editingResource}
        onClose={() => setEditingResource(null)}
        type="bottom-sheet"
      >
        {(close) => {
          if (!editingResource) return null;
          return (
            <View
              style={{
                backgroundColor: theme.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 16,
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === "ios" ? 36 : 24,
                borderWidth: 1.5,
                borderColor: theme.border,
                maxHeight: "85%",
              }}
            >
              {/* Header */}
              <View style={{ alignItems: "center", paddingBottom: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: theme.border + "40" }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>
                  Edit Resource
                </Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300, gap: 12 }}>
                <View style={{ gap: 4, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textMuted }}>Title</Text>
                  <TextInput
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Resource title..."
                    placeholderTextColor={theme.textMuted}
                    style={{
                      backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                      color: theme.text,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 13,
                    }}
                  />
                </View>

                {editingResource.type === "link" && (
                  <View style={{ gap: 4, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textMuted }}>URL</Text>
                    <TextInput
                      value={editUrl}
                      onChangeText={setEditUrl}
                      placeholder="figma.com/file/..."
                      placeholderTextColor={theme.textMuted}
                      style={{
                        backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                        color: theme.text,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 13,
                      }}
                    />
                  </View>
                )}

                {editingResource.type === "note" && (
                  <View style={{ gap: 4, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textMuted }}>Content</Text>
                    <TextInput
                      value={editContent}
                      onChangeText={setEditContent}
                      placeholder="Note content..."
                      placeholderTextColor={theme.textMuted}
                      style={{
                        backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                        color: theme.text,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 13,
                        minHeight: 80,
                      }}
                      multiline
                    />
                  </View>
                )}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => close()}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textMuted }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    const updates: any = {};
                    if (editTitle.trim()) updates.title = editTitle.trim();
                    if (editingResource.type === "link") updates.url = editUrl.trim();
                    if (editingResource.type === "note") updates.content = editContent.trim();

                    await updateCollectionItem(
                      editingResource.id,
                      editingResource.collectionId,
                      activeFolderId,
                      updates
                    );
                    close();
                  }}
                  disabled={!editTitle.trim()}
                  style={{
                    flex: 1,
                    backgroundColor: theme.primary,
                    paddingVertical: 11,
                    borderRadius: 12,
                    alignItems: "center",
                    opacity: editTitle.trim() ? 1 : 0.5,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      </AnimatedOverlay>

      {/* ── LINK MANAGER MODAL ─────────────────────────────────── */}
      <AnimatedOverlay
        visible={!!linkingResource}
        onClose={() => setLinkingResource(null)}
        type="bottom-sheet"
      >
        {(close) => {
          if (!linkingResource) return null;
          return (
            <View
              style={{
                backgroundColor: theme.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingTop: 16,
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === "ios" ? 36 : 24,
                borderWidth: 1.5,
                borderColor: theme.border,
                maxHeight: "85%",
              }}
            >
              {/* Header */}
              <View style={{ alignItems: "center", paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border + "40", marginBottom: 10 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>
                  Connect Resource
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {linkingResource.title}
                </Text>
              </View>

              {/* Segment Pickers */}
              <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                {(["task", "habit", "checklist"] as const).map((seg) => {
                  const isActive = linkingSegment === seg;
                  return (
                    <TouchableOpacity
                      key={seg}
                      onPress={() => setLinkingSegment(seg)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 10,
                        alignItems: "center",
                        backgroundColor: isActive ? theme.primary : (isLight ? "#F1F5F9" : "#27272A"),
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: isActive ? "#FFFFFF" : theme.textMuted, textTransform: "capitalize" }}>
                        {seg}s
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Search */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  height: 38,
                  borderWidth: 1,
                  borderColor: theme.border,
                  marginBottom: 10,
                }}
              >
                <Feather name="search" size={13} color={theme.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  value={linkingSearch}
                  onChangeText={setLinkingSearch}
                  placeholder={`Search ${linkingSegment}s...`}
                  placeholderTextColor={theme.textMuted}
                  style={{ flex: 1, color: theme.text, fontSize: 12, height: "100%", padding: 0 }}
                />
              </View>

              {/* Options */}
              <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                {filteredLinkingOptions.length === 0 ? (
                  <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: "center", marginVertical: 30 }}>
                    No {linkingSegment}s found.
                  </Text>
                ) : (
                  <View style={{ gap: 4 }}>
                    {filteredLinkingOptions.map((option) => {
                      const isLinked = option.linkedCollectionIds?.includes(linkingResource.id) || false;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          onPress={async () => {
                            if (onToggleLinkResource) {
                              await onToggleLinkResource(option.id, linkingSegment, linkingResource.id);
                            }
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 12,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: isLinked ? theme.primary : theme.border,
                            backgroundColor: isLinked ? `${theme.primary}08` : "transparent",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text, flex: 1 }} numberOfLines={1}>
                            {option.title}
                          </Text>
                          <Feather
                            name={isLinked ? "check-square" : "square"}
                            size={14}
                            color={isLinked ? theme.primary : theme.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              <View style={{ height: 1.5, backgroundColor: theme.border, marginVertical: 12 }} />
              <TouchableOpacity
                onPress={close}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: theme.primary,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Done</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      </AnimatedOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    gap: 4,
  },
});
