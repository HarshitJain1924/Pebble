/**
 * GraphRepository.ts
 * ─────────────────────
 * Relationship graph, focus sessions, and system event log persistence.
 */
import {
  INBOX_WORKSPACE_ID,
  type FocusSession,
  type Relationship,
  type SystemEventLog,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export interface RelationshipIndex {
  sourceIndex: Record<string, string[]>;
  targetIndex: Record<string, string[]>;
}

export class GraphRepository {
  private static readonly RELATIONSHIPS_KEY = "pebble:v1:relationships";
  private static readonly FOCUS_SESSIONS_KEY = "pebble:v1:focus_sessions";
  private static readonly SYSTEM_EVENT_LOG_KEY = "pebble:v1:system_event_log";

  private static relationships: Record<string, Relationship> = {};
  private static index: RelationshipIndex = {
    sourceIndex: {},
    targetIndex: {},
  };
  private static loaded = false;

  static resetCache() {
    this.relationships = {};
    this.index = { sourceIndex: {}, targetIndex: {} };
    this.loaded = false;
  }

  private static async ensureLoaded() {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(this.RELATIONSHIPS_KEY);
      this.relationships = raw ? JSON.parse(raw) : {};
      this.rebuildIndex();
      this.loaded = true;
    } catch (e) {
      console.error("Failed to load relationships", e);
      throw e;
    }
  }

  private static rebuildIndex() {
    const sourceIdx: Record<string, string[]> = {};
    const targetIdx: Record<string, string[]> = {};

    Object.values(this.relationships).forEach((rel) => {
      const sId = rel.source.id;
      const tId = rel.target.id;
      if (!sourceIdx[sId]) sourceIdx[sId] = [];
      if (!targetIdx[tId]) targetIdx[tId] = [];
      sourceIdx[sId].push(rel.id);
      targetIdx[tId].push(rel.id);
    });

    this.index = { sourceIndex: sourceIdx, targetIndex: targetIdx };
  }

  static async saveRelationship(rel: Relationship): Promise<void> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      await this.ensureLoaded();
      this.relationships[rel.id] = rel;
      this.rebuildIndex();
      await AsyncStorage.setItem(
        this.RELATIONSHIPS_KEY,
        JSON.stringify(this.relationships),
      );
    });
  }

  static async deleteRelationship(id: string): Promise<void> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      await this.ensureLoaded();
      if (this.relationships[id]) {
        delete this.relationships[id];
        this.rebuildIndex();
        await AsyncStorage.setItem(
          this.RELATIONSHIPS_KEY,
          JSON.stringify(this.relationships),
        );
      }
    });
  }

  static async deleteRelationshipsForEntities(entityIds: string[]): Promise<void> {
    if (!entityIds.length) return;
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      await this.ensureLoaded();
      const idsSet = new Set(entityIds);
      let changed = false;
      
      for (const id of Object.keys(this.relationships)) {
        const rel = this.relationships[id];
        if (idsSet.has(rel.source.id) || idsSet.has(rel.target.id)) {
          delete this.relationships[id];
          changed = true;
        }
      }
      
      if (changed) {
        this.rebuildIndex();
        await AsyncStorage.setItem(
          this.RELATIONSHIPS_KEY,
          JSON.stringify(this.relationships),
        );
      }
    });
  }

  static async getBacklinks(itemId: string): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      await this.ensureLoaded();
      const relIds = this.index.targetIndex[itemId] || [];
      return relIds.map((id) => this.relationships[id]).filter(Boolean);
    });
  }

  static async getForwardLinks(itemId: string): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      await this.ensureLoaded();
      const relIds = this.index.sourceIndex[itemId] || [];
      return relIds.map((id) => this.relationships[id]).filter(Boolean);
    });
  }

  static async getRelated(itemId: string): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      await this.ensureLoaded();
      const back = this.index.targetIndex[itemId] || [];
      const forward = this.index.sourceIndex[itemId] || [];
      const union = Array.from(new Set([...back, ...forward]));
      return union.map((id) => this.relationships[id]).filter(Boolean);
    });
  }

  // Focus Sessions
  static async saveFocusSession(session: any): Promise<void> {
    return withLock(this.FOCUS_SESSIONS_KEY, async () => {
      const raw = await AsyncStorage.getItem(this.FOCUS_SESSIONS_KEY);
      const sessions: any[] = raw ? JSON.parse(raw) : [];

      const taskId =
        session.taskId ||
        session.target?.id ||
        session.linkedItem?.id ||
        undefined;
      const duration =
        session.duration !== undefined
          ? session.duration
          : session.durationSeconds || 0;

      const cleanSession: FocusSession = {
        id: session.id,
        taskId,
        startedAt: session.startedAt,
        endedAt: session.endedAt || undefined,
        duration,
      };

      sessions.push(cleanSession);
      await AsyncStorage.setItem(
        this.FOCUS_SESSIONS_KEY,
        JSON.stringify(sessions),
      );
    });
  }

  static async getFocusSessions(): Promise<FocusSession[]> {
    return withLock(this.FOCUS_SESSIONS_KEY, async () => {
      const raw = await AsyncStorage.getItem(this.FOCUS_SESSIONS_KEY);
      const sessions: any[] = raw ? JSON.parse(raw) : [];
      return sessions.map((s: any) => ({
        id: s.id,
        taskId: s.taskId || s.target?.id || s.linkedItem?.id || undefined,
        startedAt: s.startedAt,
        endedAt: s.endedAt || undefined,
        duration: s.duration !== undefined ? s.duration : s.durationSeconds || 0,
      }));
    });
  }

  // System Event Logs
  static async logSystemEvent(event: any): Promise<void> {
    return withLock(this.SYSTEM_EVENT_LOG_KEY, async () => {
      const raw = await AsyncStorage.getItem(this.SYSTEM_EVENT_LOG_KEY);
      const logs: SystemEventLog[] = raw ? JSON.parse(raw) : [];

      const cleanLog: SystemEventLog = {
        id: event.id,
        workspaceId: event.workspaceId || INBOX_WORKSPACE_ID,
        itemId: event.itemId,
        itemType: event.itemType,
        action: event.action,
        timestamp: event.timestamp,
        metadata: event.metadata,
      };

      logs.push(cleanLog);
      await AsyncStorage.setItem(this.SYSTEM_EVENT_LOG_KEY, JSON.stringify(logs));
    });
  }

  static async getSystemEvents(
    workspaceId?: string,
  ): Promise<SystemEventLog[]> {
    return withLock(this.SYSTEM_EVENT_LOG_KEY, async () => {
      const raw = await AsyncStorage.getItem(this.SYSTEM_EVENT_LOG_KEY);
      const logs: SystemEventLog[] = raw ? JSON.parse(raw) : [];
      if (workspaceId) {
        return logs.filter((l) => l.workspaceId === workspaceId);
      }
      return logs;
    });
  }
}
