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

  private static normalizeRelationship(rel: Relationship): Relationship {
    if (rel.relationType === "related" && rel.source.id > rel.target.id) {
      return {
        ...rel,
        source: rel.target,
        target: rel.source,
      };
    }
    return rel;
  }

  private static findMatchingEdge(candidate: Relationship): Relationship | undefined {
    const isUndirected = candidate.relationType === "related";
    for (const rel of Object.values(this.relationships)) {
      if (rel.relationType !== candidate.relationType) continue;
      if (rel.source.id === candidate.source.id && rel.target.id === candidate.target.id) {
        return rel;
      }
      if (
        isUndirected &&
        rel.source.id === candidate.target.id &&
        rel.target.id === candidate.source.id
      ) {
        return rel;
      }
    }
    return undefined;
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

  /**
   * Internal unlocked loader. Assumes caller holds lock or is in a single-threaded context.
   */
  static async ensureLoadedUnlocked(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(this.RELATIONSHIPS_KEY);
      this.relationships = raw ? JSON.parse(raw) : {};
      this.rebuildIndex();
      this.loaded = true;
    } catch (e) {
      console.error("[GraphRepository] Failed to load relationships", e);
      throw e;
    }
  }

  static async saveRelationshipUnlocked(rawRel: Relationship): Promise<Relationship> {
    await this.ensureLoadedUnlocked();
    const rel = this.normalizeRelationship(rawRel);

    const existing = this.findMatchingEdge(rel);
    if (existing) {
      // If endpoints match logically, update generation metadata if provided, otherwise idempotent return
      let needsUpdate = false;
      if (
        rel.source.lifecycleGeneration !== undefined &&
        existing.source.lifecycleGeneration !== rel.source.lifecycleGeneration
      ) {
        existing.source.lifecycleGeneration = rel.source.lifecycleGeneration;
        needsUpdate = true;
      }
      if (
        rel.target.lifecycleGeneration !== undefined &&
        existing.target.lifecycleGeneration !== rel.target.lifecycleGeneration
      ) {
        existing.target.lifecycleGeneration = rel.target.lifecycleGeneration;
        needsUpdate = true;
      }

      if (needsUpdate) {
        const snapshot = { ...this.relationships };
        this.relationships[existing.id] = existing;
        this.rebuildIndex();
        try {
          await AsyncStorage.setItem(
            this.RELATIONSHIPS_KEY,
            JSON.stringify(this.relationships),
          );
        } catch (e) {
          this.relationships = snapshot;
          this.rebuildIndex();
          throw e;
        }
      }
      return existing;
    }

    const snapshot = { ...this.relationships };
    this.relationships[rel.id] = rel;
    this.rebuildIndex();

    try {
      await AsyncStorage.setItem(
        this.RELATIONSHIPS_KEY,
        JSON.stringify(this.relationships),
      );
      return rel;
    } catch (e) {
      this.relationships = snapshot;
      this.rebuildIndex();
      throw e;
    }
  }

  static async deleteRelationshipUnlocked(id: string): Promise<boolean> {
    await this.ensureLoadedUnlocked();
    if (!this.relationships[id]) {
      return false;
    }

    const snapshot = { ...this.relationships };
    delete this.relationships[id];
    this.rebuildIndex();

    try {
      await AsyncStorage.setItem(
        this.RELATIONSHIPS_KEY,
        JSON.stringify(this.relationships),
      );
      return true;
    } catch (e) {
      this.relationships = snapshot;
      this.rebuildIndex();
      throw e;
    }
  }

  static async deleteRelationshipsForEntitiesUnlocked(entityIds: string[]): Promise<number> {
    if (!entityIds.length) return 0;
    await this.ensureLoadedUnlocked();
    const idsSet = new Set(entityIds);
    const snapshot = { ...this.relationships };
    let removedCount = 0;

    for (const id of Object.keys(this.relationships)) {
      const rel = this.relationships[id];
      if (idsSet.has(rel.source.id) || idsSet.has(rel.target.id)) {
        delete this.relationships[id];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.rebuildIndex();
      try {
        await AsyncStorage.setItem(
          this.RELATIONSHIPS_KEY,
          JSON.stringify(this.relationships),
        );
      } catch (e) {
        this.relationships = snapshot;
        this.rebuildIndex();
        throw e;
      }
    }

    return removedCount;
  }

  static async getBacklinksUnlocked(itemId: string): Promise<Relationship[]> {
    await this.ensureLoadedUnlocked();
    const relIds = this.index.targetIndex[itemId] || [];
    return relIds.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getForwardLinksUnlocked(itemId: string): Promise<Relationship[]> {
    await this.ensureLoadedUnlocked();
    const relIds = this.index.sourceIndex[itemId] || [];
    return relIds.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getRelatedUnlocked(itemId: string): Promise<Relationship[]> {
    await this.ensureLoadedUnlocked();
    const back = this.index.targetIndex[itemId] || [];
    const forward = this.index.sourceIndex[itemId] || [];
    const union = Array.from(new Set([...back, ...forward]));
    return union.map((id) => this.relationships[id]).filter(Boolean);
  }

  static async getAllRelationshipsUnlocked(): Promise<Relationship[]> {
    await this.ensureLoadedUnlocked();
    return Object.values(this.relationships);
  }

  static async saveRelationship(rel: Relationship): Promise<Relationship> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.saveRelationshipUnlocked(rel);
    });
  }

  static async deleteRelationship(id: string): Promise<boolean> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.deleteRelationshipUnlocked(id);
    });
  }

  static async deleteRelationshipsForEntities(entityIds: string[]): Promise<number> {
    if (!entityIds.length) return 0;
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.deleteRelationshipsForEntitiesUnlocked(entityIds);
    });
  }

  static async getBacklinks(itemId: string): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.getBacklinksUnlocked(itemId);
    });
  }

  static async getForwardLinks(itemId: string): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.getForwardLinksUnlocked(itemId);
    });
  }

  static async getRelated(itemId: string): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.getRelatedUnlocked(itemId);
    });
  }

  static async getAllRelationships(): Promise<Relationship[]> {
    return withLock(this.RELATIONSHIPS_KEY, async () => {
      return this.getAllRelationshipsUnlocked();
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
