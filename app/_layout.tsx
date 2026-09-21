import React, { useEffect, useMemo, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from "@expo-google-fonts/outfit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import {
    Stack,
    useRootNavigationState,
    useRouter,
    useSegments,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import "react-native-reanimated";

import UndoProvider from "@/shared/components/ui/UndoContext";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import { Colors } from "@/shared/constants/theme";
import NotificationListener from "@/shared/components/ui/NotificationListener";

import { NotificationReconcilerService } from "@/services/notifications/NotificationReconcilerService";
import { OnboardingService } from "@/services/onboarding/onboarding.service";
import { runStartupRecovery } from "@/services/startup/startup-recovery";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const segments = useSegments();

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Moved cleanupRecycleBin to checkOnboarding sequence to prevent race conditions
  }, []);

  useEffect(() => {
    // Settings changes (quiet-hours window, category subscriptions, escalation
    // gate) must also re-align already-scheduled notifications. The hook is
    // owned by the notification layer itself (idempotent + serialized).
    return NotificationReconcilerService.registerSettingsChangeReconciliation();
  }, []);

  useEffect(() => {
    if (!navigationState?.key) {
      return;
    }

    const checkOnboarding = async () => {
      try {
        // Single, testable startup recovery sequence: interrupted-restore
        // recovery, move/conversion journal replay, ghost pruning, recycle-bin
        // cleanup, graph reconciliation, and notification reconciliation.
        await runStartupRecovery();

        const completed = await OnboardingService.isOnboardingCompleted();
        const inOnboarding = segments[0] === "onboarding";

        if (!completed && !inOnboarding) {
          router.replace("/onboarding");
        } else if (completed && inOnboarding) {
          router.replace("/(tabs)");
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      } finally {
        setIsReady(true);
      }
    };

    checkOnboarding();
  }, [navigationState?.key]);

  useEffect(() => {
    if (fontsLoaded && isReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isReady]);

  const currentTheme = Colors[colorScheme ?? "dark"];

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(currentTheme.background).catch(() => {});
  }, [currentTheme.background]);

  const navigationTheme = useMemo(() => {
    const isDark = colorScheme === "dark";
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: currentTheme.background,
        card: currentTheme.card,
        text: currentTheme.text,
        border: currentTheme.border,
        primary: currentTheme.primary,
      },
    };
  }, [colorScheme, currentTheme]);

  if (!fontsLoaded || !isReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: currentTheme.background }}>
      <ThemeProvider value={navigationTheme}>
        <BottomSheetModalProvider>
          <UndoProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="profile" options={{ headerShown: false }} />
              <Stack.Screen name="profile/stats" options={{ headerShown: false }} />
              <Stack.Screen name="profile/achievements" options={{ headerShown: false }} />
              <Stack.Screen name="sanctuary" options={{ headerShown: false }} />
              <Stack.Screen
                name="notifications"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="task-details"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen
                name="checklist-details"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen
                name="resource-details"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen
                name="archive"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="recycle-bin"
                options={{ headerShown: false }}
              />
            </Stack>
            {/* NotificationListener registers listeners and shows in-app banners when notifications arrive */}
            <NotificationListener />
            <StatusBar style="auto" translucent backgroundColor="transparent" />
          </UndoProvider>
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
