import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { AppCard } from "@/components/AppCard";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export interface RankTiersModalProps {
  visible: boolean;
  onClose: () => void;
  levelInfo: {
    level: number;
    rank: string;
    progressPct: number;
    xpInCurrentLevel: number;
    xpNeededForNext: number;
  };
  colors: any;
  colorScheme: string;
}

export function RankTiersModal({
  visible,
  onClose,
  levelInfo,
  colors,
  colorScheme,
}: RankTiersModalProps) {
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={modalStyles.modalOverlay} onPress={handleClose}>
        <AppCard style={modalStyles.modalContent} onPress={() => {}}>
          <View style={modalStyles.modalHeader}>
            <Text style={[modalStyles.modalTitle, { color: colors.text }]}>
              Rank Progression
            </Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text
            style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}
          >
            Level up by completing tasks (+10 XP) and habits (+15 XP).
          </Text>

          <ScrollView
            contentContainerStyle={{ gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {[
              { lvl: 1, rank: "Mindful Starter", icon: "🌱", xp: "0 XP" },
              { lvl: 2, rank: "Active Organizer", icon: "📋", xp: "100 XP" },
              { lvl: 3, rank: "Efficiency Builder", icon: "🛠", xp: "300 XP" },
              { lvl: 5, rank: "Flow State Master", icon: "⚡", xp: "600 XP" },
              { lvl: 7, rank: "Ultimate Focus Zen Master", icon: "🧘", xp: "1,000 XP" },
              { lvl: 10, rank: "Productivity Overlord", icon: "👑", xp: "1,500 XP" },
            ].map((tier) => {
              const isCurrent =
                levelInfo.level === tier.lvl ||
                (levelInfo.level > tier.lvl &&
                  (tier.lvl === 10 ||
                    levelInfo.level <
                      ([2, 3, 5, 7, 10].find((l) => l > tier.lvl) || 10)));
              const isUnlocked = levelInfo.level >= tier.lvl;

              return (
                <View
                  key={tier.lvl}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: isCurrent
                      ? `${colors.primary}12`
                      : colors.cardLight,
                    borderWidth: 1.5,
                    borderColor: isCurrent ? colors.primary : colors.border,
                    opacity: isUnlocked ? 1 : 0.45,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{tier.icon}</Text>
                    <View>
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {tier.rank}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 9 }}>
                        Unlocks at Level {tier.lvl}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "700",
                        fontSize: 10,
                      }}
                    >
                      {tier.xp}
                    </Text>
                    {isCurrent && (
                      <View
                        style={{
                          backgroundColor: colors.success,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 8,
                            fontWeight: "800",
                          }}
                        >
                          CURRENT
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </AppCard>
      </Pressable>
    </Modal>
  );
}

const modalStyles = {
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
} as const;
