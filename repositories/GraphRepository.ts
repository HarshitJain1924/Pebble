/**
 * graph-repository.ts
 * ─────────────────────
 * Relationship graph, focus sessions, and system event log persistence.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOLDER_ID, type Relationship, type FocusSession, type SystemEventLog } from "@/shared/types/repository.types";

export interface RelationshipIndex {
  sourceIndex: Record<string, string[]>;
  targetIndex: Record<string, string[]>;
}

export class GraphRepository {
  private static readonly RELATIONSHIPS_KEY = "pebble:core:relationships";
  private static readonly FOCUS_SESSIONS_KEY = "pebble:core:focus_sessions";
  private static readonly SYSTEM_EVENT_LOG_KEY = "pebble:core:system_event_log";

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
      console.warn("Failed to load relationships", e);
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
    await this.ensureLoaded();
    this.relationships[rel.id] = rel;
    this.rebuildIndex();
    await AsyncStorage.setItem(this.RELATIONSHIPS_KEY, JSON.stringify(this.relationships));
  }

  static async deleteRelationship(id: string): Promise<void> {
    await this.ensureLoaded();
    if (this.relationships[id]) {
      delete this.relationships[id];
      this.rebuildIndex();
      await AsyncStorage.setItem(this.RELATIONSHIPS_KEY, JSON.stringify(this.relationships));
    }
  }

  static async getBacklinks(itemId: string): Promise<Relationship[]> {
    await this.ensureLoaded();
    const relIds = this.index.targetIndex[itemId] || [];
    return relIds.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getForwardLinks(itemId: string): Promise<Relationship[]> {
    await this.ensureLoaded();
    const relIds = this.index.sourceIndex[itemId] || [];
    return relIds.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getRelated(itemId: string): Promise<Relationship[]> {
    await this.ensureLoaded();
    const back = this.index.targetIndex[itemId] || [];
    const forward = this.index.sourceIndex[itemId] || [];
    const union = Array.from(new Set([...back, ...forward]));
    return union.map((id) => this.relationships[id]).filter(Boolean);
  }

  // Focus Sessions
  static async saveFocusSession(session: any): Promise<void> {
    const raw = await AsyncStorage.getItem(this.FOCUS_SESSIONS_KEY);
    const sessions: FocusSession[] = raw ? JSON.parse(raw) : [];

    const folderId = session.folderId || session.workspaceId || DEFAULT_FOLDER_ID;
    const target = session.target || session.linkedItem || { id: "", type: "task" };

    const cleanSession: FocusSession = {
      id: session.id,
      folderId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      target,
      workspaceId: folderId,
      linkedItem: target,
    } as any;

    sessions.push(cleanSession);
    await AsyncStorage.setItem(this.FOCUS_SESSIONS_KEY, JSON.stringify(sessions));
  }

  static async getFocusSessions(folderId?: string): Promise<FocusSession[]> {
    const raw = await AsyncStorage.getItem(this.FOCUS_SESSIONS_KEY);
    const sessions: FocusSession[] = raw ? JSON.parse(raw) : [];
    if (folderId) {
      return sessions.filter(
        (s) => s.folderId === folderId || (s as any).workspaceId === folderId,
      );
    }
    return sessions;
  }

  // System Event Logs
  static async logSystemEvent(event: any): Promise<void> {
    const raw = await AsyncStorage.getItem(this.SYSTEM_EVENT_LOG_KEY);
    const logs: SystemEventLog[] = raw ? JSON.parse(raw) : [];

    const folderId = event.folderId || event.workspaceId || DEFAULT_FOLDER_ID;

    const cleanLog: SystemEventLog = {
      id: event.id,
      folderId,
      itemId: event.itemId,
      itemType: event.itemType,
      action: event.action,
      timestamp: event.timestamp,
      metadata: event.metadata,
      workspaceId: folderId,
    } as any;

    logs.push(cleanLog);
    await AsyncStorage.setItem(this.SYSTEM_EVENT_LOG_KEY, JSON.stringify(logs));
  }

  static async getSystemEvents(folderId?: string): Promise<SystemEventLog[]> {
    const raw = await AsyncStorage.getItem(this.SYSTEM_EVENT_LOG_KEY);
    const logs: SystemEventLog[] = raw ? JSON.parse(raw) : [];
    if (folderId) {
      return logs.filter(
        (l) => l.folderId === folderId || (l as any).workspaceId === folderId,
      );
    }
    return logs;
  }
}