/**
 * ResourceRepository.ts
 * ────────────────────────
 * Resource persistence — partitioned by workspaceId using canonical Resource model.
 */
import {
  INBOX_WORKSPACE_ID,
  type Attachment,
  type Resource,
  type ResourceType,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withLock } from "@/shared/utils/mutex";

export function normalizeResource(
  rawResource: any,
  defaultWorkspaceId: string,
): Resource {
  const wsId = rawResource.workspaceId || defaultWorkspaceId;

  // Determine type
  let type: ResourceType = "note";
  const rawType =
    rawResource.type || rawResource.resourceType || rawResource.kind;
  if (rawType === "link" || rawType === "idea" || rawType === "note") {
    type = rawType as ResourceType;
  } else if (rawType === "file") {
    type = "note";
  }

  // Construct body string from legacy body/content/url fields
  let bodyStr: string | undefined = rawResource.body;
  if (typeof bodyStr !== "string") {
    if (typeof rawResource.content === "string") {
      bodyStr = rawResource.content;
    } else if (typeof rawResource.url === "string") {
      bodyStr = rawResource.url;
    } else if (
      rawResource.body &&
      typeof rawResource.body.content === "string"
    ) {
      bodyStr = rawResource.body.content;
    } else if (rawResource.body && typeof rawResource.body.url === "string") {
      bodyStr = rawResource.body.url;
    } else if (
      rawResource.payload &&
      typeof rawResource.payload.content === "string"
    ) {
      bodyStr = rawResource.payload.content;
    } else if (
      rawResource.payload &&
      typeof rawResource.payload.url === "string"
    ) {
      bodyStr = rawResource.payload.url;
    } else {
      bodyStr = undefined;
    }
  }

  // Construct attachments if legacy file URI exists
  let attachments: Attachment[] | undefined = rawResource.attachments;
  if (
    !attachments &&
    (rawResource.localUri ||
      rawResource.mediaUri ||
      (rawResource.body && rawResource.body.localUri))
  ) {
    const uri =
      rawResource.localUri ||
      rawResource.mediaUri ||
      rawResource.body?.localUri;
    if (uri) {
      attachments = [
        {
          id: `att-${Date.now()}`,
          name: rawResource.fileName || rawResource.title || "File Attachment",
          uri,
          mimeType:
            rawResource.mimeType ||
            rawResource.body?.mimeType ||
            "application/octet-stream",
          size: rawResource.fileSize || rawResource.body?.fileSize,
        },
      ];
    }
  }

  return {
    id: rawResource.id,
    workspaceId: wsId,
    type,
    title: rawResource.title || "",
    body: bodyStr || undefined,
    tags: rawResource.tags || undefined,
    attachments: attachments || undefined,
    createdAt: rawResource.createdAt || Date.now(),
    updatedAt: rawResource.updatedAt || Date.now(),
    archivedAt:
      rawResource.archivedAt || (rawResource.archived ? Date.now() : undefined),
  };
}

export class ResourceRepository {
  private static validateId(id: unknown, method: string): asserts id is string {
    if (
      id === undefined ||
      id === null ||
      typeof id !== "string" ||
      id.trim().length === 0
    ) {
      throw new Error(`ResourceRepository.${method}: resource.id is required`);
    }
  }

  private static getResourcesKey(workspaceId: string) {
    return `pebble:v1:resources:${workspaceId}`;
  }

  /**
   * Parse a stored workspace payload defensively. Malformed JSON (e.g. from a
   * partial write or corrupted storage) must never crash the consuming screen;
   * following the repository's tolerant recovery convention, the payload is
   * logged and treated as empty so callers see a missing/empty collection.
   */
  private static parseRecords(
    raw: string,
    key: string,
    method: string,
  ): Record<string, any> {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
      console.warn(
        `[ResourceRepository] Stored value for "${key}" is not a JSON object (${method}); treating as empty.`,
      );
      return {};
    } catch (e) {
      console.warn(
        `[ResourceRepository] Failed to parse stored value for "${key}" (${method}); treating as empty.`,
        e,
      );
      return {};
    }
  }

  static async getResource(
    id: string,
    workspaceId: string,
  ): Promise<Resource | null> {
    const key = this.getResourcesKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const records: Record<string, any> = this.parseRecords(raw, key, "getResource");
    const rawResource = records[id] || null;
    if (rawResource) {
      return normalizeResource(rawResource, workspaceId);
    }
    return null;
  }

  static async getResources(
    workspaceId: string,
  ): Promise<Record<string, Resource>> {
    const key = this.getResourcesKey(workspaceId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = this.parseRecords(raw, key, "getResources");
    const records: Record<string, Resource> = {};
    Object.entries(parsed).forEach(([id, rawResource]: [string, any]) => {
      records[id] = normalizeResource(rawResource, workspaceId);
    });
    return records;
  }

  static async saveResource(resource: any): Promise<void> {
    this.validateId(resource?.id, "saveResource");
    const workspaceId = resource.workspaceId || INBOX_WORKSPACE_ID;
    const key = this.getResourcesKey(workspaceId);
    
    await withLock(key, async () => {
      const records = await this.getResources(workspaceId);

      const cleanResource: Resource = normalizeResource(resource, workspaceId);
      cleanResource.updatedAt = Date.now();

      records[resource.id] = cleanResource;
      await AsyncStorage.setItem(key, JSON.stringify(records));
    });
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler
   * to restore resources into a partition while the canonical lock is held dynamically.
   */
  static async saveResourcesUnlocked(resources: any[], workspaceId: string): Promise<void> {
    const key = this.getResourcesKey(workspaceId);
    const records = await this.getResources(workspaceId);
    for (const resource of resources) {
      this.validateId(resource?.id, "saveResourcesUnlocked");
      const cleanResource: Resource = normalizeResource(resource, workspaceId);
      cleanResource.updatedAt = Date.now();
      records[resource.id] = cleanResource;
    }
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteResource(id: string, workspaceId: string): Promise<void> {
    const key = this.getResourcesKey(workspaceId);
    await withLock(key, async () => {
      const records = await this.getResources(workspaceId);
      if (records[id]) {
        delete records[id];
        await AsyncStorage.setItem(key, JSON.stringify(records));
      }
    });
  }

  /**
   * Unlocked persistence primitive required specifically for WorkspaceCommandHandler.deleteWorkspace
   * to physically wipe the active partition safely under dynamically held locks.
   */
  static async deletePartitionUnlocked(workspaceId: string): Promise<void> {
    const key = this.getResourcesKey(workspaceId);
    await AsyncStorage.removeItem(key);
  }
}
