/**
 * MetadataChipPicker.tsx
 * ───────────────────────
 * Lightweight, centered contextual modal picker for Quick Capture metadata chips.
 * Supports Type, Priority, Date, Category, Recurrence, and Workspace options.
 */

import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import PressableScale from "@/shared/components/ui/PressableScale";

export interface ChipPickerOption {
  id: string;
  label: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  color?: string;
  subtitle?: string;
  isSelected?: boolean;
}

export interface MetadataChipPickerProps {
  visible: boolean;
  title: string;
  options: ChipPickerOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  isDark?: boolean;
}

export function MetadataChipPicker({
  visible,
  title,
  options,
  onSelect,
  onClose,
  isDark = true,
}: MetadataChipPickerProps) {
  if (!visible) return null;

  const bgCard = isDark ? "#1E1E24" : "#FFFFFF";
  const textPrimary = isDark ? "#F3F4F6" : "#111827";
  const textMuted = isDark ? "#9CA3AF" : "#6B7280";
  const borderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)";

  const handleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelect(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(100)}
          style={styles.backdrop}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.modalCard,
                {
                  backgroundColor: bgCard,
                  borderColor,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color={textMuted} />
                </TouchableOpacity>
              </View>

              {/* Options List */}
              <ScrollView
                style={styles.scrollList}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {options.map((opt) => {
                  const activeColor = opt.color || (isDark ? "#818CF8" : "#4F46E5");
                  return (
                    <PressableScale
                      key={opt.id}
                      onPress={() => handleSelect(opt.id)}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected: opt.isSelected }}
                      scaleTo={0.97}
                      style={[
                        styles.optionRow,
                        {
                          backgroundColor: isDark
                            ? "rgba(255, 255, 255, 0.02)"
                            : "rgba(0, 0, 0, 0.01)",
                          borderColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)",
                        },
                      ]}
                    >
                      <View style={styles.optionLeft}>
                        {opt.icon && (
                          <View
                            style={[
                              styles.iconContainer,
                              {
                                backgroundColor: opt.color ? `${opt.color}18` : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)"),
                              },
                            ]}
                          >
                            <Feather name={opt.icon} size={14} color={opt.color || (opt.isSelected ? activeColor : textMuted)} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} ellipsizeMode="tail"
                            style={[
                              styles.optionLabel,
                              {
                                color: textPrimary,
                                fontWeight: opt.isSelected ? "700" : "500",
                              },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          {opt.subtitle && (
                            <Text style={[styles.optionSubtitle, { color: textMuted }]}>
                              {opt.subtitle}
                            </Text>
                          )}
                        </View>
                      </View>

                      {opt.isSelected && (
                        <Feather name="check" size={16} color={textPrimary} />
                      )}
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    maxHeight: 400,
    borderRadius: 20,
    borderWidth: 1.2,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(150, 150, 150, 0.15)",
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  scrollList: {
    maxHeight: 280,
  },
  scrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    maxWidth: 240,
    fontSize: 14,
  },
  optionSubtitle: {
    fontSize: 10,
    marginTop: 1,
  },
});
