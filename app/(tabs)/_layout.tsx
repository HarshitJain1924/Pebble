import UnifiedCapture from "@/features/capture/components/UnifiedCapture";
import { WorkspaceRepository } from "@/repositories";
import {
  addStateListener,
} from "@/services/events/state-events";
import { MascotOverlay } from "@/shared/components/layout/MascotOverlay";
import { AnimatedTabBar } from "@/shared/components/navigation/motion-tabs";

import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import {
  INBOX_WORKSPACE_ID,
  type Workspace,
} from "@/shared/types/domain.types";
import { Feather } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";



export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>(INBOX_WORKSPACE_ID);

  useEffect(() => {
    const unsubWorkspace = addStateListener(
      "workspace_mode_changed",
      (folderId) => {
        if (folderId && folderId !== "null") {
          setSelectedWorkspaceId(folderId);
        }
      },
    );
    const unsubQuickAdd = addStateListener("open_quick_add", () => {
      openQuickAdd();
    });
    return () => {
      unsubWorkspace();
      unsubQuickAdd();
    };
  }, []);

  const quickAddSheetRef = useRef<BottomSheetModal>(null);

  const openQuickAdd = () => {
    WorkspaceRepository.getWorkspaces()
      .then((workspaceList) => {
        const currentWorkspaces = workspaceList.map((ws) => ({
          id: ws.id,
          name: ws.name,
          emoji: ws.emoji || "📁",
          color: ws.color || "#6366F1",
          revision: ws.revision || 1,
          lifecycleGeneration: ws.lifecycleGeneration || 1,
          createdAt: ws.createdAt || Date.now(),
          updatedAt: ws.updatedAt || Date.now(),
        }));
        setWorkspaces(currentWorkspaces);
        if (!currentWorkspaces.some((w) => w.id === selectedWorkspaceId)) {
          setSelectedWorkspaceId(INBOX_WORKSPACE_ID);
        }
      })
      .catch(() => {});
    quickAddSheetRef.current?.present();
  };



  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <AnimatedTabBar {...props} onQuickAddPress={openQuickAdd} />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Today",
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: "Workspaces",
            tabBarIcon: ({ color, size }) => (
              <Feather name="folder" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: "Focus",
            tabBarIcon: ({ color, size }) => (
              <Feather name="target" size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
          }}
        />
      </Tabs>

      <MascotOverlay />

      {/* Unified Capture — replaces Quick Add */}
      <UnifiedCapture
        sheetRef={quickAddSheetRef}
        workspaces={workspaces}
        defaultWorkspaceId={selectedWorkspaceId}
        entryTab={undefined}
      />
    </View>
  );
}

const navStyles = StyleSheet.create({
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  centerTabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(24, 24, 27, 0.82)",
    marginTop: 0,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
});


