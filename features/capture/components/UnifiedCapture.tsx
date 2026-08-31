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
  Pressable,
  Keyboard,
  Image,
  Linking,
  Modal,
  Platform,
} from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
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
import { dateKeyFromDate, getTodayDateKey } from "@/shared/utils/date-key";
import { saveParsedItem, mergeParsedChecklist, type SavedEntity } from "@/features/capture/services/CaptureService";
import { EntityCommandService } from "@/services/command/EntityCommandService";
import PressableScale from "@/shared/components/ui/PressableScale";
import { MetadataChipPicker, type ChipPickerOption } from "./MetadataChipPicker";

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP_POINTS = ["90%"];

// AsyncStorage key for the in-progress capture draft (restored on next session).
const QUICK_CAPTURE_DRAFT_KEY = "quick_capture_draft_v1";

/**
 * Discriminate the concrete entity type returned by the save pipeline
 * so Undo can call the correct permanent-delete command.
 */
function getSavedEntityKind(entity: SavedEntity): "task" | "habit" | "checklist" | "resource" {
  if ("completionHistory" in entity) return "habit";
  if ("items" in entity) return "checklist";
  if ("status" in entity && "priority" in entity) return "task";
  return "resource";
}

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

function getDomainFromUrl(url: string): string {
  try {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  } catch {
    return "link";
  }
}

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

function getFileIcon(mimeType?: string): React.ComponentProps<typeof Feather>["name"] {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "music";
  if (mime === "application/pdf" || mime.startsWith("text/")) return "file-text";
  return "file";
}

function getFileTypeLabel(mimeType?: string): string {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("text/")) return "Text";
  if (mime.includes("word")) return "Document";
  if (mime.includes("sheet")) return "Spreadsheet";
  if (mime.includes("presentation")) return "Slides";
  return "File";
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFriendlyDateLabel(dateStr?: string): string {
  if (!dateStr) return "No date";
  const today = getTodayDateKey();
  if (dateStr === today) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === dateKeyFromDate(tomorrow)) return "Tomorrow";
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

function formatDateTimeLabel(dateStr?: string, timeStr?: string): string {
  if (dateStr && timeStr) return `${getFriendlyDateLabel(dateStr)} ${getFriendlyTimeLabel(timeStr)}`;
  if (dateStr) return getFriendlyDateLabel(dateStr);
  if (timeStr) return getFriendlyTimeLabel(timeStr);
  return "No date";
}

function getReminderLabel(offset?: number): string | null {
  if (offset == null) return null;
  if (offset === 0) return "At time of task";
  if (offset % 60 === 0) return `${offset / 60} hour${offset === 60 ? "" : "s"} before`;
  return `${offset} min before`;
}

function getReminderShortLabel(offset?: number): string | null {
  if (offset == null || offset <= 0) return null;
  if (offset % 60 === 0) return `${offset / 60}h`;
  return `${offset}m`;
}

/**
 * One-line, at-a-glance readout of what the parser understood.
 * Only shows values that were actually detected or edited (never defaults).
 */
function getParsedSummary(item: ParsedProductivityItem): string {
  const parts: string[] = [TYPE_META[item.type]?.label ?? "Task"];
  if (item.date || item.time) parts.push(formatDateTimeLabel(item.date, item.time));
  if (item.priorityDetected && item.priority) parts.push(PRIORITY_META[item.priority].label);
  if (item.recurrence) parts.push(getRecurrenceLabel(item) || "Repeats");
  const reminderShort = getReminderShortLabel(item.reminderOffsetMinutes);
  if (reminderShort) parts.push(`${reminderShort} reminder`);
  if (item.category) parts.push(CATEGORY_META[item.category]?.label ?? item.category);
  if (item.type === "checklist" && item.items?.length) {
    parts.push(`${item.items.length} ${item.items.length === 1 ? "item" : "items"}`);
  }
  return parts.join(" · ");
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

// ─── FileRenameInput ───────────────────────────────────────────────────────────
// Isolates the rename field's text in local component state (same pattern as
// LiveCaptureInput) so editing the name never re-renders the whole capture tree.
// The parent reads the final value on demand via getValue() at save time.

export interface FileRenameInputRef {
  getValue: () => string;
}

const FileRenameInput = forwardRef<FileRenameInputRef, {
  initialValue: string;
  textColor: string;
  placeholderTextColor: string;
}>(
  function FileRenameInput({ initialValue, textColor, placeholderTextColor }, ref) {
    const [text, setText] = useState(initialValue);

    useImperativeHandle(ref, () => ({
      getValue: () => text,
    }));

    return (
      <BottomSheetTextInput
        value={text}
        onChangeText={setText}
        style={[styles.fileOnlyNameInput, { color: textColor }]}
        placeholder="File name"
        placeholderTextColor={placeholderTextColor}
        accessibilityLabel="Rename file"
        maxLength={120}
      />
    );
  }
);

// ─── Picker Config ───────────────────────────────────────────────────────────

interface PickerConfig {
  title: string;
  options: ChipPickerOption[];
  onSelect: (id: string) => void;
  /** Keep the picker open after selecting (drill-in navigation from More). */
  closeOnSelect?: boolean;
  /** Selected date (YYYY-MM-DD) for the real calendar. */
  calendarDate?: string;
  /** When provided, the Date picker renders a real calendar. */
  onCalendarSelect?: (dateStr: string) => void;
  /** Current time (HH:MM) for the time dial. */
  timeValue?: string;
  /** When provided, the picker renders the real time dial. */
  onTimeSelect?: (timeStr: string) => void;
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
  const { showToast, showUndo } = useUndo();
  const router = useRouter();

  // ─── State ──────────────────────────────────────────────────────────────

  const inputRef = useRef<LiveCaptureInputRef>(null);
  // Isolated rename field state — read the final name on demand at save time
  // (keystrokes only re-render the small FileRenameInput, never this tree).
  const renameInputRef = useRef<FileRenameInputRef>(null);
  const [hasInput, setHasInput] = useState(false);
  const [parsedItem, setParsedItem] = useState<ParsedProductivityItem | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateAnalysisResult | null>(null);
  const duplicateResultRef = useRef<DuplicateAnalysisResult | null>(null);
  const userOverridesRef = useRef<{
    type?: ParsedProductivityItem["type"];
    priority?: ParsedProductivityItem["priority"];
    date?: string;
    time?: string;
    category?: ParsedProductivityItem["category"];
    recurrence?: ParsedProductivityItem["recurrence"];
    reminderOffsetMinutes?: number;
  }>({});
  // Guards stale async parse/duplicate/workspace results from overwriting newer input.
  const parseVersionRef = useRef(0);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(defaultWorkspaceId);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Parser feedback phases: idle → interpreting → understood (minimum display time).
  const [parsePhase, setParsePhase] = useState<"idle" | "interpreting" | "understood">("idle");
  const parsePhaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Full Attachment object (id/name/uri/mimeType/size) so the saved item can carry it.
  const [attachedFile, setAttachedFile] = useState<Attachment | null>(null);
  // Full-screen in-app preview for image attachments (set by the eye button).
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);

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

  // Restore any in-progress draft from a previous session (sheet content stays mounted,
  // so this only matters across app restarts). Restoring also re-runs the parser, which
  // is exactly what we want: the chips reappear with the draft when the sheet opens.
  // Guard: only restore if the user hasn't already entered text (async read can resolve
  // after the user started typing — never clobber newer input).
  useEffect(() => {
    (async () => {
      try {
        const draft = await AsyncStorage.getItem(QUICK_CAPTURE_DRAFT_KEY);
        if (draft && draft.trim() && !inputRef.current?.getValue().trim()) {
          inputRef.current?.setValue(draft);
        }
      } catch {
        // Draft restore is best-effort
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

  // Clear the parse-phase timer on unmount
  useEffect(() => {
    return () => {
      if (parsePhaseTimerRef.current) clearTimeout(parsePhaseTimerRef.current);
    };
  }, []);

  // ─── Live Input Callbacks ────────────────────────────────────────────────

  const handleEmptyChange = useCallback((isEmpty: boolean) => {
    setHasInput(!isEmpty);
  }, []);

  const handleTypingStart = useCallback(() => {
    if (parsePhaseTimerRef.current) {
      clearTimeout(parsePhaseTimerRef.current);
      parsePhaseTimerRef.current = null;
    }
    setParsePhase("interpreting");
    // The text changed — any duplicate result (and its Add-disabling state) is stale.
    // Clear immediately so Add re-enables the instant the user edits, instead of
    // lingering until the 450ms debounce re-runs the check.
    setDuplicateResult(null);
  }, []);

  // Apply explicit user overrides (and entry-context defaults) to a freshly parsed item.
  // Shared by the idle parse path, the save catch-up path, and attachment removal.
  const applyUserOverrides = useCallback(
    (parsed: ParsedProductivityItem): ParsedProductivityItem => {
      if (userOverridesRef.current.type) {
        parsed.type = userOverridesRef.current.type;
      } else if (defaultType && parsed.type === "task" && parsed.detectionSignal === "default_task") {
        parsed.type = defaultType;
      }
      if (userOverridesRef.current.date !== undefined) {
        parsed.date = userOverridesRef.current.date;
      } else if (defaultDate && (parsed.type === "task" || parsed.type === "checklist") && !parsed.date) {
        parsed.date = defaultDate;
      }
      if (userOverridesRef.current.priority) {
        parsed.priority = userOverridesRef.current.priority;
        parsed.priorityDetected = true;
      }
      if (userOverridesRef.current.time !== undefined) {
        parsed.time = userOverridesRef.current.time;
      }
      if (userOverridesRef.current.reminderOffsetMinutes !== undefined) {
        parsed.reminderOffsetMinutes = userOverridesRef.current.reminderOffsetMinutes;
      }
      if (userOverridesRef.current.category) {
        parsed.category = userOverridesRef.current.category;
      }
      if (userOverridesRef.current.recurrence !== undefined) {
        parsed.recurrence = userOverridesRef.current.recurrence;
      }
      return parsed;
    },
    [defaultType, defaultDate],
  );

  const handleIdleText = useCallback(
    (text: string) => {
      // Invalidate any in-flight async results from a previous parse.
      const version = ++parseVersionRef.current;
      if (!text.trim()) {
        if (parsePhaseTimerRef.current) {
          clearTimeout(parsePhaseTimerRef.current);
          parsePhaseTimerRef.current = null;
        }
        if (parsedItem !== null) setParsedItem(null);
        if (duplicateResult !== null) setDuplicateResult(null);
        setParsePhase("idle");
        setTopSuggestion(null);
        loadingProgress.value = 0;
        AsyncStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY).catch(() => {});
        return;
      }

      setParsePhase("interpreting");
      loadingProgress.value = 0;
      loadingProgress.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 400 }), withTiming(0.9, { duration: 600 })),
        -1,
        true,
      );

      const parsed = applyUserOverrides(parseProductivityText(text.trim()));

      // An attached file is independent metadata — keep the parsed type.
      if (attachedFile) {
        parsed.attachments = [attachedFile];
      }

      setParsedItem(parsed);
      loadingProgress.value = withTiming(1, { duration: 200 });

      // Persist the in-progress draft (debounced: this runs once typing settles).
      AsyncStorage.setItem(QUICK_CAPTURE_DRAFT_KEY, text.trim()).catch(() => {});

      // Keep the indicator visible long enough to be perceived, then confirm.
      if (parsePhaseTimerRef.current) {
        clearTimeout(parsePhaseTimerRef.current);
        parsePhaseTimerRef.current = null;
      }
      parsePhaseTimerRef.current = setTimeout(() => {
        setParsePhase("understood");
        parsePhaseTimerRef.current = setTimeout(() => setParsePhase("idle"), 1200);
      }, 600);

      // Clear stale duplicate result before running new check
      setDuplicateResult(null);

      // Run duplicate check in the background after typing stops (non-blocking)
      analyzeDuplicate(parsed, selectedWorkspaceId || INBOX_WORKSPACE_ID)
        .then((dupRes) => {
          if (version !== parseVersionRef.current) return;
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

      // Workspace suggestion (non-blocking; never silently overrides the user's selection)
      if (parsed.type === "task" || parsed.type === "habit") {
        getWorkspaceSuggestions(
          parsed.title,
          parsed.category || "work",
          workspaces,
          {},
        )
          .then((wsSuggestions) => {
            if (version !== parseVersionRef.current) return;
            const top = wsSuggestions[0];
            if (top && top.score >= 75) {
              setTopSuggestion(top);
            }
          })
          .catch(() => {});
      }
    },
    [parsedItem, duplicateResult, selectedWorkspaceId, workspaces, attachedFile, applyUserOverrides],
  );

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleTypeChange = useCallback((newType: ParsedProductivityItem["type"]) => {
    userOverridesRef.current.type = newType;
    setParsedItem((prev) => (prev ? { ...prev, type: newType } : null));
  }, []);

  const handlePriorityChange = useCallback((newPriority: ParsedProductivityItem["priority"] | undefined) => {
    userOverridesRef.current.priority = newPriority;
    setParsedItem((prev) => (prev ? { ...prev, priority: newPriority, priorityDetected: !!newPriority } : null));
  }, []);

  const handleDateChange = useCallback((newDate: string | undefined) => {
    userOverridesRef.current.date = newDate;
    setParsedItem((prev) => (prev ? { ...prev, date: newDate } : null));
  }, []);

  const handleTimeChange = useCallback((newTime: string | undefined) => {
    userOverridesRef.current.time = newTime;
    setParsedItem((prev) => (prev ? { ...prev, time: newTime } : null));
  }, []);

  const handleReminderChange = useCallback((offset: number | undefined) => {
    userOverridesRef.current.reminderOffsetMinutes = offset;
    setParsedItem((prev) => (prev ? { ...prev, reminderOffsetMinutes: offset } : null));
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
    setTopSuggestion(null);
  }, []);

  const handleAcceptWorkspaceSuggestion = useCallback(() => {
    if (!topSuggestion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedWorkspaceId(topSuggestion.workspaceId);
    setTopSuggestion(null);
  }, [topSuggestion]);

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
        setAttachedFile(attachment);
        // The attachment is independent capture metadata: merge it onto the
        // current parse without changing its type (no "File" type chip).
        setParsedItem((prev) => (prev ? { ...prev, attachments: [attachment] } : prev));
      }
    } catch (err) {
      console.warn("Document picker error", err);
    }
  }, []);

  // ─── Save Handler ──────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (bypassDuplicateCheck: boolean = false) => {
      const liveText = inputRef.current?.getValue().trim();
      const hasAttachment = !!attachedFile;
      if ((!liveText && !hasAttachment) || isSaving) return;

      // Synchronously catch up if user pressed save before 450ms timer fired
      let finalParsedItem = parsedItem;
      if (liveText && (!finalParsedItem || finalParsedItem.title !== liveText)) {
        finalParsedItem = applyUserOverrides(parseProductivityText(liveText));
        setParsedItem(finalParsedItem);
      }

      if (attachedFile) {
        // Attachments persist on Resources only, so an attached file saves as a
        // reference Resource (title = typed text or file name). The UI treats it
        // as independent metadata — no "File" type chip — the save decides here.
        // The renamed name (if any) comes from the isolated rename field.
        const finalName = renameInputRef.current?.getValue() || attachedFile.name;
        const renamedAttachment = { ...attachedFile, name: finalName };
        finalParsedItem = {
          ...(finalParsedItem ?? { confidence: 0.95 }),
          type: "file",
          title: liveText || finalParsedItem?.title || finalName,
          attachments: [renamedAttachment],
        };
        setParsedItem(finalParsedItem);
      }

      if (!finalParsedItem) {
        // Nothing to save (guards above make this unreachable, but keep the type safe).
        return;
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
        const saved = await saveParsedItem(finalParsedItem, wsId, { bypassDuplicateCheck: true });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const wsName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name || "My Pebbles";
        const typeLabel = TYPE_META[finalParsedItem.type].label;

        // Offer Undo for a few seconds: permanently delete the just-created entity
        // (this also cancels its reminders) and restore the capture text for re-editing.
        showUndo({
          message: `${typeLabel} added to ${wsName}`,
          actionLabel: "Undo",
          duration: 5000,
          onUndo: async () => {
            try {
              const kind = getSavedEntityKind(saved);
              if (kind === "task") {
                await EntityCommandService.permanentlyDeleteTask(saved.id, saved.workspaceId);
              } else if (kind === "habit") {
                await EntityCommandService.permanentlyDeleteHabit(saved.id, saved.workspaceId);
              } else if (kind === "checklist") {
                await EntityCommandService.permanentlyDeleteChecklist(saved.id, saved.workspaceId);
              } else {
                await EntityCommandService.permanentlyDeleteResource(saved.id, saved.workspaceId);
              }
              // Put the text back so the user can re-edit instead of retyping.
              inputRef.current?.setValue(liveText ?? "");
            } catch (err) {
              console.warn("Quick Capture undo failed:", err);
            }
          },
        });

        // Reset
        userOverridesRef.current = {};
        inputRef.current?.setValue("");
        setParsedItem(null);
        setDuplicateResult(null);
        setTopSuggestion(null);
        setAttachedFile(null);
        AsyncStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY).catch(() => {});
        sheetRef.current?.dismiss();
        // Disable re-enables after dismiss is triggered (not awaited)
        setTimeout(() => setIsSaving(false), 300);
      } catch (e) {
        console.warn("UnifiedCapture save failed:", e);
        setIsSaving(false);
      }
    },
    [parsedItem, selectedWorkspaceId, workspaces, isSaving, showToast, showUndo, attachedFile, applyUserOverrides],
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
      AsyncStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY).catch(() => {});
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
    AsyncStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY).catch(() => {});
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
    setTopSuggestion(null);
  }, [workspaces, selectedWorkspaceId]);

  const handleRemoveAttachedFile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAttachedFile(null);
    const text = inputRef.current?.getValue().trim();
    if (!text) {
      // No text left behind the file — reset to empty capture.
      setParsedItem(null);
      return;
    }
    // Re-derive the item from the current text (overrides reapplied, no file semantics).
    setParsedItem(applyUserOverrides(parseProductivityText(text)));
  }, [applyUserOverrides]);

  const handleOpenAttachment = useCallback(
    (attachment: Attachment) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (attachment.mimeType?.startsWith("image/")) {
        // Genuine in-app preview for images (full-screen modal).
        setImagePreviewUri(attachment.uri);
        return;
      }
      // Other file types: hand off to another supported app via the system
      // "Open with…" chooser (Android intent / iOS Linking).
      const openWithSystem = async () => {
        if (Platform.OS === "android") {
          try {
            await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
              data: attachment.uri,
              type: attachment.mimeType || undefined,
            });
            return;
          } catch {
            // Fall through to Linking
          }
        }
        try {
          await Linking.openURL(attachment.uri);
        } catch {
          showToast("Couldn't open this file");
        }
      };
      openWithSystem();
    },
    [showToast],
  );

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

  // ─── Picker Config ────────────────────────────────────────────────────────

  const handleActivePickerChange = useCallback((picker: string | null, extraOptions?: ChipPickerOption[]) => {
    // Dismiss the keyboard so the centered modal card is never pushed behind it.
    if (picker) Keyboard.dismiss();
    setActivePicker(picker);
    if (extraOptions) setMorePickerOptions(extraOptions);
  }, []);

  const pickerConfig = useMemo<PickerConfig | null>(() => {
    if (!activePicker) return null;

    if (activePicker === "more") {
      return {
        title: "Details",
        options: morePickerOptions,
        // Drill into the tapped field's picker (Details editor stays mounted, no double-close).
        onSelect: (id: string) => setActivePicker(id),
        closeOnSelect: false,
      };
    }

    if (activePicker === "type") {
      // User-facing capture intents only; Link/File stay internal (auto-detected / attachments).
      const userTypeOrder: ParsedProductivityItem["type"][] = ["task", "habit", "checklist", "note", "idea"];
      return {
        title: "Change Type",
        options: userTypeOrder.map((t) => ({
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
          isSelected: p === "none" ? !parsedItem?.priorityDetected : parsedItem?.priority === p,
        })),
        onSelect: (id: string) =>
          handlePriorityChange(id === "none" ? undefined : (id as ParsedProductivityItem["priority"])),
      };
    }

    if (activePicker === "date") {
      const today = new Date();
      return {
        title: "Due Date",
        // Real calendar + real time dial; the "No due date" row is a clear action.
        calendarDate: parsedItem?.date || dateKeyFromDate(today),
        onCalendarSelect: (dateStr: string) => handleDateChange(dateStr),
        timeValue: parsedItem?.time,
        onTimeSelect: (timeStr: string) => handleTimeChange(timeStr),
        options: [{ id: "none", label: "No due date", icon: "inbox" as const, isSelected: !parsedItem?.date }],
        onSelect: (id: string) => handleDateChange(id === "none" ? undefined : id),
      };
    }

    if (activePicker === "time") {
      return {
        title: "Time",
        options: [],
        onSelect: () => {},
        timeValue: parsedItem?.time,
        onTimeSelect: (timeStr: string) => handleTimeChange(timeStr),
      };
    }

    if (activePicker === "reminder") {
      const offset = parsedItem?.reminderOffsetMinutes;
      return {
        title: "Reminder",
        options: [
          { id: "none", label: "None", icon: "x" as const, isSelected: offset == null },
          { id: "0", label: "At time of task", icon: "bell" as const, isSelected: offset === 0 },
          { id: "5", label: "5 min before", isSelected: offset === 5 },
          { id: "15", label: "15 min before", isSelected: offset === 15 },
          { id: "30", label: "30 min before", isSelected: offset === 30 },
          { id: "60", label: "1 hour before", isSelected: offset === 60 },
          { id: "custom", label: "Custom…", icon: "sliders" as const },
        ],
        onSelect: (id: string) => handleReminderChange(id === "none" ? undefined : Number(id)),
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
  }, [activePicker, parsedItem, selectedWorkspaceId, workspaces, morePickerOptions, handleTypeChange, handlePriorityChange, handleDateChange, handleTimeChange, handleReminderChange, handleCategoryChange, handleRecurrenceChange, handleWorkspaceChange]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const suggestedWorkspace = topSuggestion
    ? workspaces.find((w) => w.id === topSuggestion.workspaceId) ?? null
    : null;

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
        setDuplicateResult(null);
        setTopSuggestion(null);
        setAttachedFile(null);
        setClipboardUrl(null);
        cancelRecording();
      }
    },
    [cancelRecording],
  );

  // The Add button must be disabled exactly when handleSave would actually block:
  // a same-workspace exact duplicate (which offers Create anyway / Use existing)
  // or a checklist merge candidate (Create new / Add to existing). Near-duplicates
  // and cross-workspace duplicates are NOT blocked by handleSave — they only get
  // an informational notice — so Add stays enabled there.
  const blocksSave =
    duplicateResult?.isPotentialDuplicate === true &&
    (duplicateResult.relationship === "merge_candidate" ||
      ((duplicateResult.relationship === "exact_duplicate" || duplicateResult.relationship === "near_duplicate") &&
        duplicateResult.matchedEntity?.workspaceId === (selectedWorkspaceId || INBOX_WORKSPACE_ID)));

  // File-only mode: when a file is picked, the sheet shows just this card — the
  // input box, suggestions, chips and indicators are hidden so the file is the focus.
  const fileOnlyCard = attachedFile ? (
    <View style={[styles.fileOnlyCard, { backgroundColor: inputBg, borderColor }]}>
      {attachedFile.mimeType?.startsWith("image/") ? (
        <Image source={{ uri: attachedFile.uri }} style={styles.fileOnlyThumb} />
      ) : (
        <View
          style={[
            styles.fileOnlyIcon,
            { backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)" },
          ]}
        >
          <Feather name={getFileIcon(attachedFile.mimeType)} size={22} color={theme.primary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Editable name — rename the file before adding (e.g. cryptic camera names) */}
        <FileRenameInput
          key={attachedFile.id}
          ref={renameInputRef}
          initialValue={attachedFile.name}
          textColor={textPrimary}
          placeholderTextColor={textMuted}
        />
        <Text style={[styles.fileOnlyMeta, { color: textMuted }]}>
          {[formatFileSize(attachedFile.size), getFileTypeLabel(attachedFile.mimeType)].filter(Boolean).join(" · ") || "File"}
        </Text>
      </View>
      {attachedFile.mimeType?.startsWith("image/") ? (
        <TouchableOpacity
          onPress={() => handleOpenAttachment(attachedFile)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Preview attachment"
          style={styles.fileOnlyBtn}
        >
          <Feather name="eye" size={18} color={textMuted} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => handleOpenAttachment(attachedFile)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open in another app"
          style={styles.fileOnlyBtn}
        >
          <Feather name="external-link" size={18} color={textMuted} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={handleRemoveAttachedFile}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        style={styles.fileOnlyBtn}
      >
        <Feather name="x" size={18} color={textMuted} />
      </TouchableOpacity>
    </View>
  ) : null;

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.sheetHeaderTitle, { color: textPrimary }]}>Quick Capture</Text>
            <View style={[styles.aiBadge, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }]}>
              <Feather name="zap" size={9} color={theme.primary} />
              <Text style={[styles.aiBadgeText, { color: textMuted }]}>AI</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => sheetRef.current?.dismiss()}
            style={[styles.closeIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }]}
          >
            <Feather name="x" size={18} color={textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Input Layer (hidden when a file is attached so only the file shows) ── */}
        <View style={attachedFile ? styles.hidden : undefined}>
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

        {/* ── Parsing indicator (AI working in the background) ── */}
        {parsePhase !== "idle" && (
          <Animated.View entering={FadeInUp.duration(150)} exiting={FadeOut.duration(150)} style={styles.companionLoadingRow}>
            <View style={[styles.parsingPill, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}>
              <Feather name={parsePhase === "understood" ? "check" : "zap"} size={11} color={theme.primary} />
              <Text style={[styles.parsingPillText, { color: parsePhase === "understood" ? theme.primary : textMuted }]}>
                {parsePhase === "understood" ? "Understood" : "Interpreting…"}
              </Text>
            </View>
            {parsePhase === "interpreting" && (
              <View style={[styles.progressBarContainer, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" }]}>
                <Animated.View style={[styles.progressBarFill, { backgroundColor: theme.primary }, animatedProgressStyle]} />
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Clipboard URL Suggestion ── */}
        {clipboardUrl && !hasInput && (
          <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)}>
            <Pressable
              onPress={handleClipboardPaste}
              accessibilityRole="button"
              style={[styles.clipboardPrompt, { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }]}
            >
              <Feather name="link" size={13} color={textMuted} />
              <Text style={[styles.clipboardText, { color: textMuted }]} numberOfLines={1}>
                {getDomainFromUrl(clipboardUrl)}
              </Text>
              <Text style={[styles.clipboardAction, { color: theme.primary }]}>Paste</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Checklist Suggestion (medium confidence) ── */}
        {parsedItem?.type === "checklist" && parsedItem.checklistConfidence === "medium" && (
          <Animated.View
            entering={FadeInDown.duration(200)}
            style={[styles.checklistSuggestion, { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <Feather name="list" size={15} color={textMuted} />
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: textPrimary }}>
                Create this as a list?
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (parsedItem) {
                  setParsedItem({ ...parsedItem, checklistConfidence: "high", confidence: 0.85 });
                }
              }}
              accessibilityRole="button"
              style={[styles.checklistConfirmBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)" }]}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.primary }}>As list</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Capture Companion Card ── */}
        {parsedItem && parsedItem.title.trim().length > 0 && parsePhase !== "interpreting" && (
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
            onDismiss={handleDismiss}
            onSave={handleSave}
            onSaveAnyway={handleSaveAnyway}
            onUseExisting={handleUseExisting}
            onMergeChecklist={handleMergeChecklist}
            isSaving={isSaving}
          />
        )}

        {/* ── Smart Suggestions (from computed adaptive suggestions) ── */}
        {!hasInput && suggestions.length > 0 && (
          <CaptureSuggestions
            suggestions={suggestions}
            isDark={isDark}
            textPrimary={textPrimary}
            textMuted={textMuted}
            onSuggestionTap={handleSuggestionTap}
          />
        )}
        </View>

        {/* ── File-only view: just the picked file, nothing else around it ── */}
        {attachedFile && fileOnlyCard}

        {/* ── Contextual Action Bar ── */}
        <View style={[styles.contextBar, { borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}>
          <View style={styles.contextLeft}>
            <TouchableOpacity
              onPress={() => handleActivePickerChange("workspace")}
              accessibilityRole="button"
              style={[styles.contextBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
            >
              <Text numberOfLines={1} style={[styles.contextBtnText, { color: textPrimary }]}>
                {workspaces.find((w) => w.id === (selectedWorkspaceId || INBOX_WORKSPACE_ID))?.emoji || "▣"} {workspaces.find((w) => w.id === (selectedWorkspaceId || INBOX_WORKSPACE_ID))?.name || "Inbox"}
              </Text>
              <Feather name="chevron-down" size={13} color={textMuted} />
            </TouchableOpacity>

            {topSuggestion && suggestedWorkspace && topSuggestion.workspaceId !== (selectedWorkspaceId || INBOX_WORKSPACE_ID) && (
              <Pressable
                onPress={handleAcceptWorkspaceSuggestion}
                accessibilityRole="button"
                accessibilityLabel={`Use suggested workspace ${suggestedWorkspace.name}`}
                style={[styles.suggestionAccept, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
              >
                <Feather name="arrow-right" size={11} color={theme.primary} />
                <Text numberOfLines={1} style={[styles.suggestionAcceptText, { color: theme.primary }]}>
                  {suggestedWorkspace.name}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => handleSave(false)}
            accessibilityRole="button"
            disabled={isSaving || blocksSave}
            style={[
              styles.bottomSaveBtn,
              { backgroundColor: (isSaving || blocksSave) ? textMuted : theme.primary },
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.bottomSaveBtnText}>Add</Text>
            )}
          </Pressable>
        </View>
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
        closeOnSelect={pickerConfig.closeOnSelect}
        calendarDate={pickerConfig.calendarDate}
        onCalendarSelect={pickerConfig.onCalendarSelect}
        timeValue={pickerConfig.timeValue}
        onTimeSelect={pickerConfig.onTimeSelect}
      />
    )}

    {/* Full-screen in-app preview for image attachments (tapped via the eye button) */}
    {imagePreviewUri && (
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImagePreviewUri(null)}
      >
        <Pressable
          style={styles.imagePreviewBackdrop}
          onPress={() => setImagePreviewUri(null)}
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
        >
          <Image source={{ uri: imagePreviewUri }} style={styles.imagePreviewFull} resizeMode="contain" />
        </Pressable>
      </Modal>
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
  onDismiss: () => void;
  onSave: () => void;
  onSaveAnyway: () => void;
  onUseExisting: () => void;
  onMergeChecklist: () => void;
  isSaving: boolean;
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
  onDismiss,
  onSave,
  onSaveAnyway,
  onUseExisting,
  onMergeChecklist,
  isSaving,
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

  const isSameWorkspaceNearDuplicate =
    duplicateResult &&
    duplicateResult.isPotentialDuplicate &&
    duplicateResult.relationship === "near_duplicate" &&
    duplicateResult.matchedEntity?.workspaceId === (selectedWorkspaceId || INBOX_WORKSPACE_ID);

  const isCrossWorkspaceNearDuplicate =
    duplicateResult &&
    duplicateResult.isPotentialDuplicate &&
    duplicateResult.relationship === "near_duplicate" &&
    duplicateResult.matchedEntity?.workspaceId !== (selectedWorkspaceId || INBOX_WORKSPACE_ID);

  const isMergeCandidate =
    duplicateResult &&
    duplicateResult.relationship === "merge_candidate";

  const currentWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  // ─── Metadata Chips Generation (contextual — only detected/edited values, never defaults) ───
  type ChipData = {
    id: string;
    icon: React.ComponentProps<typeof Feather>["name"] | null;
    label: string;
    color: string;
    bgColor: string;
    isPriority?: boolean;
  };

  const chipBg = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)";
  const chipsMap = new Map<string, ChipData>();

  // Date/time — only when actually detected (never a default).
  if ((parsedItem.type === "task" || parsedItem.type === "checklist") && (parsedItem.date || parsedItem.time)) {
    chipsMap.set("date", {
      id: "date",
      icon: parsedItem.date ? "calendar" : "clock",
      label: formatDateTimeLabel(parsedItem.date, parsedItem.time),
      color: textPrimary,
      bgColor: chipBg,
    });
  }

  // Priority — only when explicitly expressed or edited, never the parser default.
  if (parsedItem.priorityDetected && parsedItem.priority) {
    chipsMap.set("priority", {
      id: "priority",
      icon: null,
      isPriority: true,
      label: PRIORITY_META[parsedItem.priority].label,
      color: textPrimary,
      bgColor: chipBg,
    });
  }

  if (parsedItem.recurrence) {
    chipsMap.set("recurrence", {
      id: "recurrence",
      icon: "refresh-cw",
      label: getRecurrenceLabel(parsedItem) || "Repeat",
      color: textPrimary,
      bgColor: chipBg,
    });
  }

  const reminderShort = getReminderShortLabel(parsedItem.reminderOffsetMinutes);
  if (reminderShort) {
    chipsMap.set("reminder", {
      id: "reminder",
      icon: "bell",
      label: `${reminderShort} reminder`,
      color: textPrimary,
      bgColor: chipBg,
    });
  }

  if (parsedItem.type === "checklist" && parsedItem.items && parsedItem.items.length > 0) {
    chipsMap.set("checklistItems", {
      id: "checklistItems",
      icon: "list",
      label: `${parsedItem.items.length} ${parsedItem.items.length === 1 ? "item" : "items"}`,
      color: textPrimary,
      bgColor: chipBg,
    });
  }

  const taskOrder = ["date", "priority", "reminder", "recurrence"];
  const habitOrder = ["recurrence", "reminder", "priority"];
  const checklistOrder = ["date", "checklistItems", "priority", "reminder", "recurrence"];

  let currentOrder: string[] = [];
  if (parsedItem.type === "task") currentOrder = taskOrder;
  else if (parsedItem.type === "habit") currentOrder = habitOrder;
  else if (parsedItem.type === "checklist") currentOrder = checklistOrder;
  else currentOrder = [];

  const orderedChips: ChipData[] = [];
  for (const id of currentOrder) {
    if (chipsMap.has(id)) {
      orderedChips.push(chipsMap.get(id)!);
    }
  }

  // Max 2 contextual chips (Type + attachment + 2 + "+" fit on narrow screens).
  const MAX_CHIPS = 2;
  const visibleChipsData = orderedChips.slice(0, MAX_CHIPS);

  const handleMorePress = () => {
    const options: ChipPickerOption[] = [];
    const pushField = (
      id: string,
      name: string,
      value: string | null,
      icon: React.ComponentProps<typeof Feather>["name"],
      color?: string,
    ) => {
      options.push({ id, label: name, subtitle: value || "None", icon, color, isSelected: false });
    };

    const ws = workspaces.find((w) => w.id === selectedWorkspaceId);
    pushField("workspace", "Workspace", ws ? `${ws.emoji ?? ""} ${ws.name}`.trim() || "Inbox" : "Inbox", "grid");

    const isTaskLike = parsedItem.type === "task" || parsedItem.type === "habit" || parsedItem.type === "checklist";
    const isList = parsedItem.type === "checklist";

    if (isTaskLike) {
      const categoryKey = parsedItem.category;
      const catMeta = categoryKey ? CATEGORY_META[categoryKey] : undefined;
      pushField(
        "category",
        "Category",
        categoryKey ? catMeta?.label ?? categoryKey : "None",
        catMeta?.icon ?? "tag",
        catMeta?.color,
      );
      pushField(
        "priority",
        "Priority",
        parsedItem.priority ? PRIORITY_META[parsedItem.priority].label : "None",
        "flag",
        parsedItem.priority ? PRIORITY_META[parsedItem.priority].color : undefined,
      );
      pushField("date", "Due date", parsedItem.date ? getFriendlyDateLabel(parsedItem.date) : "None", "calendar");
      pushField("time", "Time", parsedItem.time ? getFriendlyTimeLabel(parsedItem.time) : "None", "clock");
      pushField("reminder", "Reminder", getReminderLabel(parsedItem.reminderOffsetMinutes) || "None", "bell");
      pushField("recurrence", "Repeat", getRecurrenceLabel(parsedItem) || "None", "refresh-cw");
    }

    onActivePickerChange("more", options);
  };

  const visibleChips = visibleChipsData.map((chip) => {
    // The checklist item count is informational, not an interactive picker.
    if (chip.id === "checklistItems") {
      return (
        <View key={chip.id} style={[styles.chip, { backgroundColor: chip.bgColor }]}>
          <Feather name={chip.icon!} size={12} color={chip.color} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.chipText, { color: chip.color, fontWeight: "600" }]}>
            {chip.label}
          </Text>
        </View>
      );
    }
    return (
      <Pressable
        key={chip.id}
        onPress={() => onActivePickerChange(chip.id)}
        accessibilityRole="button"
        style={[styles.chip, { backgroundColor: chip.bgColor }]}
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
        ) : null}
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
      </Pressable>
    );
  });

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.summaryCard}>
      {/* ── Compact editable metadata row ── */}
      <View style={styles.chipsRow}>
        <Pressable
          onPress={() => onActivePickerChange("type")}
          accessibilityRole="button"
          accessibilityLabel="Change type"
          style={[styles.chip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)" }]}
        >
          <Feather name="check" size={12} color={TYPE_META[parsedItem.type].color} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.chipText, { color: textPrimary, fontWeight: "600" }]}>
            {TYPE_META[parsedItem.type].label}
          </Text>
        </Pressable>

        {visibleChips}

        <Pressable
          onPress={handleMorePress}
          accessibilityRole="button"
          accessibilityLabel="Show more metadata"
          style={[styles.chip, styles.moreChip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)" }]}
        >
          <Feather name="plus" size={14} color={textMuted} />
        </Pressable>
      </View>

      {/* ── What the parser understood, at a glance ── */}
      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.summaryLine, { color: textMuted }]}>
        {getParsedSummary(parsedItem)}
      </Text>

      {/* ── Checklist preview: let the user verify the parsed items at a glance ── */}
      {parsedItem.type === "checklist" && parsedItem.items && parsedItem.items.length > 0 && (
        <View style={styles.checklistPreview}>
          {parsedItem.items.slice(0, 3).map((item, i) => (
            <View key={i} style={styles.checklistPreviewRow}>
              <Feather name="circle" size={8} color={textMuted} />
              <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.checklistPreviewText, { color: textMuted }]}>
                {item}
              </Text>
            </View>
          ))}
          {parsedItem.items.length > 3 && (
            <Text style={[styles.checklistPreviewText, { color: textMuted }]}>
              {`+${parsedItem.items.length - 3} more`}
            </Text>
          )}
        </View>
      )}

      {/* ── Duplicate Notices ── */}
      {(isSameWorkspaceExactDuplicate || isSameWorkspaceNearDuplicate) && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[styles.noticeRow, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)" }]}
        >
          <Feather name="clipboard" size={15} color={textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: textPrimary }}>
              Similar item found
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>
              {duplicateResult?.matchedEntity?.title}
            </Text>
          </View>
        </Animated.View>
      )}

      {(isCrossWorkspaceExactDuplicate || isCrossWorkspaceNearDuplicate) && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[styles.noticeRow, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)" }]}
        >
          <Feather name="info" size={15} color={textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: textPrimary }}>
              Already in another workspace
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>
              {duplicateResult?.matchedEntity?.title}
            </Text>
          </View>
        </Animated.View>
      )}

      {isMergeCandidate && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[styles.noticeRow, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)" }]}
        >
          <Feather name="layers" size={15} color={textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: textPrimary }}>
              Update existing list?
            </Text>
            {duplicateResult?.newItems && (
              <Text numberOfLines={1} style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>
                Add {duplicateResult.newItems.join(", ")}
              </Text>
            )}
          </View>
        </Animated.View>
      )}
      {/* ── Action Buttons (Only for Duplicates) ── */}
      {(isMergeCandidate || isSameWorkspaceExactDuplicate || isSameWorkspaceNearDuplicate) && (
        <View style={{ gap: 12, marginTop: 16, flexDirection: "row", justifyContent: "flex-end" }}>
          {isMergeCandidate && (
            <>
              <TouchableOpacity onPress={onSaveAnyway} style={[styles.secondaryActionBtn, { paddingHorizontal: 16 }]}>
                <Text style={[styles.secondaryActionBtnText, { color: textPrimary }]}>Create new</Text>
              </TouchableOpacity>
              <PressableScale
                onPress={onMergeChecklist}
                disabled={isSaving}
                scaleTo={isSaving ? 1 : 0.97}
                style={[styles.primaryActionBtn, { backgroundColor: isSaving ? textMuted : themePrimary, paddingHorizontal: 20, paddingVertical: 12 }]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.primaryActionBtnText, { fontSize: 14 }]}>Add to existing</Text>
                )}
              </PressableScale>
            </>
          )}

          {(isSameWorkspaceExactDuplicate || isSameWorkspaceNearDuplicate) && (
            <>
              <TouchableOpacity onPress={onSaveAnyway} style={[styles.secondaryActionBtn, { paddingHorizontal: 16 }]}>
                <Text style={[styles.secondaryActionBtnText, { color: textPrimary }]}>Create anyway</Text>
              </TouchableOpacity>
              <PressableScale
                onPress={onUseExisting}
                disabled={isSaving}
                scaleTo={isSaving ? 1 : 0.97}
                style={[styles.primaryActionBtn, { backgroundColor: isSaving ? textMuted : themePrimary, paddingHorizontal: 20, paddingVertical: 12 }]}
              >
                <Text style={[styles.primaryActionBtnText, { fontSize: 14 }]}>Use existing</Text>
              </PressableScale>
            </>
          )}
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
  onSuggestionTap: (text: string) => void;
}

const CaptureSuggestions = React.memo(function CaptureSuggestions({
  suggestions,
  isDark,
  textPrimary,
  textMuted,
  onSuggestionTap,
}: CaptureSuggestionsProps) {
  return (
    <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOut.duration(150)} style={styles.suggestionsContainer}>
      {/* 2×2 grid — no horizontal scroll, so it never fights the sheet's vertical gesture on Android */}
      <View style={styles.suggestionsRow}>
        {suggestions.slice(0, 4).map((text, i) => (
          <Pressable
            key={i}
            onPress={() => onSuggestionTap(text)}
            accessibilityRole="button"
            style={[styles.suggestionChip, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.02)" }]}
          >
            <Feather name="zap" size={11} color={textMuted} />
            <Text numberOfLines={1} style={[styles.suggestionChipText, { color: textPrimary }]}>
              {text.length > 24 ? `${text.slice(0, 24)}…` : text}
            </Text>
          </Pressable>
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
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
  // Parsing progress
  companionLoadingRow: {
    marginBottom: 12,
    gap: 8,
  },
  parsingPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  parsingPillText: {
    fontSize: 12,
    fontWeight: "500",
  },
  progressBarContainer: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  // Suggestions (2×2 grid)
  suggestionsContainer: {
    marginTop: 4,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexGrow: 1,
    flexBasis: "46%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  // Clipboard
  clipboardPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  clipboardText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
    minWidth: 0,
  },
  clipboardAction: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Checklist suggestion
  checklistSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  checklistConfirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  // Summary card
  summaryCard: {
    marginTop: 4,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
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
  moreChip: {
    justifyContent: "center",
    minWidth: 34,
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
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  summaryLine: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.1,
    marginTop: 8,
  },
  checklistPreview: {
    gap: 4,
    marginTop: 10,
    paddingLeft: 2,
  },
  checklistPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checklistPreviewText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  hidden: {
    display: "none",
  },
  fileOnlyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 16,
  },
  fileOnlyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fileOnlyThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  fileOnlyNameInput: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    padding: 0,
    margin: 0,
  },
  fileOnlyMeta: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.1,
    marginTop: 3,
  },
  fileOnlyBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePreviewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePreviewFull: {
    width: "100%",
    height: "82%",
  },
  // Duplicate action buttons
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryActionBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  secondaryActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryActionBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  contextBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
  },
  contextLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  contextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexShrink: 1,
  },
  contextBtnText: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    maxWidth: 140,
  },
  suggestionAccept: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  suggestionAcceptText: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  bottomSaveBtn: {
    minWidth: 76,
    minHeight: 44,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  bottomSaveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  }
});
