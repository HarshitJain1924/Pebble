/**
 * repositories.ts
 * ────────────────
 * Barrel re-export for all repository classes.
 * Consumers can continue importing from "@/services/core/repositories"
 * while the individual implementations live in separate files.
 */
export { FolderRepository } from "./folder-repository";
export { ActivityRepository } from "./activity-repository";
export { ResourceRepository } from "./resource-repository";
export { GraphRepository } from "./graph-repository";
export { RecycleBinRepository } from "./recycle-bin-repository";
export { UiStateRepository } from "./ui-state-repository";
export { clearRepositoryStorage } from "./storage-utils";