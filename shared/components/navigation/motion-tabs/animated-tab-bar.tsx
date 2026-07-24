import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import {
    memo,
    useEffect,
    useMemo,
    useState,
    type ComponentProps,
    type FC,
    type FunctionComponent,
    type JSX,
    type ReactElement,
    type ReactNode,
} from "react";
import {
    Dimensions,
    Platform,
    Pressable,
    StyleSheet,
    View,
    useColorScheme,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MeasurementLayer } from "./components/measurement-layer";
import { PanelStack } from "./components/panel-stack";
import { TabToolbar } from "./components/tab-toolbar";
import { useCardMorph } from "./hooks/use-card-morph";
import { useDynamicLayout } from "./hooks/use-dynamic-layout";
import { useNavItems } from "./hooks/use-nav-items";
import { usePopupRenderer } from "./hooks/use-popup-renderer";
import { useViewTransition } from "./hooks/use-view-transition";
import type {
    IAnimatedTabBarProps,
    INavItem,
    IPalette,
} from "./typings/motion-tabs";
import { layoutStyles as styles } from "./utils/layout-styles";
import { palette } from "./utils/palette";
import { estimateToolbarWidth } from "./utils/toolbar-width";

import { addStateListener, emitStateChange } from "@/services/events/state-events";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const AnimatedTabBar: FC<IAnimatedTabBarProps> &
  FunctionComponent<IAnimatedTabBarProps> = memo<
  IAnimatedTabBarProps & ComponentProps<typeof AnimatedTabBar>
>(
  (
    props: IAnimatedTabBarProps & ComponentProps<typeof AnimatedTabBar>,
  ): (ReactNode & ReactElement & JSX.Element) | null => {
    const { descriptors, navigation, renderPopupBody, state } = props;
    const insets = useSafeAreaInsets();
    const scheme = (useColorScheme() ?? "light") as "light" | "dark";
    const colors = useMemo<IPalette>(() => palette(scheme), [scheme]);
    const popupRenderer = usePopupRenderer(renderPopupBody);
    const items = useNavItems({ descriptors, state });
    const layout = useDynamicLayout();
    const transition = useViewTransition(items);

    // Context Navigation States
    const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
    const [activeSegment, setActiveSegment] = useState<string>("tasks");
    const [navMode, setNavMode] = useState<"workspace" | "global">("workspace");

    useEffect(() => {
      const unsub = addStateListener("workspace_mode_changed", (folderId) => {
        const isOpened = folderId && folderId !== "null" ? folderId : null;
        setOpenedFolderId(isOpened);
        // Always enter workspace nav when a folder opens
        if (isOpened) setNavMode("workspace");
        else setNavMode("workspace"); // reset for next time
      });
      return unsub;
    }, []);

    useEffect(() => {
      const unsub = addStateListener("workspace_segment_changed", (seg) => {
        if (seg) setActiveSegment(seg);
      });
      return unsub;
    }, []);

    const tasksRoute = useMemo(
      () =>
        state.routes.find((route) => route.name === "tasks") ?? state.routes[0],
      [state.routes],
    );

    const quickAddItem = useMemo<INavItem>(
      () => ({
        key: "quick-add",
        route: state.routes[0],
        routeName: "quick-add",
        label: "",
        icon: (focused, color, size) => (
          <Feather name="plus" size={size || 24} color={color} />
        ),
      }),
      [state.routes],
    );

    const globalItems = useMemo<INavItem[]>(() => {
      const result = [...items];
      if (result.length >= 2) {
        result.splice(2, 0, quickAddItem);
      } else {
        result.push(quickAddItem);
      }
      return result;
    }, [items, quickAddItem]);

    const workspaceItems = useMemo<INavItem[]>(() => {
      if (openedFolderId === null) return [];
      return [
        {
          key: "tasks-tasks",
          route: tasksRoute,
          routeName: "tasks",
          label: "",
          icon: (focused, color, size) => (
            <Feather name="check-square" size={size || 20} color={color} />
          ),
          segment: "tasks",
        },
        {
          key: "tasks-habits",
          route: tasksRoute,
          routeName: "tasks",
          label: "",
          icon: (focused, color, size) => (
            <Feather name="activity" size={size || 20} color={color} />
          ),
          segment: "habits",
        },
        quickAddItem,
        {
          key: "tasks-checklists",
          route: tasksRoute,
          routeName: "tasks",
          label: "",
          icon: (focused, color, size) => (
            <Feather name="list" size={size || 20} color={color} />
          ),
          segment: "checklists",
        },
        {
          key: "tasks-resources",
          route: tasksRoute,
          routeName: "tasks",
          label: "",
          icon: (focused, color, size) => (
            <Feather name="paperclip" size={size || 20} color={color} />
          ),
          segment: "vault",
        },
      ];
    }, [openedFolderId, tasksRoute, quickAddItem]);

    const activeNavMode = openedFolderId !== null ? navMode : "global";
    const currentItems = activeNavMode === "workspace" ? workspaceItems : globalItems;

    const currentView = useMemo(() => {
      if (activeNavMode === "workspace") {
        if (transition.view !== "default") {
          return transition.view;
        }
        if (activeSegment === "tasks") return "tasks-tasks";
        if (activeSegment === "habits") return "tasks-habits";
        if (activeSegment === "checklists") return "tasks-checklists";
        if (activeSegment === "vault") return "tasks-resources";
        return "tasks-tasks";
      }
      return transition.view;
    }, [activeNavMode, transition.view, activeSegment]);

    const toolbarTargetW = Math.max(
      layout.toolbarW,
      estimateToolbarWidth(currentItems, currentView),
    );

    const motion = useCardMorph({
      sizes: layout.sizes,
      toolbarH: layout.toolbarH,
      toolbarMinW: layout.toolbarMinW,
      toolbarW: toolbarTargetW,
      view: transition.view,
    });

    useEffect(() => {
      transition.close();
    }, [state.index]);

    useEffect(() => {
      const unsub = addStateListener("close_drawer", () => {
        transition.close();
      });
      return unsub;
    }, [transition]);

    const handlePress = (item: INavItem, index: number): void => {
      if (item.routeName === "quick-add" || item.key === "quick-add") {
        if (props.onQuickAddPress) {
          props.onQuickAddPress();
        }
        return;
      }

      if (activeNavMode === "workspace") {
        if ((item as any).segment) {
          const seg = (item as any).segment;
          emitStateChange("workspace_segment_request", seg);
          setActiveSegment(seg);
        }
        return;
      }

      const isFocused = state.routes[state.index]?.name === item.routeName;
      if (!isFocused) {
        navigation.navigate(item.routeName);
        transition.close();
      } else {
        transition.setNextView(item);
      }
    };
    const toggleNavMode = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (navMode === "workspace") {
        setNavMode("global");
        setOpenedFolderId(null);
        emitStateChange("workspace_mode_changed", "null");
      } else {
        setNavMode("workspace");
      }
    };

    // Show the switch button only while inside a folder, not while a panel is open
    const showModeSwitch =
      openedFolderId !== null && transition.view === "default";

    return (
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, styles.root]}
      >
        <MeasurementLayer
          colors={colors}
          items={items}
          onMeasure={layout.handleMeasure}
          renderPopupBody={popupRenderer}
        />
        {transition.view !== "default" && (
          <Pressable
            accessibilityLabel="Close menu"
            accessibilityRole="button"
            onPress={transition.close}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          pointerEvents="box-none"
          style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <Animated.View style={[styles.cardShadow, motion.cardStyle]}>
            <BlurView
              intensity={70}
              tint={scheme === "dark" ? "dark" : "light"}
              style={[
                styles.card,
                {
                  borderColor: colors.border,
                  ...Platform.select({
                    android: {
                      backgroundColor: colors.surface,
                    },
                  }),
                },
              ]}
            >
              <PanelStack
                colors={colors}
                direction={transition.panelDirection}
                items={items}
                onMeasure={layout.handleMeasure}
                renderPopupBody={popupRenderer}
                view={transition.view}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.divider,
                  motion.dividerStyle,
                  { backgroundColor: colors.border },
                ]}
              />
              <TabToolbar
                colors={colors}
                items={currentItems}
                onLayout={layout.handleToolbarLayout}
                onPress={handlePress}
                view={currentView}
              />
            </BlurView>
          </Animated.View>

          {/* Switch between workspace nav and global nav */}
          {showModeSwitch && (
            <Pressable
              onPress={toggleNavMode}
              style={[
                {
                  position: "absolute",
                  bottom:
                    Math.max(insets.bottom, 12) + (layout.toolbarH - 36) / 2,
                  left: SCREEN_WIDTH / 2 + toolbarTargetW / 2 + 10,
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  elevation: 6,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  borderWidth: 1.5,
                  borderColor:
                    navMode === "workspace"
                      ? "rgba(124, 98, 240, 0.55)"
                      : colors.border,
                  overflow: "hidden",
                },
                Platform.select({
                  android: { backgroundColor: colors.surface },
                }),
              ]}
            >
              <BlurView
                intensity={80}
                tint={scheme === "dark" ? "dark" : "light"}
                style={{
                  width: "100%",
                  height: "100%",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Feather
                  name="layers"
                  size={16}
                  color={
                    navMode === "workspace" ? "#7C62F0" : colors.foreground
                  }
                />
                <View
                  style={{
                    position: "absolute",
                    bottom: 5,
                    right: 5,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      navMode === "workspace" ? "#7C62F0" : colors.foreground,
                    opacity: 0.85,
                  }}
                />
              </BlurView>
            </Pressable>
          )}
        </View>
      </View>
    );
  },
);

export { AnimatedTabBar };
