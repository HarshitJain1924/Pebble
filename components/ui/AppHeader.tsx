import React from "react";
import { Platform, Pressable, StyleSheet,  View } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type AppHeaderProps = {
  kicker?: string;
  title?: string;
  subtitle?: string;
  showProfile?: boolean;
  showNotifications?: boolean;
  showArchive?: boolean;
  nextReminder?: string | null;
  hasUnreadNotifs?: boolean;
  profile?: { name: string; avatar: string; level: number } | null;
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  kicker,
  title,
  subtitle,
  showProfile = true,
  showNotifications = true,
  showArchive = false,
  nextReminder,
  hasUnreadNotifs,
  profile,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const router = useRouter();
  const isLight = colorScheme === "light";

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {kicker && <Text style={[styles.kicker, { color: colors.primary }]}>{kicker.toUpperCase()}</Text>}
        {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
        {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
      </View>
      {(showNotifications || showProfile || showArchive) && (
        <View style={styles.right}>
          {showArchive && (
            <Pressable
              style={({ pressed }) => [
                styles.bellButton,
                {
                  borderColor: colors.border,
                  backgroundColor: isLight ? "#FFFFFF" : "rgba(255,255,255,0.05)",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open archive"
              onPress={() => router.push("/archive")}
            >
              <Feather name="archive" size={16} color={colors.textMuted} />
            </Pressable>
          )}

          {showNotifications && (
            <Pressable
              style={({ pressed }) => [
                styles.bellButton,
                {
                  borderColor: colors.border,
                  backgroundColor: isLight ? "#FFFFFF" : "rgba(255,255,255,0.05)",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
              onPress={() => router.push("/notifications")}
            >
              <Feather name="bell" size={16} color={colors.textMuted} />
              {(nextReminder || hasUnreadNotifs) && (
                <View
                  style={[
                    styles.bellDot,
                    {
                      backgroundColor: colors.primary,
                      borderColor: isLight ? "#FFFFFF" : "#18181B",
                    },
                  ]}
                />
              )}
            </Pressable>
          )}

          {showProfile && (
            <Pressable
              style={styles.profileHeaderWrap}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => router.push("/profile")}
            >
              <View
                style={[
                  styles.profileHeaderCircle,
                  {
                    borderColor: colors.border,
                    backgroundColor: isLight ? "#FFFFFF" : "rgba(255,255,255,0.05)",
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>
                  {profile ? profile.avatar : "👨‍💻"}
                </Text>
                {hasUnreadNotifs && (
                  <View
                    style={[
                      styles.avatarNotifDot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                )}
              </View>
              <View
                style={[
                  styles.profileHeaderBadge,
                  {
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <Text style={styles.profileHeaderBadgeText}>
                  {profile ? `Lvl ${profile.level}` : "Lvl 1"}
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    top: 10,
    right: 10,
  },
  profileHeaderWrap: {
    position: "relative",
  },
  profileHeaderCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeaderBadge: {
    position: "absolute",
    bottom: -6,
    right: -2,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#18181B",
  },
  profileHeaderBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  avatarNotifDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 0,
    right: 0,
  },
});
