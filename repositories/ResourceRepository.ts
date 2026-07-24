/**
 * ResourceRepository.ts
 * ────────────────────────
 * Resource (notes, ideas, links, files) persistence — partitioned by folderId.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_FOLDER_ID, type Resource } from "@/shared/types/repository.types";

export class ResourceRepository {
  private static getResourcesKey(folderId: string) {
    return `pebble:v1:resources:${folderId}`;
  }

  private static getLegacyResourcesKey(folderId: string) {
    return `pebble:core:resources:${folderId}`;
  }

  static async getResource(id: string, folderId: string): Promise<Resource | null> {
    const key = this.getResourcesKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyResourcesKey(folderId));
    }
    if (!raw) return null;
    const records: Record<string, Resource> = JSON.parse(raw);
    const resource = records[id] || null;
    if (resource) {
      return {
        ...resource,
        workspaceId: resource.folderId || folderId,
        payload: resource.body || resource.payload || {},
      } as any;
    }
    return null;
  }

  static async getResources(folderId: string): Promise<Record<string, Resource>> {
    const key = this.getResourcesKey(folderId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw) {
      raw = await AsyncStorage.getItem(this.getLegacyResourcesKey(folderId));
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const records: Record<string, any> = {};
    Object.entries(parsed).forEach(([id, resource]: [string, any]) => {
      records[id] = {
        ...resource,
        workspaceId: resource.folderId || folderId,
        payload: resource.body || resource.payload || {},
        body: resource.body || resource.payload || {},
      };
    });
    return records;
  }

  static async saveResource(resource: any): Promise<void> {
    const folderId = resource.folderId || resource.workspaceId || DEFAULT_FOLDER_ID;
    const key = this.getResourcesKey(folderId);
    const records = await this.getResources(folderId);

    const body = resource.body || resource.payload || {};

    const cleanResource: Resource = {
      id: resource.id,
      folderId,
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

  static async deleteResource(id: string, folderId: string): Promise<void> {
    const key = this.getResourcesKey(folderId);
    const records = await this.getResources(folderId);
    if (records[id]) {
      delete records[id];
      await AsyncStorage.setItem(key, JSON.stringify(records));
    }
  }
}