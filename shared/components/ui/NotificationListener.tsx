import { useEffect } from "react";
import { Platform, AppState } from "react-native";

import { useUndo } from "@/shared/components/ui/UndoContext";
import { getNotificationRoute } from "@/services/scheduling/notification-routes";
import { useRouter } from "expo-router";

export default function NotificationListener() {
  const { showBanner } = useUndo();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    let receivedSubscription: { remove: () => void } | undefined;

    const triggerReconcile = () => {
      try {
        const {
          NotificationReconcilerService,
        } = require("@/services/notifications/NotificationReconcilerService");
        void NotificationReconcilerService.reconcileAll();
      } catch (e) {
        // Tolerant
      }
    };

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        triggerReconcile();
      }
    });

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
          console.log("[NotificationListener] getPermissionsAsync status:", status);
          if (status !== "granted") {
            const requestResult = await Notifications.requestPermissionsAsync();
            console.log("[NotificationListener] requestPermissionsAsync status:", requestResult.status);
          }

          if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync("todo-reminders", {
              name: "Task Reminders",
              importance: Notifications.AndroidImportance.HIGH,
            });
            await Notifications.setNotificationChannelAsync("daily-habits", {
              name: "Daily Habits",
              importance: Notifications.AndroidImportance.HIGH,
            });
            console.log("[NotificationListener] Android notification channels configured (todo-reminders, daily-habits) with HIGH importance.");
          }
        } catch (e) {
          // ignore
        }

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        void Notifications.getLastNotificationResponseAsync().then(
          (response) => {
            if (!response) return;
            triggerReconcile();
            const route = getNotificationRoute(
              response.notification.request.content.data,
            );
            if (route) router.push(route as any);
          },
        );
        subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            if (!response) return;
            triggerReconcile();
            const route = getNotificationRoute(
              response.notification.request.content.data,
            );
            if (route) router.push(route as any);
          },
        );

        receivedSubscription = Notifications.addNotificationReceivedListener(
          (notification) => {
            const { title, body, data } = notification.request.content;
            try {
              const {
                addNotificationLog,
              } = require("@/services/scheduling/notifications-log");
              void addNotificationLog(
                title || "Alert",
                body || "",
                data?.type || "reminder",
                data?.itemId,
              );
            } catch {}

            // Re-arm next anchored occurrence if a recurring reminder fired in the foreground
            triggerReconcile();

            // Show in-app banner with snooze action
            showBanner({
              title: title as string | undefined,
              body: body as string | undefined,
              duration: 6000,
              onSnooze: async () => {
                try {
                  if (data && typeof data === "object") {
                    const payload = data as Record<string, any>;
                    const itemId = payload.itemId;
                    const type = payload.type;
                    const workspaceId = payload.workspaceId;
                    if (itemId && type) {
                      const { EntityCommandService } = await import(
                        "@/services/command/EntityCommandService"
                      );
                      await EntityCommandService.snoozeReminder(
                        type,
                        itemId,
                        workspaceId,
                        5,
                      );
                    }
                  }
                } catch (e) {
                  console.warn("[NotificationListener] Failed to snooze reminder", e);
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
      appStateSub.remove();
      subscription?.remove();
      receivedSubscription?.remove();
    };
  }, [showBanner]);

  return null;
}
