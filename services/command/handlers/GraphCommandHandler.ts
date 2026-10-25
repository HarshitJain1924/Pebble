/**
 * GraphCommandHandler.ts
 * ──────────────────────────────────────────
 * Canonical command handler for relationship graph mutations.
 *
 * Enforces referential integrity, idempotency, duplicate prevention,
 * and post-commit state event emission.
 */

import { GraphRepository } from "@/repositories/GraphRepository";
import { generateId } from "@/shared/utils/id";
import { emitStateChange } from "@/services/events/state-events";
import type { Relationship } from "@/shared/types/domain.types";
import type { CreateEntityOptions } from "../types/command.types";

export class GraphCommandHandler {
  /**
   * Creates or updates a relationship edge in the graph.
   * Idempotent: returns existing relationship if logical edge already exists.
   */
  static async createRelationship(
    input: Omit<Relationship, "id" | "createdAt"> & {
      id?: string;
      createdAt?: number;
    },
    options?: CreateEntityOptions,
  ): Promise<Relationship> {
    if (!input.source?.id || !input.target?.id) {
      throw new Error(
        "[GraphCommandHandler] createRelationship requires valid source and target endpoints",
      );
    }

    const rel: Relationship = {
      id: input.id || generateId("rel-"),
      source: input.source,
      target: input.target,
      relationType: input.relationType,
      createdAt: input.createdAt || Date.now(),
    };

    const saved = await GraphRepository.saveRelationship(rel);

    if (!options?.skipEvents) {
      emitStateChange("graph_changed", options?.source || "graph_command_handler");
    }

    return saved;
  }

  /**
   * Deletes a relationship by its unique ID.
   */
  static async deleteRelationship(
    id: string,
    options?: CreateEntityOptions,
  ): Promise<boolean> {
    const removed = await GraphRepository.deleteRelationship(id);
    if (removed && !options?.skipEvents) {
      emitStateChange("graph_changed", options?.source || "graph_command_handler");
    }
    return removed;
  }

  /**
   * Deletes all relationships connected to any of the specified entity IDs.
   */
  static async deleteRelationshipsForEntities(
    entityIds: string[],
    options?: CreateEntityOptions,
  ): Promise<number> {
    const removedCount =
      await GraphRepository.deleteRelationshipsForEntities(entityIds);
    if (removedCount > 0 && !options?.skipEvents) {
      emitStateChange("graph_changed", options?.source || "graph_command_handler");
    }
    return removedCount;
  }

  static async getRelated(itemId: string): Promise<Relationship[]> {
    return GraphRepository.getRelated(itemId);
  }

  static async getBacklinks(itemId: string): Promise<Relationship[]> {
    return GraphRepository.getBacklinks(itemId);
  }

  static async getForwardLinks(itemId: string): Promise<Relationship[]> {
    return GraphRepository.getForwardLinks(itemId);
  }

  static async getAllRelationships(): Promise<Relationship[]> {
    return GraphRepository.getAllRelationships();
  }
}
