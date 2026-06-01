import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import type {
  ExpoSpeechRecognitionModule as ModuleType,
  useSpeechRecognitionEvent as HookType,
} from "expo-speech-recognition";

// 1. Detect if the native speech module is present to prevent crashes in Expo Go
let hasNativeModule = false;
if (Platform.OS === "web") {
  hasNativeModule = true; // Web uses SpeechRecognition Web API
} else {
  try {
    hasNativeModule = !!requireNativeModule("ExpoSpeechRecognition");
  } catch {
    hasNativeModule = false;
  }
}

// 2. Define stubs for native-less environments (like Expo Go)
const stubModule = {
  start: () => {},
  stop: () => {},
  abort: () => {},
  requestPermissionsAsync: async () => ({ granted: false }),
  getPermissionsAsync: async () => ({ granted: false }),
  getServicesAsync: async () => [],
  getStateAsync: async () => "inactive",
};

const stubHook = () => {};

// 3. Load native speech library dynamically if module exists
let runtimeModule: any = stubModule;
let runtimeHook: any = stubHook;

if (hasNativeModule) {
  try {
    const SpeechLib = require("expo-speech-recognition");
    runtimeModule = SpeechLib.ExpoSpeechRecognitionModule;
    runtimeHook = SpeechLib.useSpeechRecognitionEvent;
  } catch (e) {
    console.warn("Failed to load expo-speech-recognition native module", e);
  }
}

// 4. Export type-safe wrappers
export const ExpoSpeechRecognitionModule = runtimeModule as typeof ModuleType;
export const useSpeechRecognitionEvent = runtimeHook as typeof HookType;

export class SpeechRecognitionService {
  private static isAvailableCache: boolean | null = null;

  /**
   * Checks if speech recognition is available on this platform/device.
   */
  static async checkAvailability(): Promise<boolean> {
    if (!hasNativeModule && Platform.OS !== "web") {
      return false; // Native module is missing (Expo Go)
    }

    if (this.isAvailableCache !== null) {
      return this.isAvailableCache;
    }

    if (Platform.OS === "web") {
      const WebSpeech =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.isAvailableCache = !!WebSpeech;
      return this.isAvailableCache;
    }

    try {
      const services = await ExpoSpeechRecognitionModule.getServicesAsync();
      this.isAvailableCache = services.length > 0;
      return this.isAvailableCache;
    } catch {
      this.isAvailableCache = false;
      return false;
    }
  }

  /**
   * Requests permissions for microphone access and speech recognition.
   */
  static async requestPermissions(): Promise<boolean> {
    if (!hasNativeModule) {
      return false;
    }
    if (Platform.OS === "web") {
      return true;
    }

    try {
      const response = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return response.granted;
    } catch (e) {
      console.warn("Speech recognition permission request failed:", e);
      return false;
    }
  }

  /**
   * Checks current permission status.
   */
  static async checkPermissions(): Promise<boolean> {
    if (!hasNativeModule) {
      return false;
    }
    if (Platform.OS === "web") {
      return true;
    }

    try {
      const response = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      return response.granted;
    } catch {
      return false;
    }
  }
}
