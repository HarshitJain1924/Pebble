---
name: react-native-developer
description: "Build production React Native apps with Expo or bare workflow. Covers navigation, state management, native modules, performance, and deployment."
category: mobile
tags: [react-native, javascript, mobile, ios, android]
complexity: advanced
risk: low
compatibility: [claude-code, antigravity, gemini-cli, cursor, copilot, codex-cli, autohand, kiro]
source: antigravity-official
version: "1.0.0"
date_added: "2026-07-10"
last_updated: "2026-07-10"
---

# React Native Developer

## Purpose
Build high-quality cross-platform mobile apps using React Native with proper architecture, navigation, and performance optimization.

## Project Setup

### Expo (Recommended for most apps)
```bash
npx create-expo-app@latest MyApp --template blank-typescript
cd MyApp
npx expo install expo-router expo-constants expo-linking

# Run on device
npx expo start
```

### Navigation with Expo Router (File-based)
```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#6366F1" }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <HomeIcon color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

// app/(tabs)/index.tsx - automatically becomes the home tab
export default function HomeScreen() {
  return <View><Text>Home</Text></View>;
}

// Deep link: myapp://posts/123
// app/posts/[id].tsx
export default function PostScreen() {
  const { id } = useLocalSearchParams();
  return <PostDetail id={id as string} />;
}
```

### State Management with Zustand
```typescript
// stores/authStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### Performance Optimization
```typescript
// Use memo for expensive computations
const expensiveData = useMemo(() => processData(rawData), [rawData]);

// Virtualized lists for long data
<FlashList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  estimatedItemSize={80}  // Crucial for FlashList performance
  keyExtractor={(item) => item.id}
/>

// Image optimization
import { Image } from "expo-image";
<Image
  source={imageUrl}
  placeholder={blurhash}
  contentFit="cover"
  transition={300}
  style={{ width: 200, height: 200 }}
/>

// Avoid inline styles and arrow functions in render
// ❌ <View style={{ marginTop: 16 }}>
// ✅ <View style={styles.container}>
const styles = StyleSheet.create({ container: { marginTop: 16 } });
```

### Push Notifications (Expo)
```typescript
import * as Notifications from "expo-notifications";

async function registerForPushNotifications(): Promise<string | undefined> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return undefined;

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  
  return token.data;
}

// Send push notification from backend
const response = await fetch("https://exp.host/--/api/v2/push/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    to: pushToken,
    title: "New Message",
    body: "You have a new message",
    data: { screen: "Messages", id: messageId },
  }),
});
```

## Outputs
1. Project structure with Expo Router
2. Navigation configuration
3. State management setup
4. API integration with error handling
5. Push notification implementation
6. EAS Build configuration for deployment
