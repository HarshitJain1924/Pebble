export type NotificationTargetType = "todo" | "habit";

export type NotificationPayload = {
  type: NotificationTargetType;
  itemId: string;
};

export type NotificationRoute = {
  pathname: "/" | "/daily" | "/tasks";
  params: {
    focusItemId: string;
    focusItemType: NotificationTargetType;
    segment?: "tasks" | "habits";
  };
};

export function getNotificationPayload(
  data: unknown,
): NotificationPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const maybe = data as Partial<NotificationPayload>;
  if (
    (maybe.type === "todo" || maybe.type === "habit") &&
    typeof maybe.itemId === "string"
  ) {
    return { type: maybe.type, itemId: maybe.itemId };
  }

  return null;
}

export function getNotificationRoute(data: unknown): NotificationRoute | null {
  const payload = getNotificationPayload(data);
  if (!payload) {
    return null;
  }

  return payload.type === "todo"
    ? {
        pathname: "/tasks",
        params: {
          focusItemId: payload.itemId,
          focusItemType: payload.type,
          segment: "tasks",
        },
      }
    : {
        pathname: "/tasks",
        params: {
          focusItemId: payload.itemId,
          focusItemType: payload.type,
          segment: "habits",
        },
      };
}
