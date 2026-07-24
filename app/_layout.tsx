import React, { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
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
import NotificationListener from "@/shared/components/ui/NotificationListener";

import { cleanupRecycleBin } from "@/services/storage/storage.service";

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
    cleanupRecycleBin();
  }, []);

  useEffect(() => {
    if (!navigationState?.key) {
      return;
    }

    const checkOnboarding = async () => {
      try {
        const completed = await AsyncStorage.getItem(
          "todoapp:onboarding_completed",
        );
        const inOnboarding = segments[0] === "onboarding";

        if (completed !== "true" && !inOnboarding) {
          router.replace("/onboarding");
        } else if (completed === "true" && inOnboarding) {
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

  if (!fontsLoaded || !isReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <BottomSheetModalProvider>
          <UndoProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="profile" options={{ headerShown: false }} />
              <Stack.Screen name="profile/stats" options={{ headerShown: false }} />
              <Stack.Screen name="profile/achievements" options={{ headerShown: false }} />
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
            <StatusBar style="auto" />
          </UndoProvider>
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
