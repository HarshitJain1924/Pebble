/**
 * UnifiedCapture.tsx
 * ─────────────────
 * Pebble Capture current — The unified, parser-first capture interface.
 *
 * Design Philosophy:
 *   - "The parser should feel like a helpful companion, not a form filling itself."
 *   - Parser leads, layout is clean and out of the way.
 *   - Smart dynamic headers change based on detected capture intent.
 *   - Sleek companion progress bar shows understanding state.
 *   - Dynamic override selector replaces pill tabs.
 *   - Progressive disclosure keeps secondary attributes hidden.
 *   - File picking support using expo-document-picker.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";

import { AppText as Text } from "@/shared/components/ui/AppText";
import CaptureInputBox from "@/features/capture/components/CaptureInputBox";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { useUndo } from "@/shared/components/ui/UndoContext";
import { useVoiceCapture } from "@/features/capture/hooks/useVoiceCapture";
import {
  parseProductivityText,
  type ParsedProductivityItem,
} from "@/features/capture/services/nlp-parser.service";
import {
  getWorkspaceSuggestions,
  type WorkspaceSuggestionResult,
} from "@/features/workspaces/services/workspace-suggestions.service";
import { INBOX_WORKSPACE_ID, type Attachment } from "@/shared/types/domain.types";
import { saveParsedItem } from "@/features/capture/services/CaptureService";
import PressableScale from "@/shared/components/ui/PressableScale";

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP_POINTS = ["90%"];

const TYPE_META: Record<
  ParsedProductivityItem["type"],
  { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string }
> = {
  task: { label: "Task", icon: "edit-3", color: "#6366F1" },
  habit: { label: "Habit", icon: "refresh-cw", color: "#10B981" },
  checklist: { label: "List", icon: "list", color: "#3B82F6" },
  note: { label: "Note", icon: "file-text", color: "#A855F7" },
  link: { label: "Link", icon: "link", color: "#F59E0B" },
  idea: { label: "Idea", icon: "zap", color: "#EC4899" },
  file: { label: "File", icon: "paperclip", color: "#EC4899" },
};

const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }> = {
  work: { label: "Work", color: "#3B82F6", icon: "briefcase" },
  personal: { label: "Personal", color: "#10B981", icon: "user" },
  health: { label: "Health", color: "#F59E0B", icon: "activity" },
  learning: { label: "Learning", color: "#A855F7", icon: "book-open" },
  creative: { label: "Creative", color: "#EC4899", icon: "feather" },
  focus: { label: "Focus", color: "#6366F1", icon: "target" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#EF4444" },
  medium: { label: "Medium", color: "#F59E0B" },
  low: { label: "Low", color: "#10B981" },
};

const getDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function getAdaptiveSuggestions(
  hour: number,
  currentTab?: string,
  workspaceName?: string,
): string[] {
  if (currentTab === "schedule") {
    return ["Team standup at 10am", "Focus block 2 hours", "Coffee break at 3pm", "Note: review meeting notes"];
  }
  if (currentTab === "resources") {
    return ["Note: project requirements", "https://example.com", "Idea: weekly review screen", "Note: API endpoint docs"];
  }
  if (hour >= 6 && hour < 10) {
    return ["Gym every morning at 7am", "Meditate for 10 minutes", "Review today's tasks", "Read for 30 minutes"];
  }
  if (hour >= 10 && hour < 18) {
    return ["Send project update email", "Focus block 90 minutes", "Team meeting at 2pm", "Note: client feedback"];
  }
  // Evening
  return ["Study Kubernetes at 8pm", "Run 5km every evening", "Journal before bed", "Idea: new side project"];
}

function getFriendlyDateLabel(dateStr?: string): string {
  if (!dateStr) return "No date";
  const today = getDateKey();
  if (dateStr === today) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === getDateKey(tomorrow)) return "Tomorrow";
  // Format as "Jul 17"
  const [, m, d] = dateStr.split("-").map(Number);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[m - 1]} ${d}`;
}

function getFriendlyTimeLabel(timeStr?: string): string {
  if (!timeStr) return "Anytime";
  const [h, m] = timeStr.split(":").map(Number);
  const isPm = h >= 12;
  const displayHour = h % 12 || 12;
  const displayMin = String(m).padStart(2, "0");
  return `${displayHour}:${displayMin} ${isPm ? "PM" : "AM"}`;
}

function getRecurrenceLabel(item: ParsedProductivityItem): string | null {
  if (!item.recurrence) return null;
  const r = item.recurrence;
  if (r.type === "daily") return "Daily";
  if (r.type === "weekdays") return "Weekdays";
  if (r.type === "weekly") {
    if (r.days && r.days.length > 0) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return r.days.map((d) => dayNames[d]).join(", ");
    }
    return "Weekly";
  }
  if (r.type === "monthly") return `Monthly (${r.dayOfMonth || 1}${getOrdinal(r.dayOfMonth || 1)})`;
  if (r.type === "interval") return `Every ${r.interval} ${r.unit}`;
  return null;
}

function getOrdinal(n: number): string {
  if (n > 3 && n < 21) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface UnifiedCaptureProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  workspaces: { id: string; name: string; emoji?: string; color?: string }[];
  defaultWorkspaceId?: string;
  defaultDate?: string;
  defaultType?: ParsedProductivityItem["type"];
  entryTab?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function UnifiedCapture({
  sheetRef,
  workspaces,
  defaultWorkspaceId = INBOX_WORKSPACE_ID,
  defaultDate,
  defaultType,
  entryTab,
}: UnifiedCaptureProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "dark"];
  const { showToast } = useUndo();

  // ─── State ──────────────────────────────────────────────────────────────

  const [inputText, setInputText] = useState("");
  const [parsedItem, setParsedItem] = useState<ParsedProductivityItem | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(defaultWorkspaceId);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showTypeOverride, setShowTypeOverride] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; uri: string } | null>(null);

  // Workspace suggestion from parser
  const [topSuggestion, setTopSuggestion] = useState<WorkspaceSuggestionResult | null>(null);

  // Voice capture
  const {
    status: voiceStatus,
    volume: voiceVolume,
    errorMsg: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceCapture({
    onTranscriptComplete: (finalText) => setInputText(finalText),
    onTranscriptChange: (interimText) => setInputText(interimText),
  });

  // Animation values
  const loadingProgress = useSharedValue(0);

  // ─── Effects ────────────────────────────────────────────────────────────

  // Dynamic header updates based on type
  const hasInput = inputText.trim().length > 0;
  const smartHeader = useMemo(() => {
    if (isParsing) return { title: "Quick Capture", desc: "Understanding your thought..." };
    if (!parsedItem || !hasInput) {
      return { title: "Quick Capture", desc: "Drop a thought. We'll organize it." };
    }
    switch (parsedItem.type) {
      case "task":
        return { title: "Create Task", desc: "Organizing your next action..." };
      case "habit":
        return { title: "Add Habit", desc: "Forming positive routines..." };
      case "checklist":
        return { title: "Create Checklist", desc: "Building your reference list..." };
      case "note":
        return { title: "Save Note", desc: "Saving context to Vault..." };
      case "link":
        return { title: "Save Link", desc: "Clipping resource to reference..." };
      case "idea":
        return { title: "Save Idea", desc: "Incubating dynamic concepts..." };
      case "file":
        return { title: "Save File", desc: "Linking file reference..." };
      default:
        return { title: "Quick Capture", desc: "Drop a thought. We'll organize it." };
    }
  }, [parsedItem, isParsing, hasInput]);

  // Generate adaptive suggestions on mount
  useEffect(() => {
    const hour = new Date().getHours();
    setSuggestions(getAdaptiveSuggestions(hour, entryTab));
  }, [entryTab, selectedWorkspaceId]);

  // Check clipboard for URL on sheet open (don't auto-read, just detect)
  useEffect(() => {
    (async () => {
      try {
        const content = await Clipboard.getStringAsync();
        if (content && /^https?:\/\//.test(content.trim())) {
          setClipboardUrl(content.trim());
        } else {
          setClipboardUrl(null);
        }
      } catch {
        setClipboardUrl(null);
      }
    })();
  }, []);

  // Apply defaults from entry context
  useEffect(() => {
    if (defaultWorkspaceId) setSelectedWorkspaceId(defaultWorkspaceId);
  }, [defaultWorkspaceId]);

  // Debounced NLP parsing
  useEffect(() => {
    let isCancelled = false;

    if (!inputText.trim()) {
      if (parsedItem !== null) setParsedItem(null);
      if (showTypeOverride) setShowTypeOverride(false);
      if (showMoreOptions) setShowMoreOptions(false);
      if (isParsing) setIsParsing(false);
      loadingProgress.value = 0;
      return;
    }

    const timer = setTimeout(async () => {
      if (isCancelled) return;
      setIsParsing(true);
      loadingProgress.value = 0;
      loadingProgress.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 400 }), withTiming(0.9, { duration: 600 })),
        -1,
        true,
      );

      const parsed = parseProductivityText(inputText.trim());
      // Apply default overrides from entry context
      if (defaultType && parsed.type === "task" && parsed.detectionSignal === "default_task") {
        parsed.type = defaultType;
      }
      if (defaultDate && parsed.type === "task" && !parsed.date) {
        parsed.date = defaultDate;
      }
      if (isCancelled) return;
      setParsedItem(parsed);
      setIsParsing(false);
      loadingProgress.value = withTiming(1, { duration: 200 });

      // Workspace suggestion
      if (parsed.type === "task" || parsed.type === "habit") {
        try {
          const wsSuggestions = await getWorkspaceSuggestions(
            parsed.title,
            parsed.category || "work",
            workspaces,
            {},
          );
          if (isCancelled) return;
          const top = wsSuggestions[0];
          if (top && top.score >= 75) {
            setTopSuggestion(top);
            setSelectedWorkspaceId(top.workspaceId);
          }
        } catch {
          // ignore
        }
      }
    }, 450);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [inputText]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleTypeOverride = useCallback(
    (newType: ParsedProductivityItem["type"]) => {
      if (!parsedItem) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setParsedItem({ ...parsedItem, type: newType });
      setShowTypeOverride(false);
    },
    [parsedItem],
  );

  const handleClipboardPaste = useCallback(() => {
    if (clipboardUrl) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setInputText(clipboardUrl);
      setClipboardUrl(null);
    }
  }, [clipboardUrl]);

  const handleSuggestionTap = useCallback((text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInputText(text);
  }, []);

  const handleAttachment = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const attachment: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType || "application/octet-stream",
          size: asset.size || 0,
        };
        setAttachedFile({
          name: asset.name,
          size: asset.size || 0,
          uri: asset.uri,
        });
        setParsedItem({
          type: "file",
          title: asset.name,
          confidence: 0.95,
          attachments: [attachment],
        });
      }
    } catch (err) {
      console.warn("Document picker error", err);
    }
  }, []);

  // ─── Save Handler ──────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!parsedItem || !parsedItem.title.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const wsId = selectedWorkspaceId || INBOX_WORKSPACE_ID;

      await saveParsedItem(parsedItem, wsId);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
      const typeLabel = TYPE_META[parsedItem.type].label;
      showToast(`✓ ${typeLabel} added to ${wsName}`);

      // Reset
      setInputText("");
      setParsedItem(null);
      setAttachedFile(null);
      setShowMoreOptions(false);
      setShowTypeOverride(false);
      sheetRef.current?.dismiss();
      // Disable re-enables after dismiss is triggered (not awaited)
      setTimeout(() => setIsSaving(false), 300);
    } catch (e) {
      console.warn("UnifiedCapture save failed:", e);
      setIsSaving(false);
    }
  }, [parsedItem, selectedWorkspaceId, workspaces, isSaving]);

  const handleWorkspaceCycle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (workspaces.length === 0) return;
    const idx = workspaces.findIndex((w) => w.id === selectedWorkspaceId);
    const nextIdx = (idx + 1) % workspaces.length;
    setSelectedWorkspaceId(workspaces[nextIdx].id);
  }, [workspaces, selectedWorkspaceId]);

  const handleToggleTypeOverride = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowTypeOverride((prev) => !prev);
  }, []);

  const handleToggleMoreOptions = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowMoreOptions((prev) => !prev);
  }, []);

  const handleRemoveAttachedFile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAttachedFile(null);
    setParsedItem((prev) => (prev ? { ...prev, type: "task" } : null));
  }, []);

  const handleDismiss = useCallback(() => {
    sheetRef.current?.dismiss();
  }, [sheetRef]);

  // ─── Derived Values ─────────────────────────────────────────────────────

  const inputBg = useMemo(() => (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"), [isDark]);
  const borderColor = useMemo(() => (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"), [isDark]);
  const textPrimary = theme.text;
  const textMuted = theme.textMuted;
  const inputBoxTextInputProps = useMemo(
    () => ({
      autoCorrect: false,
      autoFocus: voiceStatus !== "listening",
      maxLength: 500,
    }),
    [voiceStatus !== "listening"],
  );

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${loadingProgress.value * 100}%`,
  }));

  const saveButtonLabel = useMemo(() => {
    if (!parsedItem) return "Add";
    const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
    
    switch (parsedItem.type) {
      case "task":
        return `Add Task to ${wsName}`;
      case "habit":
        return `Add Habit to ${wsName}`;
      case "checklist":
        return `Create List in ${wsName}`;
      case "note":
        return `Save Note to ${wsName}`;
      case "link":
        return `Save Link to ${wsName}`;
      case "idea":
        return `Save Idea to ${wsName}`;
      case "file":
        return `Save File to ${wsName}`;
      default:
        return `Add to ${wsName}`;
    }
  }, [parsedItem, selectedWorkspaceId, workspaces]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        setInputText("");
        setParsedItem(null);
        setAttachedFile(null);
        setShowMoreOptions(false);
        setShowTypeOverride(false);
        setClipboardUrl(null);
        cancelRecording();
      }
    },
    [cancelRecording],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: isDark ? "#121215" : "#FAFAFA",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
        width: 44,
        height: 4,
      }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {/* ── Smart Companion Header ── */}
      <View style={styles.sheetHeaderContainer}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[styles.sheetHeaderTitle, { color: textPrimary }]}>
            {smartHeader.title}
          </Text>
          <TouchableOpacity
            onPress={() => sheetRef.current?.dismiss()}
            style={[styles.closeIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
          >
            <Feather name="x" size={16} color={textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.sheetHeaderDesc, { color: textMuted }]}>
          {smartHeader.desc}
        </Text>
      </View>

      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Input Layer ── */}
        <CaptureInputBox
          value={inputText}
          onChangeText={setInputText}
          placeholder={voiceStatus === "listening" ? "Listening..." : "What do you want to remember?"}
          placeholderTextColor={textMuted}
          voiceStatus={voiceStatus}
          voiceVolume={voiceVolume}
          onVoiceStart={startRecording}
          onVoiceStop={stopRecording}
          onVoiceCancel={cancelRecording}
          onAttachmentPress={handleAttachment}
          themePrimary={theme.primary}
          backgroundColor={inputBg}
          borderColor={borderColor}
          textColor={textPrimary}
          TextInputComponent={BottomSheetTextInput as any}
          textInputProps={inputBoxTextInputProps}
        />

        {/* ── Voice Error Banner ── */}
        {voiceStatus === "error" && voiceError && (
          <Animated.View entering={FadeInDown.duration(200)} style={[styles.voiceErrorBanner, { backgroundColor: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.25)" }]}>
            <Feather name="alert-circle" size={14} color="#EF4444" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#EF4444", flex: 1 }}>
              {voiceError}
            </Text>
          </Animated.View>
        )}

        {/* ── Companion Progress Bar (Parsing working animation) ── */}
        {isParsing && (
          <Animated.View entering={FadeInUp.duration(150)} style={styles.companionLoadingRow}>
            <Text style={[styles.companionLoadingText, { color: theme.primary }]}>
              ✨ Understanding your thought...
            </Text>
            <View style={[styles.progressBarContainer, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }]}>
              <Animated.View style={[styles.progressBarFill, { backgroundColor: theme.primary }, animatedProgressStyle]} />
            </View>
          </Animated.View>
        )}

        {/* ── Clipboard URL Suggestion ── */}
        {clipboardUrl && !inputText.trim() && (
          <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)}>
            <PressableScale
              onPress={handleClipboardPaste}
              style={[
                styles.clipboardPrompt,
                {
                  backgroundColor: isDark ? "rgba(245, 158, 11, 0.04)" : "rgba(217, 119, 6, 0.03)",
                  borderColor: isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(217, 119, 6, 0.15)",
                },
              ]}
            >
              <Feather name="clipboard" size={14} color={isDark ? "#F59E0B" : "#D97706"} />
              <Text style={[styles.clipboardText, { color: isDark ? "#F59E0B" : "#D97706" }]} numberOfLines={1}>
                📋 Paste{" "}
                {(() => {
                  try {
                    const domain = clipboardUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
                    return domain;
                  } catch {
                    return "link";
                  }
                })()}
                ?
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        {/* ── Checklist Suggestion (medium confidence) ── */}
        {parsedItem?.type === "checklist" && parsedItem.checklistConfidence === "medium" && (
          <Animated.View
            entering={FadeInDown.duration(200)}
            style={[
              styles.checklistSuggestion,
              {
                backgroundColor: isDark ? "rgba(59, 130, 246, 0.04)" : "rgba(37, 99, 235, 0.03)",
                borderColor: isDark ? "rgba(59, 130, 246, 0.15)" : "rgba(37, 99, 235, 0.15)",
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Feather name="list" size={16} color={TYPE_META.checklist.color} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: textPrimary }}>
                Looks like a checklist ✓
              </Text>
            </View>
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (parsedItem) {
                  setParsedItem({ ...parsedItem, checklistConfidence: "high", confidence: 0.85 });
                }
              }}
              style={[styles.checklistConfirmBtn, { backgroundColor: `${TYPE_META.checklist.color}20` }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: TYPE_META.checklist.color }}>
                Create as List
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        {/* ── Capture Companion Card ── */}
        {parsedItem && parsedItem.title.trim().length > 0 && !isParsing && (
          <CaptureSummaryCard
            parsedItem={parsedItem}
            isDark={isDark}
            textPrimary={textPrimary}
            textMuted={textMuted}
            borderColor={borderColor}
            themePrimary={theme.primary}
            themeSecondary={theme.secondary}
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onWorkspaceCycle={handleWorkspaceCycle}
            attachedFile={attachedFile}
            onRemoveAttachedFile={handleRemoveAttachedFile}
            showTypeOverride={showTypeOverride}
            onToggleTypeOverride={handleToggleTypeOverride}
            onTypeOverride={handleTypeOverride}
            showMoreOptions={showMoreOptions}
            onToggleMoreOptions={handleToggleMoreOptions}
            onDismiss={handleDismiss}
            onSave={handleSave}
            isSaving={isSaving}
            saveButtonLabel={saveButtonLabel}
          />
        )}

        {/* ── Smart Suggestions (from computed adaptive suggestions) ── */}
        {!inputText.trim() && suggestions.length > 0 && (
          <CaptureSuggestions
            suggestions={suggestions}
            isDark={isDark}
            textPrimary={textPrimary}
            textMuted={textMuted}
            themePrimary={theme.primary}
            onSuggestionTap={handleSuggestionTap}
          />
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Memoized Subcomponents ──────────────────────────────────────────────────

interface CaptureSummaryCardProps {
  parsedItem: ParsedProductivityItem;
  isDark: boolean;
  textPrimary: string;
  textMuted: string;
  borderColor: string;
  themePrimary: string;
  themeSecondary: string;
  workspaces: { id: string; name: string; emoji?: string }[];
  selectedWorkspaceId?: string;
  onWorkspaceCycle: () => void;
  attachedFile: { name: string; size: number; uri: string } | null;
  onRemoveAttachedFile: () => void;
  showTypeOverride: boolean;
  onToggleTypeOverride: () => void;
  onTypeOverride: (type: ParsedProductivityItem["type"]) => void;
  showMoreOptions: boolean;
  onToggleMoreOptions: () => void;
  onDismiss: () => void;
  onSave: () => void;
  isSaving: boolean;
  saveButtonLabel: string;
}

const CaptureSummaryCard = React.memo(function CaptureSummaryCard({
  parsedItem,
  isDark,
  textPrimary,
  textMuted,
  borderColor,
  themePrimary,
  themeSecondary,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceCycle,
  attachedFile,
  onRemoveAttachedFile,
  showTypeOverride,
  onToggleTypeOverride,
  onTypeOverride,
  showMoreOptions,
  onToggleMoreOptions,
  onDismiss,
  onSave,
  isSaving,
  saveButtonLabel,
}: CaptureSummaryCardProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      style={[
        styles.summaryCard,
        {
          backgroundColor: isDark ? "#1C1C21" : "#FFFFFF",
          borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.25 : 0.06,
          shadowRadius: 15,
          elevation: 4,
        },
      ]}
    >
      {/* Header: Type Badge + Confidence */}
      <View style={styles.summaryHeader}>
        <View style={[styles.typeBadge, { backgroundColor: `${TYPE_META[parsedItem.type].color}12` }]}>
          <Feather
            name={TYPE_META[parsedItem.type].icon}
            size={13}
            color={TYPE_META[parsedItem.type].color}
          />
          <Text style={[styles.typeBadgeText, { color: TYPE_META[parsedItem.type].color }]}>
            {TYPE_META[parsedItem.type].label}
          </Text>
        </View>

        {/* Confidence badge */}
        {parsedItem.confidence >= 0.8 ? (
          <View style={[styles.confidenceBadge, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#10B981" }}>
              {Math.round(parsedItem.confidence * 100)}% confident
            </Text>
          </View>
        ) : parsedItem.confidence >= 0.6 ? (
          <View style={[styles.confidenceBadge, { backgroundColor: "rgba(245, 158, 11, 0.1)" }]}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#F59E0B" }}>
              {Math.round(parsedItem.confidence * 100)}% confident
            </Text>
          </View>
        ) : null}
      </View>

      {/* Title */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={[styles.summaryTitle, { color: textPrimary, flex: 1 }]}>
          {parsedItem.title}
        </Text>
        <Feather name="edit-2" size={14} color={textMuted} style={{ opacity: 0.6 }} />
      </View>

      {/* Attached File Preview (if type file) */}
      {parsedItem.type === "file" && attachedFile && (
        <View style={[styles.fileCard, { borderColor }]}>
          <Feather name="file" size={24} color={TYPE_META.file.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fileName, { color: textPrimary }]} numberOfLines={1}>
              {attachedFile.name}
            </Text>
            <Text style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
              {(attachedFile.size / 1024).toFixed(1)} KB
            </Text>
          </View>
          <TouchableOpacity onPress={onRemoveAttachedFile}>
            <Feather name="x" size={16} color={textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* URL subtitle (links only) */}
      {parsedItem.type === "link" && parsedItem.url && (
        <Text style={[styles.urlSubtitle, { color: themeSecondary }]} numberOfLines={1}>
          {parsedItem.url.replace(/^https?:\/\//, "").replace(/^www\./, "")}
        </Text>
      )}

      {/* Checklist preview */}
      {parsedItem.type === "checklist" && parsedItem.items && parsedItem.items.length > 0 && (
        <View style={styles.checklistPreview}>
          {parsedItem.items.slice(0, 6).map((checkItem, i) => (
            <View key={i} style={styles.checklistRow}>
              <View style={[styles.checklistBox, { borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)" }]} />
              <Text style={[styles.checklistItemText, { color: textPrimary }]} numberOfLines={1}>
                {checkItem}
              </Text>
            </View>
          ))}
          {parsedItem.items.length > 6 && (
            <Text style={{ fontSize: 12, color: textMuted, paddingLeft: 28, fontWeight: "500" }}>
              +{parsedItem.items.length - 6} more items
            </Text>
          )}
        </View>
      )}

      {/* Core details mapping */}
      <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 12 }}>
        {parsedItem.recurrence && (
          <View style={styles.coreValueRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="refresh-cw" size={13} color={textMuted} />
              <Text style={{ fontSize: 13, color: textMuted }}>Repeat</Text>
            </View>
            <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
              {getRecurrenceLabel(parsedItem)}
            </Text>
          </View>
        )}

        {parsedItem.time && (
          <View style={styles.coreValueRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="clock" size={13} color={textMuted} />
              <Text style={{ fontSize: 13, color: textMuted }}>Time</Text>
            </View>
            <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
              {getFriendlyTimeLabel(parsedItem.time)}
            </Text>
          </View>
        )}

        {parsedItem.date && parsedItem.type === "task" && (
          <View style={styles.coreValueRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="calendar" size={13} color={textMuted} />
              <Text style={{ fontSize: 13, color: textMuted }}>Date</Text>
            </View>
            <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
              {getFriendlyDateLabel(parsedItem.date)}
            </Text>
          </View>
        )}

        <View style={styles.coreValueRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="folder" size={13} color={textMuted} />
            <Text style={{ fontSize: 13, color: textMuted }}>Workspace</Text>
          </View>
          <PressableScale
            onPress={onWorkspaceCycle}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text style={{ fontSize: 13, color: textPrimary, fontWeight: "600" }}>
              {workspaces.find((w) => w.id === selectedWorkspaceId)?.emoji || "📂"}{" "}
              {workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles"}
            </Text>
            <Feather name="chevron-down" size={12} color={textMuted} />
          </PressableScale>
        </View>
      </View>

      {/* Change Type Dropdown trigger */}
      <TouchableOpacity
        onPress={onToggleTypeOverride}
        style={styles.changeTypeTrigger}
      >
        <Text style={[styles.changeTypeTriggerText, { color: themePrimary }]}>
          Change type ▾
        </Text>
      </TouchableOpacity>

      {/* Inline Change Type Dropdown list */}
      {showTypeOverride && (
        <Animated.View entering={FadeInDown.duration(150)} exiting={FadeOut.duration(100)} style={[styles.dropdownContainer, { borderColor }]}>
          {(Object.keys(TYPE_META) as ParsedProductivityItem["type"][]).map((t) => {
            const isActive = parsedItem.type === t;
            const meta = TYPE_META[t];
            return (
              <TouchableOpacity
                key={t}
                onPress={() => onTypeOverride(t)}
                style={[styles.dropdownItem, { borderBottomColor: borderColor }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Feather name={meta.icon} size={14} color={isActive ? meta.color : textMuted} />
                  <Text style={{ fontSize: 13, fontWeight: isActive ? "700" : "500", color: isActive ? textPrimary : textMuted }}>
                    {meta.label}
                  </Text>
                </View>
                {isActive && <Feather name="check" size={13} color={meta.color} />}
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      )}

      {/* Progressive Metadata Details trigger */}
      {(parsedItem.type === "task" || parsedItem.type === "habit") && (
        <View style={{ borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 10 }}>
          <PressableScale
            onPress={onToggleMoreOptions}
            style={styles.moreDetailsTrigger}
          >
            <Text style={[styles.moreDetailsTriggerText, { color: textMuted }]}>
              {showMoreOptions ? "− Hide details" : "+ More details (Priority, Reminder, Category, Notes)"}
            </Text>
          </PressableScale>

          {showMoreOptions && (
            <Animated.View entering={FadeInDown.duration(180)} style={styles.moreDetailsCard}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: textMuted }]}>Priority</Text>
                <Text style={[styles.detailValue, { color: PRIORITY_META[parsedItem.priority || "medium"].color, fontWeight: "700" }]}>
                  {PRIORITY_META[parsedItem.priority || "medium"].label}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: textMuted }]}>Reminder</Text>
                <Text style={[styles.detailValue, { color: textPrimary }]}>
                  {parsedItem.time ? `On time` : "None"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: textMuted }]}>Category</Text>
                <Text style={[styles.detailValue, { color: textPrimary }]}>
                  {parsedItem.category ? CATEGORY_META[parsedItem.category].label : "None"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: textMuted }]}>Notes</Text>
                <Text style={[styles.detailValue, { color: textMuted, fontStyle: "italic" }]}>
                  Add notes...
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {/* Dismiss and Primary Save Action buttons */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
        <TouchableOpacity
          onPress={onDismiss}
          style={[styles.dismissBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
        >
          <Text style={[styles.dismissBtnText, { color: textPrimary }]}>Dismiss</Text>
        </TouchableOpacity>

        <PressableScale
          onPress={onSave}
          disabled={isSaving}
          scaleTo={isSaving ? 1 : 0.95}
          style={[
            styles.saveButton,
            {
              backgroundColor: isSaving ? textMuted : themePrimary,
              shadowColor: isSaving ? "transparent" : themePrimary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: isSaving ? 0 : 0.25,
              shadowRadius: 10,
              elevation: isSaving ? 0 : 5,
              flex: 1,
            },
          ]}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{saveButtonLabel}</Text>
          )}
        </PressableScale>
      </View>
    </Animated.View>
  );
});

interface CaptureSuggestionsProps {
  suggestions: string[];
  isDark: boolean;
  textPrimary: string;
  textMuted: string;
  themePrimary: string;
  onSuggestionTap: (text: string) => void;
}

const CaptureSuggestions = React.memo(function CaptureSuggestions({
  suggestions,
  isDark,
  textPrimary,
  textMuted,
  themePrimary,
  onSuggestionTap,
}: CaptureSuggestionsProps) {
  return (
    <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOut.duration(150)} style={styles.suggestionsContainer}>
      <Text style={[styles.suggestionsLabel, { color: textMuted }]}>Suggested for you</Text>
      <View style={styles.suggestionsRow}>
        {suggestions.slice(0, 4).map((text, i) => (
          <PressableScale
            key={i}
            onPress={() => onSuggestionTap(text)}
            style={[
              styles.suggestionChip,
              {
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.02)",
                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
              },
            ]}
          >
            <Feather name="zap" size={12} color={themePrimary} />
            <Text style={[styles.suggestionChipText, { color: textPrimary }]}>
              {text.length > 24 ? `${text.slice(0, 24)}…` : text}
            </Text>
          </PressableScale>
        ))}
      </View>
    </Animated.View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Voice error banner
  voiceErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.2,
    marginBottom: 12,
  },
  sheetHeaderContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 4,
  },
  sheetHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  sheetHeaderDesc: {
    fontSize: 13,
    fontWeight: "500",
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  // Companion progress bar
  companionLoadingRow: {
    marginBottom: 16,
    gap: 6,
  },
  companionLoadingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  // Suggestions
  suggestionsContainer: {
    marginTop: 8,
    gap: 10,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.2,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.15,
  },
  // Clipboard
  clipboardPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: "dashed",
    marginBottom: 16,
  },
  clipboardText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    letterSpacing: -0.1,
  },
  // Checklist suggestion
  checklistSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: "dashed",
    marginBottom: 16,
  },
  checklistConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  // Summary card
  summaryCard: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 20,
    gap: 16,
    marginTop: 4,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  // Title
  summaryTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  urlSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: -8,
    textDecorationLine: "underline",
  },
  // Attached File card
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.2,
    backgroundColor: "rgba(100,116,139,0.03)",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Checklist preview
  checklistPreview: {
    gap: 8,
    backgroundColor: "rgba(100, 116, 139, 0.03)",
    padding: 14,
    borderRadius: 14,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.8,
  },
  checklistItemText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    letterSpacing: -0.15,
  },
  // Core value row
  coreValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Change Type triggers
  changeTypeTrigger: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  changeTypeTriggerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dropdownContainer: {
    borderWidth: 1.2,
    borderRadius: 14,
    backgroundColor: "rgba(100,116,139,0.02)",
    overflow: "hidden",
    marginTop: 4,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 0.8,
  },
  // More options details
  moreDetailsTrigger: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  moreDetailsTriggerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  moreDetailsCard: {
    gap: 8,
    backgroundColor: "rgba(100, 116, 139, 0.02)",
    padding: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Dismiss and Save Buttons
  dismissBtn: {
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
});
