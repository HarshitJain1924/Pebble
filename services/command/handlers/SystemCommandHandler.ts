import { GraphRepository } from "@/repositories/GraphRepository";
import { earnPebble } from "@/features/profile/services/pebble.service";

export class SystemCommandHandler {
  static async logSystemEvent(eventName: string, details?: any): Promise<void> {
    await GraphRepository.logSystemEvent({
      id: `evt_${Date.now()}`,
      eventType: eventName,
      timestamp: Date.now(),
      details: details || {},
    });
  }

  static async recordFocusSession(
    durationSeconds: number,
    taskId?: string,
    itemType?: "task" | "habit" | "checklist",
    options?: { sessionId?: string; startedAt?: number; endedAt?: number }
  ): Promise<void> {
    const sessionId = options?.sessionId || `focus_${Date.now()}`;
    const endedAt = options?.endedAt || Date.now();
    const startedAt =
      options?.startedAt || endedAt - Math.floor(durationSeconds * 1000);
    const session = {
      id: sessionId,
      taskId,
      startedAt,
      endedAt,
      duration: Math.floor(durationSeconds),
      completedAt: endedAt,
    };

    await GraphRepository.saveFocusSession(session);
    await earnPebble("focus", `focus:${sessionId}`);

    if (taskId && itemType) {
      await GraphRepository.saveRelationship({
        id: `rel_${Date.now()}`,
        source: { id: sessionId, type: "focus" },
        target: { id: taskId, type: itemType as any },
        relationType: "focuses_on",
        createdAt: Date.now(),
      });
    }

    // emitStateChange("graph_changed", "EntityCommandService");
  }
}
