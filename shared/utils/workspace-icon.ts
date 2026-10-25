import { Feather } from "@expo/vector-icons";
import type { Workspace } from "@/shared/types/domain.types";

/** Workspace icons are Feather-only in the UI. Legacy emoji fields stay readable for storage compatibility. */
export function getWorkspaceIconName(
  workspace?: Pick<Workspace, "icon"> | null,
): keyof typeof Feather.glyphMap {
  const icon = workspace?.icon;
  return icon && icon in Feather.glyphMap
    ? (icon as keyof typeof Feather.glyphMap)
    : "folder";
}
