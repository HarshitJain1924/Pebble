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
import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
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
import { useRouter } from "expo-router";
import {
  parseProductivityText,
  type ParsedProductivityItem,
} from "@/features/capture/services/nlp-parser.service";
import {
  analyzeDuplicate,
  type DuplicateAnalysisResult,
} from "@/features/capture/services/duplicate-detection.service";
import {
  getWorkspaceSuggestions,
  type WorkspaceSuggestionResult,
} from "@/features/workspaces/services/workspace-suggestions.service";
import { INBOX_WORKSPACE_ID, type Attachment } from "@/shared/types/domain.types";
import { saveParsedItem, mergeParsedChecklist } from "@/features/capture/services/CaptureService";
import PressableScale from "@/shared/components/ui/PressableScale";
import { MetadataChipPicker, type ChipPickerOption } from "./MetadataChipPicker";

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
  low: { label: "Low", color: "#3B82F6" },
  none: { label: "None", color: "#9CA3AF" },
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

// ─── LiveCaptureInput ───────────────────────────────────────────────────────────

export interface LiveCaptureInputRef {
  getValue: () => string;
  setValue: (val: string) => void;
}

interface LiveCaptureInputProps extends Omit<React.ComponentProps<typeof CaptureInputBox>, "value" | "onChangeText"> {
  initialValue?: string;
  onEmptyChange: (isEmpty: boolean) => void;
  onTypingStart: () => void;
  onIdleText: (text: string) => void;
}

const LiveCaptureInput = forwardRef<LiveCaptureInputRef, LiveCaptureInputProps>(
  ({ initialValue = "", onEmptyChange, onTypingStart, onIdleText, ...props }, ref) => {
    const [text, setText] = useState(initialValue);
    const timerRef = useRef<any>(null);
    const latestCallbacks = useRef({ onEmptyChange, onTypingStart, onIdleText });

    useEffect(() => {
      latestCallbacks.current = { onEmptyChange, onTypingStart, onIdleText };
    }, [onEmptyChange, onTypingStart, onIdleText]);

    useImperativeHandle(ref, () => ({
      getValue: () => text,
      setValue: (val: string) => {
        setText(val);
        const isEmpty = val.trim().length === 0;
        latestCallbacks.current.onEmptyChange(isEmpty);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (isEmpty) {
          latestCallbacks.current.onIdleText("");
        } else {
          latestCallbacks.current.onIdleText(val);
        }
      },
    }));

    const handleChange = useCallback((val: string) => {
      setText(val);
      const isEmpty = val.trim().length === 0;
      latestCallbacks.current.onEmptyChange(isEmpty);

      if (timerRef.current) clearTimeout(timerRef.current);

      if (isEmpty) {
        latestCallbacks.current.onIdleText("");
        return;
      }

      latestCallbacks.current.onTypingStart();
      timerRef.current = setTimeout(() => {
        latestCallbacks.current.onIdleText(val);
      }, 450);
    }, []);

    return <CaptureInputBox value={text} onChangeText={handleChange} {...props} />;
  }
);

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
  const router = useRouter();

  // ─── State ──────────────────────────────────────────────────────────────

  const inputRef = useRef<LiveCaptureInputRef>(null);
  const [hasInput, setHasInput] = useState(false);
  const [parsedItem, setParsedItem] = useState<ParsedProductivityItem | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateAnalysisResult | null>(null);
  const duplicateResultRef = useRef<DuplicateAnalysisResult | null>(null);
  const userOverridesRef = useRef<{
    type?: ParsedProductivityItem["type"];
    priority?: ParsedProductivityItem["priority"];
    date?: string;
    category?: ParsedProductivityItem["category"];
    recurrence?: ParsedProductivityItem["recurrence"];
  }>({});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(defaultWorkspaceId);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: number; uri: string } | null>(null);

  // Workspace suggestion from parser
  const [topSuggestion, setTopSuggestion] = useState<WorkspaceSuggestionResult | null>(null);

  // Picker state
  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [morePickerOptions, setMorePickerOptions] = useState<ChipPickerOption[]>([]);

  // Voice capture
  const {
    status: voiceStatus,
    volume: voiceVolume,
    errorMsg: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceCapture({
    onTranscriptComplete: (finalText) => inputRef.current?.setValue(finalText),
    onTranscriptChange: (interimText) => inputRef.current?.setValue(interimText),
  });

  // Animation values
  const loadingProgress = useSharedValue(0);

  // ─── Effects ────────────────────────────────────────────────────────────

  // Dynamic header updates based on type
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

  // Keep duplicateResultRef in sync for stable callback reads
  useEffect(() => {
    duplicateResultRef.current = duplicateResult;
  }, [duplicateResult]);

  // ─── Live Input Callbacks ────────────────────────────────────────────────

  const handleEmptyChange = useCallback((isEmpty: boolean) => {
    setHasInput(!isEmpty);
  }, []);

  const handleTypingStart = useCallback(() => {
    setIsParsing(true);
  }, []);

  const handleIdleText = useCallback(
    (text: string) => {
      if (!text.trim()) {
        if (parsedItem !== null) setParsedItem(null);
        if (duplicateResult !== null) setDuplicateResult(null);
        if (isParsing) setIsParsing(false);
        loadingProgress.value = 0;
        return;
      }

      setIsParsing(true);
      loadingProgress.value = 0;
      loadingProgress.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 400 }), withTiming(0.9, { duration: 600 })),
        -1,
        true,
      );

      const parsed = parseProductivityText(text.trim());
      // Apply default overrides from entry context and explicit user overrides
      if (userOverridesRef.current.type) {
        parsed.type = userOverridesRef.current.type;
      } else if (defaultType && parsed.type === "task" && parsed.detectionSignal === "default_task") {
        parsed.type = defaultType;
      }

      if (userOverridesRef.current.date !== undefined) {
        parsed.date = userOverridesRef.current.date;
      } else if (defaultDate && parsed.type === "task" && !parsed.date) {
        parsed.date = defaultDate;
      }

      if (userOverridesRef.current.priority) {
        parsed.priority = userOverridesRef.current.priority;
      }

      if (userOverridesRef.current.category) {
        parsed.category = userOverridesRef.current.category;
      }

      if (userOverridesRef.current.recurrence !== undefined) {
        parsed.recurrence = userOverridesRef.current.recurrence;
      }

      setParsedItem(parsed);
      setIsParsing(false);
      loadingProgress.value = withTiming(1, { duration: 200 });

      // Clear stale duplicate result before running new check
      setDuplicateResult(null);

      // Run duplicate check in the background after typing stops (non-blocking)
      analyzeDuplicate(parsed, selectedWorkspaceId || INBOX_WORKSPACE_ID)
        .then((dupRes) => {
          if (
            dupRes &&
            (dupRes.relationship === "exact_duplicate" ||
              dupRes.relationship === "near_duplicate" ||
              dupRes.relationship === "merge_candidate")
          ) {
            setDuplicateResult(dupRes);
          } else {
            setDuplicateResult(null);
          }
        })
        .catch(() => {});

      // Workspace suggestion (non-blocking)
      if (parsed.type === "task" || parsed.type === "habit") {
        getWorkspaceSuggestions(
          parsed.title,
          parsed.category || "work",
          workspaces,
          {},
        )
          .then((wsSuggestions) => {
            const top = wsSuggestions[0];
            if (top && top.score >= 75) {
              setTopSuggestion(top);
              setSelectedWorkspaceId(top.workspaceId);
            }
          })
          .catch(() => {});
      }
    },
    [parsedItem, duplicateResult, isParsing, defaultType, defaultDate, selectedWorkspaceId, workspaces],
  );

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleTypeChange = useCallback((newType: ParsedProductivityItem["type"]) => {
    userOverridesRef.current.type = newType;
    setParsedItem((prev) => (prev ? { ...prev, type: newType } : null));
  }, []);

  const handlePriorityChange = useCallback((newPriority: ParsedProductivityItem["priority"]) => {
    userOverridesRef.current.priority = newPriority;
    setParsedItem((prev) => (prev ? { ...prev, priority: newPriority } : null));
  }, []);

  const handleDateChange = useCallback((newDate: string | undefined) => {
    userOverridesRef.current.date = newDate;
    setParsedItem((prev) => (prev ? { ...prev, date: newDate } : null));
  }, []);

  const handleCategoryChange = useCallback((newCategory: ParsedProductivityItem["category"]) => {
    userOverridesRef.current.category = newCategory;
    setParsedItem((prev) => (prev ? { ...prev, category: newCategory } : null));
  }, []);

  const handleRecurrenceChange = useCallback((newRecurrence: ParsedProductivityItem["recurrence"]) => {
    userOverridesRef.current.recurrence = newRecurrence;
    setParsedItem((prev) => (prev ? { ...prev, recurrence: newRecurrence } : null));
  }, []);

  const handleWorkspaceChange = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
  }, []);

  const handleClipboardPaste = useCallback(() => {
    if (clipboardUrl) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      inputRef.current?.setValue(clipboardUrl);
      setClipboardUrl(null);
    }
  }, [clipboardUrl]);

  const handleSuggestionTap = useCallback((text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    inputRef.current?.setValue(text);
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

  const handleSave = useCallback(
    async (bypassDuplicateCheck: boolean = false) => {
      const liveText = inputRef.current?.getValue().trim();
      if (!liveText || isSaving) return;

      // Synchronously catch up if user pressed save before 450ms timer fired
      let finalParsedItem = parsedItem;
      if (!finalParsedItem || finalParsedItem.title !== liveText) {
        finalParsedItem = parseProductivityText(liveText);
        if (userOverridesRef.current.type) {
          finalParsedItem.type = userOverridesRef.current.type;
        } else if (defaultType && finalParsedItem.type === "task" && finalParsedItem.detectionSignal === "default_task") {
          finalParsedItem.type = defaultType;
        }
        if (userOverridesRef.current.date !== undefined) {
          finalParsedItem.date = userOverridesRef.current.date;
        } else if (defaultDate && finalParsedItem.type === "task" && !finalParsedItem.date) {
          finalParsedItem.date = defaultDate;
        }
        if (userOverridesRef.current.priority) {
          finalParsedItem.priority = userOverridesRef.current.priority;
        }
        if (userOverridesRef.current.category) {
          finalParsedItem.category = userOverridesRef.current.category;
        }
        if (userOverridesRef.current.recurrence !== undefined) {
          finalParsedItem.recurrence = userOverridesRef.current.recurrence;
        }
        setParsedItem(finalParsedItem);
      }

      const wsId = selectedWorkspaceId || INBOX_WORKSPACE_ID;

      // Intercept exact duplicate in the same workspace unless user explicitly chose "Create anyway"
      // Read from ref to avoid duplicateResult in dependency array (keeps handleSave stable)
      if (!bypassDuplicateCheck) {
        let dupCheck = duplicateResultRef.current;
        if (!dupCheck || dupCheck.matchedEntity?.title !== liveText) {
          try {
            dupCheck = await analyzeDuplicate(finalParsedItem, wsId);
          } catch {
            dupCheck = null;
          }
        }

        if (
          dupCheck &&
          dupCheck.isPotentialDuplicate &&
          dupCheck.relationship === "exact_duplicate" &&
          dupCheck.matchedEntity?.workspaceId === wsId
        ) {
          setDuplicateResult(dupCheck);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return;
        }
      }

      setIsSaving(true);
      try {
        await saveParsedItem(finalParsedItem, wsId, { bypassDuplicateCheck: true });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
        const typeLabel = TYPE_META[finalParsedItem.type].label;
        showToast(`✓ ${typeLabel} added to ${wsName}`);

        // Reset
        userOverridesRef.current = {};
        inputRef.current?.setValue("");
        setParsedItem(null);
        setDuplicateResult(null);
        setAttachedFile(null);
        sheetRef.current?.dismiss();
        // Disable re-enables after dismiss is triggered (not awaited)
        setTimeout(() => setIsSaving(false), 300);
      } catch (e) {
        console.warn("UnifiedCapture save failed:", e);
        setIsSaving(false);
      }
    },
    [parsedItem, selectedWorkspaceId, workspaces, isSaving, showToast],
  );

  const handleSaveAnyway = useCallback(() => {
    handleSave(true);
  }, [handleSave]);

  const handleMergeChecklist = useCallback(async () => {
    if (!duplicateResult?.matchedEntity || !parsedItem || isSaving) return;
    setIsSaving(true);
    const wsId = selectedWorkspaceId || INBOX_WORKSPACE_ID;
    try {
      await mergeParsedChecklist(parsedItem, duplicateResult.matchedEntity.id, wsId);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
      const count = duplicateResult.newItems?.length || 0;
      showToast(`✓ Added ${count} item${count !== 1 ? "s" : ""} to existing list in ${wsName}`);

      // Reset
      userOverridesRef.current = {};
      inputRef.current?.setValue("");
      setParsedItem(null);
      setDuplicateResult(null);
      setAttachedFile(null);
      sheetRef.current?.dismiss();
    } catch (e) {
      console.warn("Failed to merge checklist", e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showToast("Failed to update checklist.");
    } finally {
      setIsSaving(false);
    }
  }, [duplicateResult, parsedItem, isSaving, selectedWorkspaceId, workspaces, showToast]);

  const handleUseExisting = useCallback(() => {
    if (!duplicateResult?.matchedEntity) return;
    const entity = duplicateResult.matchedEntity;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Reset capture input and dismiss sheet
    userOverridesRef.current = {};
    inputRef.current?.setValue("");
    setParsedItem(null);
    setDuplicateResult(null);
    setAttachedFile(null);
    sheetRef.current?.dismiss();

    try {
      if (entity.type === "task") {
        router.push({
          pathname: "/task-details",
          params: { id: entity.id, type: "task", workspaceId: entity.workspaceId },
        });
      } else if (entity.type === "habit") {
        router.push({
          pathname: "/task-details",
          params: { id: entity.id, type: "habit", workspaceId: entity.workspaceId },
        });
      } else if (entity.type === "checklist") {
        router.push({
          pathname: "/checklist-details",
          params: { id: entity.id, workspaceId: entity.workspaceId },
        });
      } else if (entity.type === "resource") {
        router.push({
          pathname: "/(tabs)/tasks",
          params: {
            workspaceId: entity.workspaceId || INBOX_WORKSPACE_ID,
            segment: "resources",
            focusItemId: entity.id,
            focusItemType: "resource",
          },
        });
      }
      showToast(`Focused existing ${entity.type}`);
    } catch {
      // Navigation fallback
    }
  }, [duplicateResult, router, showToast]);

  const handleWorkspaceCycle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (workspaces.length === 0) return;
    const idx = workspaces.findIndex((w) => w.id === selectedWorkspaceId);
    const nextIdx = (idx + 1) % workspaces.length;
    setSelectedWorkspaceId(workspaces[nextIdx].id);
  }, [workspaces, selectedWorkspaceId]);

  const handleRemoveAttachedFile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAttachedFile(null);
    setParsedItem((prev) => (prev ? { ...prev, type: "task" } : null));
  }, []);

  const handleDismiss = useCallback(() => {
    userOverridesRef.current = {};
    inputRef.current?.setValue("");
    setParsedItem(null);
    setDuplicateResult(null);
    setAttachedFile(null);
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

  // ─── Picker Config ────────────────────────────────────────────────────────

  const handleActivePickerChange = useCallback((picker: string | null, extraOptions?: ChipPickerOption[]) => {
    setActivePicker(picker);
    if (extraOptions) setMorePickerOptions(extraOptions);
  }, []);

  const pickerConfig = useMemo(() => {
    if (!activePicker) return null;

    if (activePicker === "more") {
      return {
        title: "More Metadata",
        options: morePickerOptions,
        onSelect: (id: string) => setActivePicker(id),
      };
    }

    if (activePicker === "type") {
      return {
        title: "Change Type",
        options: (Object.keys(TYPE_META) as ParsedProductivityItem["type"][]).map((t) => ({
          id: t,
          label: TYPE_META[t].label,
          icon: TYPE_META[t].icon,
          color: TYPE_META[t].color,
          isSelected: parsedItem?.type === t,
        })),
        onSelect: (id: string) => handleTypeChange(id as ParsedProductivityItem["type"]),
      };
    }

    if (activePicker === "priority") {
      return {
        title: "Set Priority",
        options: (["high", "medium", "low", "none"] as const).map((p) => ({
          id: p,
          label: PRIORITY_META[p].label,
          color: PRIORITY_META[p].color,
          isSelected: (parsedItem?.priority || "medium") === p,
        })),
        onSelect: (id: string) => handlePriorityChange(id as ParsedProductivityItem["priority"]),
      };
    }

    if (activePicker === "date") {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const weekend = new Date(today);
      const dayOfWeek = today.getDay();
      const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
      weekend.setDate(today.getDate() + daysUntilSaturday);

      const nextMonday = new Date(today);
      const daysUntilNextMon = (1 - dayOfWeek + 7) % 7 || 7;
      nextMonday.setDate(today.getDate() + daysUntilNextMon);

      return {
        title: "Set Due Date",
        options: [
          { id: getDateKey(today), label: "Today", subtitle: getFriendlyDateLabel(getDateKey(today)), icon: "sun" as const, isSelected: parsedItem?.date === getDateKey(today) },
          { id: getDateKey(tomorrow), label: "Tomorrow", subtitle: getFriendlyDateLabel(getDateKey(tomorrow)), icon: "arrow-right" as const, isSelected: parsedItem?.date === getDateKey(tomorrow) },
          { id: getDateKey(weekend), label: "This Weekend", subtitle: getFriendlyDateLabel(getDateKey(weekend)), icon: "coffee" as const, isSelected: parsedItem?.date === getDateKey(weekend) },
          { id: getDateKey(nextMonday), label: "Next Week", subtitle: getFriendlyDateLabel(getDateKey(nextMonday)), icon: "calendar" as const, isSelected: parsedItem?.date === getDateKey(nextMonday) },
          { id: "none", label: "No Due Date (Inbox)", subtitle: "Save without due date", icon: "inbox" as const, isSelected: !parsedItem?.date },
        ],
        onSelect: (id: string) => handleDateChange(id === "none" ? undefined : id),
      };
    }

    if (activePicker === "category") {
      const categories: (keyof typeof CATEGORY_META)[] = [
        "work",
        "personal",
        "health",
        "learning",
        "creative",
        "focus",
      ];
      return {
        title: "Set Category",
        options: [
          ...categories.map((c) => ({
            id: c,
            label: CATEGORY_META[c].label,
            color: CATEGORY_META[c].color,
            icon: CATEGORY_META[c].icon,
            isSelected: parsedItem?.category === c,
          })),
          {
            id: "none",
            label: "No Category",
            icon: "x" as const,
            isSelected: !parsedItem?.category,
          },
        ],
        onSelect: (id: string) => handleCategoryChange(id === "none" ? undefined : (id as ParsedProductivityItem["category"])),
      };
    }

    if (activePicker === "recurrence") {
      return {
        title: "Set Recurrence",
        options: [
          { id: "daily", label: "Daily", icon: "repeat" as const, isSelected: parsedItem?.recurrence?.type === "daily" },
          { id: "weekdays", label: "Weekdays (Mon-Fri)", icon: "calendar" as const, isSelected: parsedItem?.recurrence?.type === "weekdays" },
          { id: "weekly", label: "Weekly", icon: "refresh-cw" as const, isSelected: parsedItem?.recurrence?.type === "weekly" },
          { id: "monthly", label: "Monthly", icon: "calendar" as const, isSelected: parsedItem?.recurrence?.type === "monthly" },
          { id: "none", label: "Don't Repeat (Once)", icon: "x" as const, isSelected: !parsedItem?.recurrence },
        ],
        onSelect: (id: string) =>
          handleRecurrenceChange(
            id === "none"
              ? undefined
              : { type: id as any, interval: 1 },
          ),
      };
    }

    if (activePicker === "workspace") {
      return {
        title: "Select Workspace",
        options: workspaces.map((w) => ({
          id: w.id,
          label: `${w.emoji || "📂"} ${w.name}`,
          isSelected: (selectedWorkspaceId || INBOX_WORKSPACE_ID) === w.id,
        })),
        onSelect: (id: string) => handleWorkspaceChange(id),
      };
    }

    return null;
  }, [activePicker, parsedItem, selectedWorkspaceId, workspaces, morePickerOptions, handleTypeChange, handlePriorityChange, handleDateChange, handleCategoryChange, handleRecurrenceChange, handleWorkspaceChange]);

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
        userOverridesRef.current = {};
        inputRef.current?.setValue("");
        setParsedItem(null);
        setAttachedFile(null);
        setClipboardUrl(null);
        cancelRecording();
      }
    },
    [cancelRecording],
  );

  return (
    <>
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
        <LiveCaptureInput
          ref={inputRef}
          onEmptyChange={handleEmptyChange}
          onTypingStart={handleTypingStart}
          onIdleText={handleIdleText}
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
        {clipboardUrl && !hasInput && (
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
            duplicateResult={duplicateResult}
            isDark={isDark}
            textPrimary={textPrimary}
            textMuted={textMuted}
            borderColor={borderColor}
            themePrimary={theme.primary}
            themeSecondary={theme.secondary}
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onActivePickerChange={handleActivePickerChange}
            attachedFile={attachedFile}
            onRemoveAttachedFile={handleRemoveAttachedFile}
            onDismiss={handleDismiss}
            onSave={handleSave}
            onSaveAnyway={handleSaveAnyway}
            onUseExisting={handleUseExisting}
            onMergeChecklist={handleMergeChecklist}
            isSaving={isSaving}
            saveButtonLabel={saveButtonLabel}
          />
        )}

        {/* ── Smart Suggestions (from computed adaptive suggestions) ── */}
        {!hasInput && suggestions.length > 0 && (
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

    {/* Contextual Modal Picker Overlay */}
    {pickerConfig && (
      <MetadataChipPicker
        visible={!!activePicker}
        title={pickerConfig.title}
        options={pickerConfig.options}
        onSelect={pickerConfig.onSelect}
        onClose={() => setActivePicker(null)}
        isDark={isDark}
      />
    )}
    </>
  );
}

// ─── Memoized Subcomponents ──────────────────────────────────────────────────

interface CaptureSummaryCardProps {
  parsedItem: ParsedProductivityItem;
  duplicateResult: DuplicateAnalysisResult | null;
  isDark: boolean;
  textPrimary: string;
  textMuted: string;
  borderColor: string;
  themePrimary: string;
  themeSecondary: string;
  workspaces: { id: string; name: string; emoji?: string }[];
  selectedWorkspaceId?: string;
  onActivePickerChange: (picker: string | null, extraOptions?: ChipPickerOption[]) => void;
  attachedFile: { name: string; size: number; uri: string } | null;
  onRemoveAttachedFile: () => void;
  onDismiss: () => void;
  onSave: () => void;
  onSaveAnyway: () => void;
  onUseExisting: () => void;
  onMergeChecklist: () => void;
  isSaving: boolean;
  saveButtonLabel: string;
}

const CaptureSummaryCard = React.memo(function CaptureSummaryCard({
  parsedItem,
  duplicateResult,
  isDark,
  textPrimary,
  textMuted,
  borderColor,
  themePrimary,
  themeSecondary,
  workspaces,
  selectedWorkspaceId,
  onActivePickerChange,
  attachedFile,
  onRemoveAttachedFile,
  onDismiss,
  onSave,
  onSaveAnyway,
  onUseExisting,
  onMergeChecklist,
  isSaving,
  saveButtonLabel,
}: CaptureSummaryCardProps) {
  const isSameWorkspaceExactDuplicate =
    duplicateResult &&
    duplicateResult.isPotentialDuplicate &&
    duplicateResult.relationship === "exact_duplicate" &&
    duplicateResult.matchedEntity?.workspaceId === (selectedWorkspaceId || INBOX_WORKSPACE_ID);

  const isCrossWorkspaceExactDuplicate =
    duplicateResult &&
    duplicateResult.isPotentialDuplicate &&
    duplicateResult.relationship === "exact_duplicate" &&
    duplicateResult.matchedEntity?.workspaceId !== (selectedWorkspaceId || INBOX_WORKSPACE_ID);

  const isNearDuplicate =
    duplicateResult &&
    duplicateResult.relationship === "near_duplicate";

  const isMergeCandidate =
    duplicateResult &&
    duplicateResult.relationship === "merge_candidate";

  const currentWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  // ─── Metadata Chips Generation ───
  type ChipData = {
    id: string;
    icon: React.ComponentProps<typeof Feather>["name"] | null;
    label: string;
    color: string;
    bgColor: string;
    emoji?: string;
    isPriority?: boolean;
  };

  const chipsMap = new Map<string, ChipData>();

  if (parsedItem.type === "task") {
    chipsMap.set("date", {
      id: "date",
      icon: "calendar",
      label: parsedItem.date ? getFriendlyDateLabel(parsedItem.date) : "No date",
      color: textPrimary,
      bgColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
    });
  }

  if (parsedItem.type === "habit" || parsedItem.recurrence) {
    chipsMap.set("recurrence", {
      id: "recurrence",
      icon: "refresh-cw",
      label: getRecurrenceLabel(parsedItem) || "Daily",
      color: textPrimary,
      bgColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
    });
  }

  if (parsedItem.type === "task" || parsedItem.type === "habit") {
    chipsMap.set("priority", {
      id: "priority",
      icon: null,
      isPriority: true,
      label: PRIORITY_META[parsedItem.priority || "medium"].label,
      color: textPrimary,
      bgColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
    });
  }

  if ((parsedItem.type === "task" || parsedItem.type === "habit") && parsedItem.category) {
    chipsMap.set("category", {
      id: "category",
      icon: CATEGORY_META[parsedItem.category].icon,
      label: CATEGORY_META[parsedItem.category].label,
      color: textPrimary,
      bgColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
    });
  }

  chipsMap.set("workspace", {
    id: "workspace",
    icon: null,
    emoji: currentWorkspace?.emoji || "📂",
    label: currentWorkspace?.name || "My Pebbles",
    color: textPrimary,
    bgColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
  });

  const taskOrder = ["date", "priority", "workspace", "category"];
  const habitOrder = ["recurrence", "priority", "workspace", "category"];
  const checklistOrder = ["workspace", "category"];

  let currentOrder: string[] = [];
  if (parsedItem.type === "task") currentOrder = taskOrder;
  else if (parsedItem.type === "habit") currentOrder = habitOrder;
  else if (parsedItem.type === "checklist") currentOrder = checklistOrder;
  else currentOrder = ["workspace"];

  const orderedChips: ChipData[] = [];
  for (const id of currentOrder) {
    if (chipsMap.has(id)) {
      orderedChips.push(chipsMap.get(id)!);
    }
  }

  const MAX_CHIPS = 3;
  const visibleChipsData = orderedChips.slice(0, MAX_CHIPS);
  const extraChipsData = orderedChips.slice(MAX_CHIPS);
  const extraChipsCount = extraChipsData.length;

  const handleMorePress = () => {
    const options: ChipPickerOption[] = extraChipsData.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon as any,
      color: c.isPriority ? PRIORITY_META[parsedItem.priority || "medium"].color : c.color,
      isSelected: false,
    }));
    onActivePickerChange("more", options);
  };

  const visibleChips = visibleChipsData.map((chip) => (
    <PressableScale
      key={chip.id}
      onPress={() => onActivePickerChange(chip.id)}
      style={[
        styles.chip,
        {
          backgroundColor: chip.bgColor,
        },
      ]}
    >
      {chip.icon ? (
        <Feather name={chip.icon} size={12} color={chip.color} />
      ) : chip.isPriority ? (
        <View
          style={[
            styles.priorityDot,
            { backgroundColor: PRIORITY_META[parsedItem.priority || "medium"].color },
          ]}
        />
      ) : (
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13 }}>
          {chip.emoji}
        </Text>
      )}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          styles.chipText,
          { color: chip.color, fontWeight: "600" },
        ]}
      >
        {chip.label}
      </Text>
    </PressableScale>
  ));

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
      {/* Header: Interactive Type Badge + Confidence */}
      <View style={styles.summaryHeader}>
        <PressableScale
          onPress={() => onActivePickerChange("type")}
          style={[
            styles.typeBadge,
            {
              backgroundColor: `${TYPE_META[parsedItem.type].color}14`,
              borderColor: `${TYPE_META[parsedItem.type].color}30`,
              borderWidth: 1,
            },
          ]}
        >
          <Feather
            name={TYPE_META[parsedItem.type].icon}
            size={12}
            color={TYPE_META[parsedItem.type].color}
          />
          <Text style={[styles.typeBadgeText, { color: TYPE_META[parsedItem.type].color }]}>
            {TYPE_META[parsedItem.type].label}
          </Text>
          <Feather name="chevron-down" size={10} color={TYPE_META[parsedItem.type].color} />
        </PressableScale>

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

      {/* ── Metadata Chips Row ── */}
      <View style={styles.chipsContainer}>
        {visibleChips}
        {extraChipsCount > 0 && (
          <PressableScale
            onPress={handleMorePress}
            accessibilityRole="button"
            accessibilityLabel="Show more metadata"
            style={[styles.chip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)" }]}
          >
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.chipText, { color: textMuted, fontWeight: "600", fontSize: 14, letterSpacing: 1, paddingHorizontal: 2 }]}>
              •••
            </Text>
          </PressableScale>
        )}
      </View>

      {/* ── Duplicate Notices / Warnings ── */}
      {isSameWorkspaceExactDuplicate && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[
            styles.duplicateWarningBox,
            {
              backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.08)",
              borderColor: isDark ? "#F59E0B" : "#D97706",
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="alert-circle" size={16} color={isDark ? "#FBBF24" : "#D97706"} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: isDark ? "#FBBF24" : "#D97706", flex: 1 }}>
              Exact duplicate in this workspace
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: textMuted, marginTop: 4, lineHeight: 16 }}>
            An identical {duplicateResult?.matchedEntity?.type || "item"} already exists: &ldquo;{duplicateResult?.matchedEntity?.title}&rdquo;
          </Text>
        </Animated.View>
      )}

      {isNearDuplicate && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[
            styles.duplicateInfoBox,
            {
              backgroundColor: isDark ? "rgba(99, 102, 241, 0.1)" : "rgba(99, 102, 241, 0.05)",
              borderColor: isDark ? "rgba(99, 102, 241, 0.25)" : "rgba(99, 102, 241, 0.2)",
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="info" size={14} color={themePrimary} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: textPrimary, flex: 1 }}>
              Similar {duplicateResult?.matchedEntity?.type || "item"} exists: &ldquo;{duplicateResult?.matchedEntity?.title}&rdquo;
            </Text>
          </View>
        </Animated.View>
      )}

      {isCrossWorkspaceExactDuplicate && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[
            styles.duplicateInfoBox,
            {
              backgroundColor: isDark ? "rgba(100, 116, 139, 0.08)" : "rgba(100, 116, 139, 0.04)",
              borderColor: isDark ? "rgba(100, 116, 139, 0.2)" : "rgba(100, 116, 139, 0.15)",
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="info" size={14} color={textMuted} />
            <Text style={{ fontSize: 12, fontWeight: "500", color: textMuted, flex: 1 }}>
              Identical item exists in another workspace ({duplicateResult?.matchedEntity?.workspaceId})
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── Action Buttons ── */}
      {isMergeCandidate ? (
        <View style={{ marginTop: 12 }}>
          <Animated.View
            entering={FadeInDown.duration(180)}
            style={[
              styles.duplicateInfoBox,
              {
                backgroundColor: isDark ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.05)",
                borderColor: isDark ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.2)",
                marginBottom: 10,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Feather name="layers" size={16} color={isDark ? "#10B981" : "#059669"} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: isDark ? "#10B981" : "#059669", marginBottom: 4 }}>
                  Update existing {duplicateResult?.matchedEntity?.title} list?
                </Text>
                {duplicateResult?.overlappingItems && duplicateResult.overlappingItems.length > 0 && (
                  <Text style={{ fontSize: 12, color: textMuted, marginBottom: 2 }}>
                    <Text style={{ fontWeight: "600" }}>Already there: </Text>
                    {duplicateResult.overlappingItems.join(", ")}
                  </Text>
                )}
                {duplicateResult?.newItems && duplicateResult.newItems.length > 0 && (
                  <Text style={{ fontSize: 12, color: textMuted }}>
                    <Text style={{ fontWeight: "600" }}>Add: </Text>
                    {duplicateResult.newItems.join(", ")}
                  </Text>
                )}
              </View>
            </View>
          </Animated.View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PressableScale
              onPress={onMergeChecklist}
              disabled={isSaving}
              scaleTo={isSaving ? 1 : 0.95}
              style={[
                styles.saveButton,
                {
                  backgroundColor: isSaving ? textMuted : isDark ? "#10B981" : "#059669",
                  shadowColor: isSaving ? "transparent" : (isDark ? "#10B981" : "#059669"),
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isSaving ? 0 : 0.2,
                  shadowRadius: 8,
                  elevation: isSaving ? 0 : 4,
                  flex: 1,
                },
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  Add {duplicateResult?.newItems?.length ?? 1} item{(duplicateResult?.newItems?.length || 0) === 1 ? "" : "s"} to existing list
                </Text>
              )}
            </PressableScale>

            <TouchableOpacity
              onPress={onSaveAnyway}
              style={[
                styles.useExistingBtn,
                {
                  borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  flex: 1,
                },
              ]}
            >
              <Text style={[styles.useExistingBtnText, { color: textPrimary }]}>Create separate</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : isSameWorkspaceExactDuplicate ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <TouchableOpacity
            onPress={onUseExisting}
            style={[
              styles.useExistingBtn,
              {
                borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                flex: 1,
              },
            ]}
          >
            <Feather name="external-link" size={14} color={textPrimary} />
            <Text style={[styles.useExistingBtnText, { color: textPrimary }]}>Use existing</Text>
          </TouchableOpacity>

          <PressableScale
            onPress={onSaveAnyway}
            disabled={isSaving}
            scaleTo={isSaving ? 1 : 0.95}
            style={[
              styles.saveAnywayBtn,
              {
                backgroundColor: isSaving ? textMuted : isDark ? "#F59E0B" : "#D97706",
                flex: 1,
              },
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveAnywayBtnText}>Create anyway</Text>
            )}
          </PressableScale>
        </View>
      ) : (
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
      )}
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
    borderWidth: 1.2,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    overflow: "hidden",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexShrink: 1,
    maxWidth: 160,
  },
  chipText: {
    fontSize: 13,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  // Title
  summaryTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  urlSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: -4,
    textDecorationLine: "underline",
  },
  // Attached File card
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.2,
    backgroundColor: "rgba(100,116,139,0.03)",
  },
  fileName: {
    fontSize: 13,
    fontWeight: "700",
  },
  // Checklist preview
  checklistPreview: {
    gap: 6,
    backgroundColor: "rgba(100, 116, 139, 0.03)",
    padding: 10,
    borderRadius: 12,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checklistBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  checklistItemText: {
    fontSize: 13,
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
  // Dismiss and Save Buttons
  dismissBtn: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  // Duplicate warning & action styles
  duplicateWarningBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.2,
    marginTop: 2,
    marginBottom: 2,
  },
  duplicateInfoBox: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
    marginBottom: 2,
  },
  useExistingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  useExistingBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  saveAnywayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  saveAnywayBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
});
