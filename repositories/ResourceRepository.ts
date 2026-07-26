/**
 * ResourceRepository.ts
 * ────────────────────────
 * Resource persistence — partitioned by workspaceId using canonical Resource model.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type Resource,
  type ResourceType,
  type Attachment,
} from "@/shared/types/domain.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function normalizeResource(rawResource: any, defaultWorkspaceId: string): Resource {
  const wsId = rawResource.workspaceId || rawResource.folderId || defaultWorkspaceId;

  // Determine type
  let type: ResourceType = "note";
  const rawType = rawResource.type || rawResource.resourceType || rawResource.kind;
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
    } else if (rawResource.body && typeof rawResource.body.content === "string") {
      bodyStr = rawResource.body.content;
    } else if (rawResource.body && typeof rawResource.body.url === "string") {
      bodyStr = rawResource.body.url;
    } else if (rawResource.payload && typeof rawResource.payload.content === "string") {
      bodyStr = rawResource.payload.content;
    } else if (rawResource.payload && typeof rawResource.payload.url === "string") {
      bodyStr = rawResource.payload.url;
    } else {
      bodyStr = undefined;
    }
  }

  // Construct attachments if legacy file URI exists
  let attachments: Attachment[] | undefined = rawResource.attachments;
  if (!attachments && (rawResource.localUri || rawResource.mediaUri || (rawResource.body && rawResource.body.localUri))) {
    const uri = rawResource.localUri || rawResource.mediaUri || rawResource.body?.localUri;
    if (uri) {
      attachments = [
        {
          id: `att-${Date.now()}`,
          name: rawResource.fileName || rawResource.title || "File Attachment",
          uri,
          mimeType: rawResource.mimeType || rawResource.body?.mimeType || "application/octet-stream",
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
    archivedAt: rawResource.archivedAt || (rawResource.archived ? Date.now() : undefined),
  };
}

export class ResourceRepository {
  private static getResourcesKey(workspaceId: string) {
    return `pebble:v1:resources:${workspaceId}`;
  }

  private static getLegacyResourcesKey(workspaceId: string) {
    return `pebble:core:resources:${workspaceId}`;
  }

  static async getResource(
    id: string,
    workspaceId: string
  ): Promise<Resource | null> {
    const key = this.getResourcesKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyResourcesKey(workspaceId));
    }
    if (!raw) return null;
    const records: Record<string, any> = JSON.parse(raw);
    const rawResource = records[id] || null;
    if (rawResource) {
      return normalizeResource(rawResource, workspaceId);
    }
    return null;
  }

  static async getResources(
    workspaceId: string
  ): Promise<Record<string, Resource>> {
    const key = this.getResourcesKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyResourcesKey(workspaceId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, Resource> = {};
    Object.entries(parsed).forEach(([id, rawResource]: [string, any]) => {
      records[id] = normalizeResource(rawResource, workspaceId);
    });
    return records;
  }

  static async saveResource(resource: any): Promise<void> {
    const workspaceId = resource.workspaceId || DEFAULT_WORKSPACE_ID;
    const key = this.getResourcesKey(workspaceId);
    const records = await this.getResources(workspaceId);

    const cleanResource: Resource = normalizeResource(resource, workspaceId);
    cleanResource.updatedAt = Date.now();

    records[resource.id] = cleanResource;
    await AsyncStorage.setItem(key, JSON.stringify(records));
  }

  static async deleteResource(id: string, workspaceId: string): Promise<void> {
    const key = this.getResourcesKey(workspaceId);
    const records = await this.getResources(workspaceId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}
