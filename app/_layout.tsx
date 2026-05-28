import { useEffect } from "react";
import { Platform } from "react-native";

import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { getNotificationRoute } from "@/services/notificationRoutes";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) {
      return;
    }

    if (Platform.OS === "web") {
      return;
    }

    let active = true;
    let subscription: { remove: () => void } | undefined;

    const openNotificationTarget = (
      response: {
        notification: {
          request: { content: { data: unknown } };
        };
      } | null,
    ) => {
      if (!response) {
        return;
      }

      const route = getNotificationRoute(
        response.notification.request.content.data,
      );
      if (route) {
        router.push(route);
      }
    };

    (async () => {
      const Notifications = await import("expo-notifications");
      if (!active) {
        return;
      }

      Notifications.setNotificationHandler({
        handleNotification: async () =>
          ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }) as any,
      });

      void Notifications.getLastNotificationResponseAsync().then(
        openNotificationTarget,
      );
      subscription = Notifications.addNotificationResponseReceivedListener(
        openNotificationTarget,
      );
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [navigationState?.key, router]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
