import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { ResourceDetailContent } from "@/features/details/resources/ResourceDetailContent";

export default function ResourceDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    workspaceId?: string;
  }>();
  
  const itemId = params.id;
  const workspaceId = params.workspaceId;

  return (
    <ResourceDetailContent
      resourceId={itemId}
      workspaceId={workspaceId}
      onBack={() => router.back()}
    />
  );
}
