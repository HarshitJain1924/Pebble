import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemeSetting = 'light' | 'dark' | 'system';

const listeners = new Set<(theme: ThemeSetting) => void>();
let currentSetting: ThemeSetting = 'dark';

export function emitThemeChange(newTheme: ThemeSetting) {
  currentSetting = newTheme;
  listeners.forEach((l) => l(newTheme));
}

// Immediately attempt to fetch the stored setting on module load
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

export function useColorScheme() {
  const system = useSystemColorScheme() ?? 'dark';
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(currentSetting);

  useEffect(() => {
    // Sync current state on mount
    setThemeSetting(currentSetting);

    const listener = (newTheme: ThemeSetting) => {
      setThemeSetting(newTheme);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (themeSetting === 'system') {
    return system;
  }
  return themeSetting;
}
