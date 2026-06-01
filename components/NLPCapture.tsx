import React, { useState, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { Spacing } from "@/constants/spacing";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { parseProductivityText, type ParsedProductivityItem } from "@/services/nlpParser";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { VoiceCaptureButton } from "@/components/VoiceCaptureButton";
import {
  getWorkspaceSuggestions,
  addWorkspaceSelectionToHistory,
  type WorkspaceSuggestionResult,
} from "@/services/workspaceSuggestions";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface NLPCaptureProps {
  visible: boolean;
  onClose: () => void;
  onSave: (item: ParsedProductivityItem, targetWorkspaceId?: string) => void;
  workspaces: { id: string; name: string; emoji?: string; color?: string }[];
  currentWorkspaceId: string;
  onCreateWorkspace?: (name: string) => string;
  todos: Record<string, { title: string; category?: string }[]>;
}

const CATEGORY_META = {
  work: { label: "Work", color: "#3B82F6", icon: "briefcase" as const },
  personal: { label: "Personal", color: "#10B981", icon: "user" as const },
  health: { label: "Health", color: "#F59E0B", icon: "activity" as const },
  learning: { label: "Learning", color: "#A855F7", icon: "book-open" as const },
  creative: { label: "Creative", color: "#EC4899", icon: "feather" as const },
  focus: { label: "Focus", color: "#6366F1", icon: "target" as const },
};

const PRIORITY_META = {
  high: { label: "High", color: "#EF4444", icon: "flag" as const },
  medium: { label: "Medium", color: "#F59E0B", icon: "flag" as const },
  low: { label: "Low", color: "#10B981", icon: "flag" as const },
};

export default function NLPCapture({
  visible,
  onClose,
  onSave,
  workspaces = [],
  currentWorkspaceId = "default",
  onCreateWorkspace,
  todos = {},
}: NLPCaptureProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "dark"];

  const [inputText, setInputText] = useState("");
  const [parsedItem, setParsedItem] = useState<ParsedProductivityItem | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Workspace Selection State
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(currentWorkspaceId);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  
  // Workspace Suggestions State
  const [topSuggestion, setTopSuggestion] = useState<WorkspaceSuggestionResult | null>(null);

  // Voice Capture Hook Integration
  const {
    status: voiceStatus,
    transcript: voiceTranscript,
    volume: voiceVolume,
    errorMsg: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceCapture({
    onTranscriptComplete: (finalText) => {
      setInputText(finalText);
    },
    onTranscriptChange: (interimText) => {
      setInputText(interimText);
    },
  });

  useEffect(() => {
    if (visible) {
      setSelectedWorkspaceId(currentWorkspaceId);
      setIsCreatingWorkspace(false);
      setNewWorkspaceName("");
      setTopSuggestion(null);
    } else {
      cancelRecording();
    }
  }, [visible, currentWorkspaceId]);

  // Live Suggestions Calculation and Smart Defaults
  useEffect(() => {
    if (!parsedItem || parsedItem.type !== "task") {
      setTopSuggestion(null);
      return;
    }

    const fetchSuggestions = async () => {
      const results = await getWorkspaceSuggestions(
        parsedItem.title,
        parsedItem.category || "work",
        workspaces,
        todos
      );
      
      const top = results[0];
      // Rule 5: Auto-select highest scored workspace if no active workspace is open
      if (top && top.score >= 35) {
        setTopSuggestion(top);
        if (currentWorkspaceId === "default") {
          setSelectedWorkspaceId(top.workspaceId);
        }
      } else {
        setTopSuggestion(null);
        if (currentWorkspaceId === "default") {
          setSelectedWorkspaceId("default");
        }
      }
    };

    fetchSuggestions();
  }, [parsedItem, workspaces, todos, currentWorkspaceId]);

  const handleSaveNewWorkspace = () => {
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) return;
    
    if (onCreateWorkspace) {
      const newId = onCreateWorkspace(trimmed);
      setSelectedWorkspaceId(newId);
    }
    setIsCreatingWorkspace(false);
    setNewWorkspaceName("");
  };

  // Rotating Placeholders
  const PLACEHOLDERS = [
    "Finish assignment tomorrow 7pm",
    "Gym every morning",
    "Call mom on Friday",
    "Focus session for 45 mins",
    "Study React next Monday high priority and remind me 30 mins before",
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [visible]);

  // Animations
  const cardScale = useSharedValue(0.9);
  const workspaceScale = useSharedValue(1);

  const animatedWorkspaceStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: workspaceScale.value }],
    };
  });

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 15 });
      setInputText("");
      setParsedItem(null);
    } else {
      cardScale.value = 0.9;
    }
  }, [visible]);

  // Live Parsing logic as the user types
  useEffect(() => {
    if (inputText.trim() === "") {
      setParsedItem(null);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      handleParse(false);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [inputText]);

  const handleParse = (triggerHaptic = true) => {
    if (inputText.trim() === "") return;

    if (triggerHaptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    setIsParsing(true);
    const parsed = parseProductivityText(inputText);
    setParsedItem(parsed);
    setIsParsing(false);
  };

  const handleConfirm = () => {
    if (!parsedItem) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    if (parsedItem.type === "task") {
      const finalWorkspaceId = selectedWorkspaceId || "default";
      addWorkspaceSelectionToHistory(
        parsedItem.title,
        parsedItem.category || "work",
        finalWorkspaceId
      ).catch(() => {});
    }

    onSave(parsedItem, parsedItem.type === "task" ? selectedWorkspaceId : undefined);
    onClose();
  };

  // Heuristic Cycle on Tap adjustments
  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const cycleCategory = () => {
    if (!parsedItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const categories: ("work" | "personal" | "health" | "learning" | "creative" | "focus")[] = 
      ["work", "personal", "health", "learning", "creative", "focus"];
    const current = parsedItem.category || "work";
    const nextIndex = (categories.indexOf(current) + 1) % categories.length;
    setParsedItem({ ...parsedItem, category: categories[nextIndex] });
  };

  const cyclePriority = () => {
    if (!parsedItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const priorities: ("high" | "medium" | "low")[] = ["high", "medium", "low"];
    const current = parsedItem.priority || "medium";
    const nextIndex = (priorities.indexOf(current) + 1) % priorities.length;
    setParsedItem({ ...parsedItem, priority: priorities[nextIndex] });
  };

  const cycleDate = () => {
    if (!parsedItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    const dates = [formatDate(today), formatDate(tomorrow), formatDate(nextWeek), "inbox"];
    const current = parsedItem.date || formatDate(today);
    let nextIndex = dates.indexOf(current);
    if (nextIndex === -1) nextIndex = 0;
    nextIndex = (nextIndex + 1) % dates.length;
    setParsedItem({ ...parsedItem, date: dates[nextIndex] });
  };

  const cycleTime = () => {
    if (!parsedItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const times = ["none", "08:00", "12:00", "15:00", "18:00", "20:00", "22:00"];
    const current = parsedItem.time || "none";
    let nextIndex = times.indexOf(current);
    if (nextIndex === -1) nextIndex = 0;
    nextIndex = (nextIndex + 1) % times.length;
    setParsedItem({ ...parsedItem, time: times[nextIndex] === "none" ? undefined : times[nextIndex] });
  };

  const cycleWorkspace = () => {
    if (workspaces.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    workspaceScale.value = 0.95;
    workspaceScale.value = withSpring(1, { damping: 10, stiffness: 250 });

    const index = workspaces.findIndex(w => w.id === selectedWorkspaceId);
    let nextIndex = index === -1 ? 0 : (index + 1) % workspaces.length;
    setSelectedWorkspaceId(workspaces[nextIndex].id);
  };

  const getFriendlyDateLabel = (dateStr?: string) => {
    if (!dateStr) return "No Date";
    if (dateStr === "inbox") return "Inbox";
    
    const today = new Date();
    const todayStr = formatDate(today);
    
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);
    
    if (dateStr === todayStr) return "Today";
    if (dateStr === tomorrowStr) return "Tomorrow";
    
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getFriendlyTimeLabel = (timeStr?: string) => {
    if (!timeStr) return "Anytime";
    try {
      const [h, m] = timeStr.split(":").map(Number);
      const isPm = h >= 12;
      const displayHour = h % 12 || 12;
      const displayMin = String(m).padStart(2, "0");
      return `${displayHour}:${displayMin} ${isPm ? "PM" : "AM"}`;
    } catch {
      return timeStr;
    }
  };

  const animatedCardStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: cardScale.value }],
    };
  });

  const containerBg = isDark ? "rgba(9, 9, 11, 0.85)" : "rgba(248, 250, 252, 0.85)";
  const cardBg = isDark ? "rgba(24, 24, 27, 0.75)" : "rgba(255, 255, 255, 0.85)";
  const inputBg = isDark ? "rgba(9, 9, 11, 0.6)" : "rgba(241, 245, 249, 0.8)";
  const borderColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)";
  const textPrimary = isDark ? "#FFFFFF" : "#0F172A";
  const textMuted = isDark ? "#94A3B8" : "#64748B";

  // Dynamic premium soft shadows for light/dark scheme
  const inputShadow = Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.15 : 0.03,
      shadowRadius: 8,
    },
    android: {
      elevation: isDark ? 3 : 1,
    },
    web: {
      boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.25)" : "0 4px 12px rgba(0,0,0,0.02)",
    }
  }) as any;

  const cardShadow = Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 18,
    },
    android: {
      elevation: isDark ? 6 : 2,
    },
    web: {
      boxShadow: isDark ? "0 12px 30px rgba(0,0,0,0.3)" : "0 12px 30px rgba(0,0,0,0.04)",
    }
  }) as any;

  const buttonShadow = Platform.select({
    ios: {
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.12,
      shadowRadius: 8,
    },
    android: {
      elevation: 2,
    },
    web: {
      boxShadow: isDark ? `0 4px 12px ${theme.primary}40` : `0 4px 12px ${theme.primary}20`,
    }
  }) as any;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <BlurView
          intensity={35}
          tint={isDark ? "dark" : "light"}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: containerBg }]}
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={[styles.title, { color: textPrimary }]}>Pebble Capture</Text>
                <Text style={[styles.subtitle, { color: textMuted }]}>Turn thoughts into action</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}
              >
                <Feather name="x" size={20} color={textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Input Row */}
            <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor }, inputShadow]}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder={voiceStatus === "listening" ? "Listening..." : PLACEHOLDERS[placeholderIndex]}
                placeholderTextColor={textMuted}
                multiline
                numberOfLines={3}
                autoFocus={voiceStatus !== "listening"}
                style={[styles.textInput, { color: textPrimary }]}
              />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-end" }}>
                {inputText.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setInputText("")}
                    style={styles.clearInputBtn}
                  >
                    <Feather name="x-circle" size={16} color={textMuted} />
                  </TouchableOpacity>
                )}
                <VoiceCaptureButton
                  status={voiceStatus}
                  volume={voiceVolume}
                  onStart={startRecording}
                  onStop={stopRecording}
                  onCancel={cancelRecording}
                  themePrimary={theme.primary}
                />
              </View>
            </View>

            {voiceError ? (
              <Animated.View entering={FadeInDown} style={styles.voiceErrorContainer}>
                <Feather name="alert-circle" size={13} color="#EF4444" />
                <Text style={styles.voiceErrorText}>{voiceError}</Text>
              </Animated.View>
            ) : null}

            {/* Smart Suggestions helper text */}
            {inputText.length === 0 && (
              <Animated.View entering={FadeInUp} style={styles.suggestionsContainer}>
                <Text style={[styles.suggestionTitle, { color: textMuted }]}>Try typing:</Text>
                <TouchableOpacity onPress={() => setInputText("Gym every morning at 7am")}>
                  <Text style={[styles.suggestionText, { color: theme.primary }]}>
                    ✨ {"\"Gym every morning at 7am\""}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setInputText("Study Kubernetes tomorrow at 8pm high priority")}>
                  <Text style={[styles.suggestionText, { color: theme.primary }]}>
                    ✨ {"\"Study Kubernetes tomorrow at 8pm high priority\""}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setInputText("Submit SaaS project urgently today")}>
                  <Text style={[styles.suggestionText, { color: theme.primary }]}>
                    ✨ {"\"Submit SaaS project urgently today\""}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Preview Card */}
            {parsedItem && (
              <Animated.View
                layout={Layout.springify()}
                style={[
                  styles.previewCard,
                  animatedCardStyle,
                  { backgroundColor: cardBg, borderColor },
                  cardShadow,
                ]}
              >
                {/* Header of Preview Card */}
                <View style={styles.previewHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor:
                            parsedItem.type === "habit"
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(59, 130, 246, 0.15)",
                        },
                      ]}
                    >
                      <Feather
                        name={parsedItem.type === "habit" ? "activity" : "check-square"}
                        size={12}
                        color={parsedItem.type === "habit" ? "#F59E0B" : "#3B82F6"}
                      />
                      <Text
                        style={[
                          styles.typeBadgeText,
                          { color: parsedItem.type === "habit" ? "#F59E0B" : "#3B82F6" },
                        ]}
                      >
                        {parsedItem.type === "habit" ? "Habit" : "Task"}
                      </Text>
                    </View>
                    {parsedItem.recurrence && (
                      <View style={[styles.typeBadge, { backgroundColor: "rgba(168, 85, 247, 0.15)" }]}>
                        <Feather name="refresh-cw" size={10} color="#A855F7" />
                        <Text style={[styles.typeBadgeText, { color: "#A855F7" }]}>
                          {parsedItem.recurrence}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Detection Status Badge */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: parsedItem.confidence >= 0.7 ? "rgba(99, 102, 241, 0.12)" : "rgba(100, 116, 139, 0.1)",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                      gap: 4,
                    }}
                  >
                    <Feather
                      name={parsedItem.confidence >= 0.7 ? "zap" : "edit-3"}
                      size={11}
                      color={parsedItem.confidence >= 0.7 ? "#6366F1" : textMuted}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: parsedItem.confidence >= 0.7 ? "#6366F1" : textMuted,
                      }}
                    >
                      {parsedItem.confidence >= 0.7 ? "✨ Smartly detected" : "📝 Draft schedule"}
                    </Text>
                  </View>
                </View>

                {/* Title */}
                <Text style={[styles.previewTitle, { color: textPrimary }]}>{parsedItem.title}</Text>

                {/* Attributes Grid */}
                <View style={styles.attributesGrid}>
                  {/* Category Pill */}
                  <TouchableOpacity onPress={cycleCategory} style={styles.attributeItem} activeOpacity={0.78}>
                    <Feather
                      name={parsedItem.category ? CATEGORY_META[parsedItem.category].icon : "grid"}
                      size={14}
                      color={parsedItem.category ? CATEGORY_META[parsedItem.category].color : textMuted}
                    />
                    <Text style={[styles.attributeText, { color: textPrimary }]}>
                      Category: {parsedItem.category ? CATEGORY_META[parsedItem.category].label : "None"} 🏷️
                    </Text>
                  </TouchableOpacity>

                  {/* Priority Pill */}
                  <TouchableOpacity onPress={cyclePriority} style={styles.attributeItem} activeOpacity={0.78}>
                    <Feather
                      name={parsedItem.priority ? PRIORITY_META[parsedItem.priority].icon : "flag"}
                      size={14}
                      color={parsedItem.priority ? PRIORITY_META[parsedItem.priority].color : textMuted}
                    />
                    <Text style={[styles.attributeText, { color: textPrimary }]}>
                      Priority: {parsedItem.priority ? PRIORITY_META[parsedItem.priority].label : "Medium"} ⚡
                    </Text>
                  </TouchableOpacity>

                  {/* Date Pill */}
                  <TouchableOpacity onPress={cycleDate} style={styles.attributeItem} activeOpacity={0.78}>
                    <Feather name="calendar" size={14} color={theme.primary} />
                    <Text style={[styles.attributeText, { color: textPrimary }]}>
                      Date: {getFriendlyDateLabel(parsedItem.date)} 📅
                    </Text>
                  </TouchableOpacity>

                  {/* Time Pill */}
                  <TouchableOpacity onPress={cycleTime} style={styles.attributeItem} activeOpacity={0.78}>
                    <Feather name="clock" size={14} color="#6366F1" />
                    <Text style={[styles.attributeText, { color: textPrimary }]}>
                      Time: {getFriendlyTimeLabel(parsedItem.time)} ⏰
                    </Text>
                  </TouchableOpacity>

                  {/* Reminder Pill */}
                  {parsedItem.reminderOffsetMinutes && (
                    <View style={styles.attributeItem}>
                      <Feather name="bell" size={14} color="#A855F7" />
                      <Text style={[styles.attributeText, { color: textPrimary }]}>
                        Reminder: {parsedItem.reminderOffsetMinutes}m before 🔔
                      </Text>
                    </View>
                  )}
                  {/* Workspace Selector */}
                {parsedItem.type === "task" && workspaces.length > 0 && (
                  <View style={styles.workspaceSelectorContainer}>
                    <Text style={[styles.workspaceLabel, { color: textMuted }]}>📂 Workspace</Text>
                    
                    {!isCreatingWorkspace ? (
                      <View style={{ gap: 8 }}>
                        <Animated.View style={animatedWorkspaceStyle}>
                          <TouchableOpacity
                            onPress={cycleWorkspace}
                            style={[styles.workspacePill, { borderColor }]}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.workspacePillText, { color: textPrimary }]}>
                              {(() => {
                                const currentWs = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0];
                                return `${currentWs?.emoji || "📂"} ${currentWs?.name || "My Pebbles"}`;
                              })()}
                            </Text>
                            <Feather name="chevron-down" size={14} color={textMuted} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        </Animated.View>
                        
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                              setIsCreatingWorkspace(true);
                              setNewWorkspaceName("");
                            }}
                            style={styles.createWorkspaceBtn}
                            activeOpacity={0.7}
                          >
                            <Feather name="plus" size={12} color={theme.primary} />
                            <Text style={[styles.createWorkspaceBtnText, { color: theme.primary }]}>
                              Create New Workspace
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <Animated.View entering={FadeInDown.duration(200)} style={[styles.createWorkspaceInlineInputContainer, { borderColor }]}>
                        <TextInput
                          value={newWorkspaceName}
                          onChangeText={setNewWorkspaceName}
                          placeholder="Workspace Name..."
                          placeholderTextColor={textMuted}
                          style={[styles.createWorkspaceInlineInput, { color: textPrimary }]}
                          autoFocus
                          onSubmitEditing={handleSaveNewWorkspace}
                        />
                        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                          <TouchableOpacity
                            onPress={handleSaveNewWorkspace}
                            disabled={!newWorkspaceName.trim()}
                            style={[styles.inlineActionBtn, { opacity: newWorkspaceName.trim() ? 1 : 0.5 }]}
                          >
                            <Feather name="check" size={16} color={theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                              setIsCreatingWorkspace(false);
                            }}
                            style={styles.inlineActionBtn}
                          >
                            <Feather name="x" size={16} color={textMuted} />
                          </TouchableOpacity>
                        </View>
                      </Animated.View>
                    )}

                    {/* Workspace Suggestions Block (Rule 3, 4) */}
                    <View style={styles.suggestionSectionContainer}>
                      <Text style={[styles.workspaceLabel, { color: textMuted, marginTop: 4 }]}>
                        Suggested Workspace
                      </Text>
                      {topSuggestion ? (() => {
                        const suggestedWs = workspaces.find(w => w.id === topSuggestion.workspaceId);
                        const isSelected = selectedWorkspaceId === topSuggestion.workspaceId;
                        return (
                          <TouchableOpacity
                            onPress={() => {
                              if (isSelected) return;
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                              
                              workspaceScale.value = 0.95;
                              workspaceScale.value = withSpring(1, { damping: 10, stiffness: 250 });
                              
                              setSelectedWorkspaceId(topSuggestion.workspaceId);
                            }}
                            style={[
                              styles.suggestionPill,
                              {
                                borderColor: isSelected ? theme.primary : borderColor,
                                backgroundColor: isSelected ? "rgba(99, 102, 241, 0.08)" : "rgba(100, 116, 139, 0.04)"
                              }
                            ]}
                            activeOpacity={0.78}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{ fontSize: 16 }}>⭐</Text>
                              <Text style={[styles.suggestionPillText, { color: textPrimary, fontWeight: isSelected ? "700" : "600" }]}>
                                {suggestedWs?.name || "My Pebbles"}
                              </Text>
                            </View>
                            
                            <View style={[
                              styles.confidenceBadge,
                              {
                                backgroundColor:
                                  topSuggestion.confidence === "High Match"
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : topSuggestion.confidence === "Medium Match"
                                    ? "rgba(245, 158, 11, 0.12)"
                                    : "rgba(100, 116, 139, 0.1)"
                              }
                            ]}>
                              <Text style={[
                                styles.confidenceBadgeText,
                                {
                                  color:
                                    topSuggestion.confidence === "High Match"
                                      ? "#10B981"
                                      : topSuggestion.confidence === "Medium Match"
                                      ? "#F59E0B"
                                      : textMuted
                                }
                              ]}>
                                {topSuggestion.confidence}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })() : (
                        <View style={[styles.suggestionPill, { borderColor, backgroundColor: "rgba(100, 116, 139, 0.02)", justifyContent: "center", paddingVertical: 10 }]}>
                          <Text style={{ fontSize: 13, color: textMuted, fontStyle: "italic" }}>
                            💡 Learning your workspace patterns
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
                </View>

                {/* Visual Feedback Badge */}
                {parsedItem.type === "task" && (
                  <View style={styles.destinationBadge}>
                    <Text style={[styles.destinationBadgeText, { color: textMuted }]}>
                      Saving to {workspaces.find(w => w.id === selectedWorkspaceId)?.name || "My Pebbles"}
                    </Text>
                  </View>
                )}

                {/* Save Confirmation Button */}
                <TouchableOpacity
                  onPress={handleConfirm}
                  style={[styles.saveBtn, { backgroundColor: theme.primary }, buttonShadow]}
                  activeOpacity={0.88}
                >
                  <Feather name="plus-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>
                    {parsedItem.type === "task" ? "Add to Workspace" : "Add Habit"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 64 : 40,
    paddingBottom: 40,
    flex: 1,
    justifyContent: "flex-start",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  inputContainer: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    padding: 0,
    textAlignVertical: "top",
    minHeight: 60,
  },
  clearInputBtn: {
    padding: 4,
    marginLeft: 8,
  },
  suggestionsContainer: {
    gap: 10,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewCard: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 20,
    gap: 16,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  confidenceContainer: {
    alignItems: "flex-end",
    gap: 4,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: "700",
  },
  confidenceTrack: {
    width: 60,
    height: 4,
    backgroundColor: "rgba(100, 116, 139, 0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  confidenceFill: {
    height: "100%",
    borderRadius: 2,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  attributesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginVertical: 4,
  },
  attributeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(100, 116, 139, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.06)",
  },
  attributeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  workspaceSelectorContainer: {
    marginVertical: 4,
    gap: 8,
  },
  workspaceLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  workspacePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(100, 116, 139, 0.08)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.15)",
  },
  workspacePillText: {
    fontSize: 15,
    fontWeight: "600",
  },
  destinationBadge: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: -4,
    opacity: 0.75,
  },
  destinationBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  createWorkspaceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignSelf: "flex-start",
  },
  createWorkspaceBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  createWorkspaceInlineInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(100, 116, 139, 0.05)",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createWorkspaceInlineInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    padding: 0,
  },
  inlineActionBtn: {
    padding: 6,
  },
  futureSuggestionText: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    opacity: 0.65,
    marginTop: -2,
    paddingHorizontal: 2,
  },
  suggestionSectionContainer: {
    marginVertical: 4,
    gap: 8,
  },
  suggestionPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestionPillText: {
    fontSize: 14,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  voiceErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: -8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.15)",
  },
  voiceErrorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },
});
