import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

export type ThemeSetting = 'light' | 'dark' | 'system';

const listeners = new Set<(theme: ThemeSetting) => void>();
let currentSetting: ThemeSetting = 'dark';

export function emitThemeChange(newTheme: ThemeSetting) {
  currentSetting = newTheme;
  listeners.forEach((l) => l(newTheme));
}

// Immediately attempt to fetch the stored setting on module load
if (typeof window !== 'undefined') {
  AsyncStorage.getItem('todoapp:settings:v1').then((raw) => {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.theme) {
          currentSetting = parsed.theme;
          emitThemeChange(parsed.theme);
        }
      } catch {}
    }
  });
}

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const system = useRNColorScheme() ?? 'dark';
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(currentSetting);

  useEffect(() => {
    setHasHydrated(true);
    setThemeSetting(currentSetting);

    const listener = (newTheme: ThemeSetting) => {
      setThemeSetting(newTheme);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!hasHydrated) {
    return 'dark';
  }

  if (themeSetting === 'system') {
    return system;
  }
  return themeSetting;
}
