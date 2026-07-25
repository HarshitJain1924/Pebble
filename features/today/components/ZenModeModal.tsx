import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Animated from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AnimatedCheckbox } from "@/shared/components/ui/AnimatedCheckbox";
import { type Habit, type Task, type Workspace } from "@/shared/types/domain.types";

export interface ZenModeModalProps {
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark";
  colors: {
    card: string;
    border: string;
    text: string;
    textMuted: string;
    primary: string;
  };
  breathStyle: any;
  activeZenTask: Task | null;
  activeZenHabit: Habit | null;
  getFolderById: (id: string) => Workspace | null;
  onCompleteTask: (taskId: string, checked: boolean) => Promise<void>;
  onCompleteHabit: (habitId: string, checked: boolean) => Promise<void>;
}

export const ZenModeModal: React.FC<ZenModeModalProps> = ({
  visible,
  onClose,
  colorScheme,
  colors,
  breathStyle,
  activeZenTask,
  activeZenHabit,
  getFolderById,
  onCompleteTask,
  onCompleteHabit,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <BlurView
          intensity={colorScheme === "light" ? 70 : 90}
          style={StyleSheet.absoluteFill}
          tint={colorScheme === "light" ? "light" : "dark"}
        />
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          {/* Top Exit Button */}
          <View style={{ position: "absolute", top: 50, right: 24 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                onClose();
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: colors.border,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Feather name="x" size={22} color={colors.text} />
            </Pressable>
          </View>

          {/* Breathing Wave Backdrop */}
          <Animated.View
            style={[
              {
                width: 280,
                height: 280,
                borderRadius: 140,
                backgroundColor:
                  colorScheme === "light"
                    ? "rgba(99, 102, 241, 0.06)"
                    : "rgba(99, 102, 241, 0.1)",
                position: "absolute",
                alignSelf: "center",
                zIndex: -1,
              },
              breathStyle,
            ]}
          />

          {/* Content Area */}
          {(() => {
            if (activeZenTask) {
              const folder = activeZenTask.workspaceId || (activeZenTask as any).folderId
                ? getFolderById((activeZenTask.workspaceId || (activeZenTask as any).folderId)!)
                : null;
              return (
                <View
                  style={{ alignItems: "center", gap: 24, width: "100%" }}
                >
                  <View style={{ alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 18 }}>🧘</Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: colors.primary,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        textAlign: "center",
                      }}
                    >
                      {folder
                        ? `${folder.emoji} ${folder.name}`
                        : "FOCUS PEBBLE"}
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: "900",
                      color: colors.text,
                      textAlign: "center",
                      lineHeight: 36,
                      marginHorizontal: 16,
                    }}
                  >
                    {activeZenTask.title}
                  </Text>

                  <View
                    style={{ marginTop: 32, alignItems: "center", gap: 10 }}
                  >
                    <AnimatedCheckbox
                      checked={false}
                      onToggle={async (e) => {
                        await onCompleteTask(activeZenTask.id, e);
                        setTimeout(() => {
                          onClose();
                        }, 350);
                      }}
                      size={64}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: colors.textMuted,
                        marginTop: 4,
                      }}
                    >
                      Tap to complete and drop pebble
                    </Text>
                  </View>
                </View>
              );
            } else if (activeZenHabit) {
              const folder = activeZenHabit.workspaceId || (activeZenHabit as any).folderId
                ? getFolderById((activeZenHabit.workspaceId || (activeZenHabit as any).folderId)!)
                : null;
              return (
                <View
                  style={{ alignItems: "center", gap: 24, width: "100%" }}
                >
                  <View style={{ alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 18 }}>⚡</Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: "#F59E0B",
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        textAlign: "center",
                      }}
                    >
                      {folder
                        ? `${folder.emoji} ${folder.name} • HABIT`
                        : "FOCUS HABIT"}
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: "900",
                      color: colors.text,
                      textAlign: "center",
                      lineHeight: 36,
                      marginHorizontal: 16,
                    }}
                  >
                    {activeZenHabit.title}
                  </Text>

                  {activeZenHabit.streak > 0 && (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#F59E0B",
                        marginTop: -12,
                      }}
                    >
                      🔥 {activeZenHabit.streak} Day Streak
                    </Text>
                  )}

                  <View
                    style={{ marginTop: 32, alignItems: "center", gap: 10 }}
                  >
                    <AnimatedCheckbox
                      checked={false}
                      onToggle={async (e) => {
                        await onCompleteHabit(activeZenHabit.id, e);
                        setTimeout(() => {
                          onClose();
                        }, 350);
                      }}
                      size={64}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: colors.textMuted,
                        marginTop: 4,
                      }}
                    >
                      Tap to complete and drop pebble
                    </Text>
                  </View>
                </View>
              );
            }

            return (
              <View style={{ alignItems: "center", gap: 12 }}>
                <Text style={{ fontSize: 32 }}>✨</Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: colors.text,
                    textAlign: "center",
                  }}
                >
                  Clear mind, quiet jar.
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textMuted,
                    textAlign: "center",
                    marginHorizontal: 24,
                    lineHeight: 18,
                  }}
                >
                  All tasks and habits completed for today. Take a moment to
                  enjoy the stillness.
                </Text>
              </View>
            );
          })()}
        </View>
      </View>
    </Modal>
  );
};
