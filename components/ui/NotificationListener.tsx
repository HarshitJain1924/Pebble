import { useEffect } from "react";
import { Platform } from "react-native";

import { useUndo } from "@/components/ui/UndoContext";
import { getNotificationRoute } from "@/services/notificationRoutes";
import { useRouter } from "expo-router";

export default function NotificationListener() {
  const { showBanner } = useUndo();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    let receivedSubscription: { remove: () => void } | undefined;

    const openNotificationTarget = (
      response: {
        notification: { request: { content: { data: unknown } } };
      } | null,
    ) => {
      // Intentionally empty here; routing handled elsewhere
      return;
    };

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (!active) return;

        // Request basic permissions but do not force
        try {
          const { status } = await Notifications.getPermissionsAsync();
          if (status !== "granted") {
            await Notifications.requestPermissionsAsync();
          }

          if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync("todo-reminders", {
              name: "Todo Reminders",
              importance: Notifications.AndroidImportance.DEFAULT,
            });
            await Notifications.setNotificationChannelAsync("daily-habits", {
              name: "Daily Habits",
              importance: Notifications.AndroidImportance.DEFAULT,
            });
          }
        } catch (e) {
          // ignore
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
          (response) => {
            if (!response) return;
            const route = getNotificationRoute(
              response.notification.request.content.data,
            );
            if (route) router.push(route);
          },
        );
        subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            if (!response) return;
            const route = getNotificationRoute(
              response.notification.request.content.data,
            );
            if (route) router.push(route);
          },
        );

        receivedSubscription = Notifications.addNotificationReceivedListener(
          (notification) => {
            const { title, body, data } = notification.request.content;
            try {
              const {
                addNotificationLog,
              } = require("@/services/notificationsLog");
              void addNotificationLog(
                title || "Alert",
                body || "",
                data?.type || "reminder",
                data?.itemId,
              );
            } catch {}

            // Show in-app banner with snooze action
            showBanner({
              title: title as string | undefined,
              body: body as string | undefined,
              duration: 6000,
              onSnooze: async () => {
                try {
                  // schedule a quick snooze 5 minutes later
                  const Notifications = await import("expo-notifications");
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: title || "Snoozed",
                      body: body || "Reminder",
                    },
                    trigger: { seconds: 60 * 5 } as any,
                  });
                } catch (e) {
                  // ignore
                }
              },
            });
          },
        );
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      active = false;
      subscription?.remove();
      receivedSubscription?.remove();
    };
  }, [showBanner]);

  return null;
}
