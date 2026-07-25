/**
 * ResourceRepository.ts
 * ────────────────────────
 * Resource (notes, ideas, links, files) persistence — partitioned by workspaceId.
 */
import {
  DEFAULT_WORKSPACE_ID,
  type Resource,
} from "@/shared/types/repository.types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class ResourceRepository {
  private static getResourcesKey(workspaceId: string) {
    return `pebble:v1:resources:${workspaceId}`;
  }

  private static getLegacyResourcesKey(workspaceId: string) {
    return `pebble:core:resources:${workspaceId}`;
  }

  static async getResource(
    id: string,
    workspaceId: string,
  ): Promise<Resource | null> {
    const key = this.getResourcesKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyResourcesKey(workspaceId));
    }
    if (!raw) return null;
    const records: Record<string, Resource> = JSON.parse(raw);
    const resource = records[id] || null;
    if (resource) {
      return {
        ...resource,
        workspaceId: resource.workspaceId || workspaceId,
        payload: resource.body || resource.payload || {},
      } as any;
    }
    return null;
  }

  static async getResources(
    workspaceId: string,
  ): Promise<Record<string, Resource>> {
    const key = this.getResourcesKey(workspaceId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyResourcesKey(workspaceId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, resource]: [string, any]) => {
      records[id] = {
        ...resource,
        workspaceId: resource.workspaceId || workspaceId,
        payload: resource.body || resource.payload || {},
        body: resource.body || resource.payload || {},
      };
    });
    return records;
  }

  static async saveResource(resource: any): Promise<void> {
    const workspaceId = resource.workspaceId || DEFAULT_WORKSPACE_ID;
    const key = this.getResourcesKey(workspaceId);
    const records = await this.getResources(workspaceId);

    const body = resource.body || resource.payload || {};

    const cleanResource: Resource = {
      id: resource.id,
      workspaceId,
      title: resource.title,
      resourceType: resource.resourceType,
      createdAt: resource.createdAt || Date.now(),
      updatedAt: Date.now(),
      archived: resource.archived || false,
      pinned: resource.pinned || false,
      tags: resource.tags || [],
      body,
    };

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
