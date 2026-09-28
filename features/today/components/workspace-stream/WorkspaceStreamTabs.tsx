import React from "react";
import { Dimensions, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText as Text } from "@/shared/components/ui/AppText";
import PressableScale from "@/shared/components/ui/PressableScale";
import type { ThemeColors } from "@/shared/constants/theme";
import type { WorkspaceStreamTab } from "@/features/today/hooks/useWorkspaceStream";
import { getTabScrollTarget } from "@/features/today/utils/stream-formatting";

export interface WorkspaceStreamTabsProps {
  tabs: WorkspaceStreamTab[];
  openDrawerId: string;
  colors: ThemeColors;
  colorScheme: "light" | "dark" | null | undefined;
  onSelect: (tabId: string) => void;
}

/**
 * The workspace tab rail above the stream drawer.
 *
 * Owns its own tab measurement/centering: a 20-workspace strip is unusable if
 * the open tab can scroll out of sight, so the selected tab is centred
 * whenever it changes.
 */
export const WorkspaceStreamTabs: React.FC<WorkspaceStreamTabsProps> = ({
  tabs,
  openDrawerId,
  colors,
  colorScheme,
  onSelect,
}) => {
  const isDark = colorScheme !== "light";
  const tabScrollRef = React.useRef<ScrollView>(null);
  const tabLayouts = React.useRef<Record<string, { x: number; width: number }>>({});
  const [tabsMeasured, setTabsMeasured] = React.useState(false);
  const windowWidth = Dimensions.get("window").width;

  React.useEffect(() => {
    if (!tabsMeasured) return;
    const layout = tabLayouts.current[openDrawerId];
    if (!layout) return;
    tabScrollRef.current?.scrollTo({
      x: getTabScrollTarget(layout.x, layout.width, windowWidth),
      animated: true,
    });
  }, [openDrawerId, tabsMeasured, windowWidth]);

  return (
    <ScrollView
      ref={tabScrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabScrollView}
      contentContainerStyle={[
        styles.tabStrip,
        tabs.length <= 4 && styles.tabStripFlex,
      ]}
      onContentSizeChange={() => setTabsMeasured(true)}
    >
      {tabs.map((tab, index) => {
        const isSelected = openDrawerId === tab.id;
        const openFill = isDark ? `${tab.color}0F` : `${tab.color}08`;
        const openStroke = isDark ? `${tab.color}4A` : `${tab.color}30`;
        const idleStroke = isDark
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(0, 0, 0, 0.06)";
        const isFirstTab = index === 0;
        const isLastTab = index === tabs.length - 1;
        const isFlex = tabs.length <= 4;

        return (
          <View
            key={`tab-${tab.id}`}
            style={[
              styles.tabSlot,
              isFlex ? styles.tabSlotFlex : styles.tabSlotScroll,
            ]}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              tabLayouts.current[tab.id] = { x, width };
            }}
          >
            <PressableScale
              onPress={() => onSelect(tab.id)}
              haptic
              accessibilityRole="button"
              accessibilityLabel={
                tab.id === "all"
                  ? `All workspaces, ${tab.itemCount} items`
                  : `Filter by ${tab.name}, ${tab.itemCount} items`
              }
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.tab,
                isFlex && styles.tabFlex,
                {
                  borderTopLeftRadius: isFirstTab ? 10 : 6,
                  borderTopRightRadius: isLastTab ? 10 : 6,
                },
                isSelected ? styles.tabOpen : styles.tabClosed,
                isSelected
                  ? {
                      backgroundColor: openFill,
                      borderColor: openStroke,
                      borderTopColor: tab.color,
                      borderTopWidth: 2,
                    }
                  : {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.03)"
                        : "rgba(0, 0, 0, 0.02)",
                      borderColor: idleStroke,
                    },
              ]}
              contentStyle={styles.tabContent}
            >
              {tab.workspace &&
              (tab.workspace.iconType === "icon" ||
                (!tab.workspace.emoji && tab.workspace.icon)) ? (
                <Feather
                  name={(tab.workspace.icon || "folder") as any}
                  size={13}
                  color={isSelected ? tab.color : colors.textMuted}
                />
              ) : tab.workspace ? (
                <Text style={styles.tabEmoji}>
                  {tab.workspace.emoji || "📁"}
                </Text>
              ) : (
                <Feather
                  name="layers"
                  size={13}
                  color={isSelected ? tab.color : colors.textMuted}
                />
              )}
              <Text
                style={[
                  styles.tabName,
                  {
                    color: isSelected ? colors.text : colors.textMuted,
                    fontWeight: isSelected ? "700" : "600",
                  },
                ]}
                numberOfLines={1}
              >
                {tab.name}
              </Text>
              {tab.itemCount > 0 && (
                <View
                  style={[
                    styles.tabBadge,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? `${tab.color}35`
                          : `${tab.color}22`
                        : isDark
                          ? "rgba(255, 255, 255, 0.08)"
                          : "rgba(0, 0, 0, 0.06)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      {
                        color: isSelected ? tab.color : colors.textMuted,
                        fontWeight: isSelected ? "700" : "600",
                      },
                    ]}
                  >
                    {tab.itemCount}
                  </Text>
                </View>
              )}
            </PressableScale>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  tabScrollView: {
    width: "100%",
  },
  tabStrip: {
    flexDirection: "row",
    // Closed tabs sit lower, so every tab bottom meets the drawer's top edge.
    alignItems: "flex-end",
    gap: 3,
    paddingLeft: 0,
    paddingRight: 0,
  },
  tabStripFlex: {
    width: "100%",
  },
  tabSlot: {},
  tabSlotFlex: {
    flex: 1,
  },
  tabSlotScroll: {
    flexShrink: 0,
  },
  tab: {
    borderWidth: 1,
  },
  tabFlex: {
    width: "100%",
  },
  tabOpen: {
    // No bottom border and no bottom radius: the fill runs into the drawer.
    borderBottomWidth: 0,
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 8,
  },
  tabClosed: {
    borderBottomWidth: 1,
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  tabBadge: {
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 2,
    flexShrink: 0,
  },
  tabBadgeText: {
    fontSize: 10,
    letterSpacing: -0.1,
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabEmoji: {
    fontSize: 12,
  },
  tabName: {
    fontSize: 12,
    letterSpacing: -0.15,
    flexShrink: 1,
  },
});
