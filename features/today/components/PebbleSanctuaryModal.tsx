import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { InteractivePebbleJar } from "@/features/profile/components/InteractivePebbleJar";

export interface PebbleSanctuaryModalProps {
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark";
  colors: {
    border: string;
    text: string;
    textMuted: string;
    card: string;
    primary: string;
    warning: string;
  };
  lifetimePebbles: number;
  monthlyPebbles: number;
  gemsBalance: number;
  monthlyTypes: { task: number; habit: number; focus: number; checklist: number };
  lifetimeTypes: { task: number; habit: number; focus: number; checklist: number };
  profileAvatar?: string;
  getMilestoneInfo: (count: number) => {
    stage: number;
    name: string;
    range: string;
    desc: string;
  };
}

export const PebbleSanctuaryModal: React.FC<PebbleSanctuaryModalProps> = ({
  visible,
  onClose,
  colorScheme,
  colors,
  lifetimePebbles,
  monthlyPebbles,
  gemsBalance,
  monthlyTypes,
  lifetimeTypes,
  profileAvatar,
  getMilestoneInfo,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sanctuaryStyles.modalContainer}>
        <BlurView
          intensity={colorScheme === "light" ? 60 : 80}
          style={StyleSheet.absoluteFill}
          tint={colorScheme === "light" ? "light" : "dark"}
        />
        <View
          style={[
            sanctuaryStyles.modalContent,
            {
              backgroundColor:
                colorScheme === "light"
                  ? "rgba(255,255,255,0.95)"
                  : "rgba(24,24,27,0.95)",
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={sanctuaryStyles.modalHeader}>
            <Text
              style={[sanctuaryStyles.modalHeaderTitle, { color: colors.text }]}
            >
              Pebble Sanctuary
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                onClose();
              }}
              style={sanctuaryStyles.closeButton}
            >
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Pebble Jar in view mode */}
          <InteractivePebbleJar
            mode="view"
            totalPebbles={lifetimePebbles}
            colors={colors}
            colorScheme={colorScheme ?? "dark"}
            monthlyTypes={monthlyTypes}
            profileAvatar={profileAvatar}
          />

          {/* Pebble count & stage details */}
          <View style={{ width: "100%", paddingHorizontal: 4, gap: 16 }}>
            {/* Monthly target display panel */}
            <View style={{ alignItems: "center", width: "100%", gap: 2 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 3,
                }}
              >
                <Text
                  style={{
                    fontSize: 44,
                    fontWeight: "900",
                    color: colors.text,
                  }}
                >
                  {monthlyPebbles}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: colors.textMuted,
                  }}
                >
                  / 100
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: colors.primary,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                }}
              >
                Monthly Target (Thirsty Crow)
              </Text>
            </View>

            {(() => {
              const milestoneInfo = getMilestoneInfo(lifetimePebbles);
              return (
                <View style={{ width: "100%", gap: 14 }}>
                  {/* Stat Split Row */}
                  <View
                    style={{ flexDirection: "row", gap: 8, width: "100%" }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor:
                          colorScheme === "light"
                            ? "rgba(0,0,0,0.015)"
                            : "rgba(255,255,255,0.02)",
                        padding: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "800",
                          color: colors.text,
                        }}
                      >
                        {Math.min(100, monthlyPebbles)}%
                      </Text>
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "700",
                          color: colors.textMuted,
                          textTransform: "uppercase",
                          textAlign: "center",
                        }}
                      >
                        Water Level
                      </Text>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor:
                          colorScheme === "light"
                            ? "rgba(0,0,0,0.015)"
                            : "rgba(255,255,255,0.02)",
                        padding: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "800",
                          color: "#F59E0B",
                        }}
                      >
                        💎 {gemsBalance}
                      </Text>
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "700",
                          color: colors.textMuted,
                          textTransform: "uppercase",
                          textAlign: "center",
                        }}
                      >
                        Gems
                      </Text>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor:
                          colorScheme === "light"
                            ? "rgba(0,0,0,0.015)"
                            : "rgba(255,255,255,0.02)",
                        padding: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "800",
                          color: colors.text,
                        }}
                      >
                        {lifetimePebbles}
                      </Text>
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "700",
                          color: colors.textMuted,
                          textTransform: "uppercase",
                          textAlign: "center",
                        }}
                      >
                        Lifetime
                      </Text>
                    </View>
                  </View>

                  {/* Pebble Sources Breakdown */}
                  <View style={{ width: "100%", gap: 6 }}>
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "800",
                        color: colors.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Pebble Sources
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {/* Tasks — purple */}
                      <View
                        style={{
                          flex: 1,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(139,92,246,0.06)"
                              : "rgba(139,92,246,0.12)",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(139,92,246,0.25)",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Feather
                            name="check-square"
                            size={11}
                            color="#8B5CF6"
                          />
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "900",
                              color: "#8B5CF6",
                            }}
                          >
                            {lifetimeTypes.task}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Tasks
                        </Text>
                      </View>
                      {/* Habits — orange */}
                      <View
                        style={{
                          flex: 1,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(249,115,22,0.06)"
                              : "rgba(249,115,22,0.12)",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(249,115,22,0.25)",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Feather name="repeat" size={11} color="#F97316" />
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "900",
                              color: "#F97316",
                            }}
                          >
                            {lifetimeTypes.habit}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Habits
                        </Text>
                      </View>
                      {/* Focus — green */}
                      <View
                        style={{
                          flex: 1,
                          backgroundColor:
                            colorScheme === "light"
                              ? "rgba(16,185,129,0.06)"
                              : "rgba(16,185,129,0.12)",
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(16,185,129,0.25)",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Feather name="zap" size={11} color="#10B981" />
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "900",
                              color: "#10B981",
                            }}
                          >
                            {lifetimeTypes.focus}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "700",
                            color: colors.textMuted,
                            textTransform: "uppercase",
                            textAlign: "center",
                          }}
                        >
                          Focus
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Milestone Card */}
                  <View
                    style={{
                      backgroundColor:
                        colorScheme === "light"
                          ? "rgba(99,102,241,0.03)"
                          : "rgba(99,102,241,0.05)",
                      borderColor: colors.border,
                      borderWidth: 1.2,
                      borderRadius: 16,
                      padding: 14,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          color: colors.primary,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        Stage {milestoneInfo.stage}/7: {milestoneInfo.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "700",
                          color: colors.textMuted,
                        }}
                      >
                        {milestoneInfo.range}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.textMuted,
                        lineHeight: 15,
                      }}
                    >
                      {milestoneInfo.desc}
                    </Text>

                    {/* Progress bar towards next milestone */}
                    {milestoneInfo.stage < 7 && (
                      <View style={{ width: "100%", gap: 6, marginTop: 4 }}>
                        <View
                          style={{
                            height: 5,
                            width: "100%",
                            borderRadius: 2.5,
                            backgroundColor:
                              colorScheme === "light"
                                ? "rgba(0,0,0,0.06)"
                                : "rgba(255,255,255,0.06)",
                            overflow: "hidden",
                          }}
                        >
                          {(() => {
                            const current = lifetimePebbles;
                            const ranges = [0, 10, 25, 50, 100, 250, 500];
                            const minVal = ranges[milestoneInfo.stage - 1];
                            const maxVal = ranges[milestoneInfo.stage];
                            const totalInStage = maxVal - minVal;
                            const progressInStage = Math.max(
                              0,
                              current - minVal,
                            );
                            const pct =
                              (progressInStage / totalInStage) * 100;

                            return (
                              <View
                                style={{
                                  height: "100%",
                                  width: `${Math.max(5, Math.min(100, pct))}%`,
                                  backgroundColor: colors.primary,
                                }}
                              />
                            );
                          })()}
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          {(() => {
                            const nextMilestone = [10, 25, 50, 100, 250, 500][
                              milestoneInfo.stage - 1
                            ];
                            const remaining = nextMilestone - lifetimePebbles;
                            return (
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: "600",
                                  color: colors.textMuted,
                                }}
                              >
                                {remaining} pebble{remaining === 1 ? "" : "s"}{" "}
                                to Stage {milestoneInfo.stage + 1}
                              </Text>
                            );
                          })()}

                          {(() => {
                            const nextUnlock = [
                              { count: 10, label: "Sprout Jar Nest" },
                              { count: 26, label: "Curious Mascot grows" },
                              { count: 100, label: "Zen Energy floats" },
                              {
                                count: 101,
                                label: "Crowned Mascot & sparkles",
                              },
                              { count: 500, label: "Golden Jar & sparks" },
                            ].find((u) => lifetimePebbles < u.count);

                            if (!nextUnlock) return null;

                            return (
                              <Text
                                style={{
                                  fontSize: 8,
                                  fontWeight: "700",
                                  textTransform: "uppercase",
                                  color: colors.warning,
                                }}
                              >
                                ⚡ Next: {nextUnlock.label}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const sanctuaryStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
