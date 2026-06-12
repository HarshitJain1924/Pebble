import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// Types
export interface SpeechRecognitionResultEvent {
  results: { transcript: string }[];
  isFinal: boolean;
}

export interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface SpeechRecognitionVolumeEvent {
  value: number;
}

type EventCallbackMap = {
  result: (event: SpeechRecognitionResultEvent) => void;
  end: () => void;
  error: (event: SpeechRecognitionErrorEvent) => void;
  volumechange: (event: SpeechRecognitionVolumeEvent) => void;
};

// Global event listeners registry
const listeners: { [K in keyof EventCallbackMap]?: Set<EventCallbackMap[K]> } = {
  result: new Set(),
  end: new Set(),
  error: new Set(),
  volumechange: new Set(),
};

function emitEvent<K extends keyof EventCallbackMap>(event: K, payload?: any) {
  listeners[event]?.forEach((cb: any) => {
    try {
      cb(payload);
    } catch (e) {
      console.error(`Error in voice event listener for ${event}:`, e);
    }
  });
}

// Browser/Web Speech Recognition implementation
let webRecognition: any = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let microphone: MediaStreamAudioSourceNode | null = null;
let javascriptNode: ScriptProcessorNode | null = null;
let volumeInterval: any = null;

if (Platform.OS === "web" && typeof window !== "undefined") {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (SpeechRecognition) {
    webRecognition = new SpeechRecognition();
    webRecognition.continuous = true;
    webRecognition.interimResults = true;

    webRecognition.onresult = (event: any) => {
      const results = [];
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        results.push({
          transcript: event.results[i][0].transcript,
        });
        if (event.results[i].isFinal) {
          isFinal = true;
        }
      }
      emitEvent("result", { results, isFinal });
    };

    webRecognition.onerror = (event: any) => {
      emitEvent("error", { error: event.error, message: event.message });
    };

    webRecognition.onend = () => {
      emitEvent("end");
      stopVolumeDetection();
    };
  }
}

function startVolumeDetection() {
  if (typeof window === "undefined" || !navigator.mediaDevices) return;
  navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    .then((stream) => {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(stream);
      javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);

      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser!.frequencyBinCount);
        analyser!.getByteFrequencyData(array);
        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
          values += array[i];
        }
        const average = values / length;
        // Map average volume (0-255) to decibels / level (-2 to 10 range approximately)
        const dbLevel = (average / 255) * 12 - 2;
        emitEvent("volumechange", { value: dbLevel });
      };
    })
    .catch((err) => {
      console.warn("Volume meter failed:", err);
    });
}

function stopVolumeDetection() {
  try {
    if (javascriptNode) javascriptNode.disconnect();
    if (microphone) microphone.disconnect();
    if (audioContext) audioContext.close();
    javascriptNode = null;
    microphone = null;
    audioContext = null;
  } catch (e) {
    console.warn("Error stopping volume detection:", e);
  }
}

// Safe native imports
let NativeModule: any = null;
let nativeUseEvent: any = null;
try {
  if (Platform.OS !== "web") {
    const speechLib = require("expo-speech-recognition");
    NativeModule = speechLib.ExpoSpeechRecognitionModule;
    nativeUseEvent = speechLib.useSpeechRecognitionEvent;
  }
} catch (e) {
  console.warn("Native expo-speech-recognition import failed:", e);
}

// 1. ExpoSpeechRecognitionModule Implementation
export const ExpoSpeechRecognitionModule = {
  start(options: { lang?: string; interimResults?: boolean; volumeChangeEventOptions?: { enabled: boolean; intervalMillis: number } }) {
    if (Platform.OS === "web") {
      if (!webRecognition) {
        console.warn("Speech recognition not supported on this browser.");
        emitEvent("error", { error: "not-supported", message: "Web Speech API is not supported in this browser." });
        return;
      }
      try {
        webRecognition.lang = options.lang || "en-US";
        webRecognition.start();
        if (options.volumeChangeEventOptions?.enabled) {
          startVolumeDetection();
        }
      } catch (err: any) {
        emitEvent("error", { error: "start-failed", message: err.message });
      }
    } else {
      if (NativeModule) {
        NativeModule.start(options);
      } else {
        console.warn("Native speech recognition module not available.");
      }
    }
  },

  stop() {
    if (Platform.OS === "web") {
      if (webRecognition) {
        webRecognition.stop();
        stopVolumeDetection();
      }
    } else {
      if (NativeModule) {
        NativeModule.stop();
      }
    }
  },

  abort() {
    if (Platform.OS === "web") {
      if (webRecognition) {
        webRecognition.abort();
        stopVolumeDetection();
      }
    } else {
      if (NativeModule) {
        NativeModule.abort();
      }
    }
  },
};

// 2. SpeechRecognitionService Implementation
export const SpeechRecognitionService = {
  async checkAvailability(): Promise<boolean> {
    if (Platform.OS === "web") {
      return webRecognition !== null;
    }
    // For native
    try {
      if (NativeModule && typeof NativeModule.checkAvailability === "function") {
        return await NativeModule.checkAvailability();
      }
      return true; // fallback
    } catch {
      return false;
    }
  },

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === "web") {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch {
        return false;
      }
    }
    // For native
    try {
      if (NativeModule && typeof NativeModule.requestPermissions === "function") {
        const result = await NativeModule.requestPermissions();
        return !!result;
      }
      return true; // fallback
    } catch {
      return false;
    }
  },
};

// 3. useSpeechRecognitionEvent Custom Hook
export function useSpeechRecognitionEvent<K extends keyof EventCallbackMap>(
  event: K,
  callback: EventCallbackMap[K]
) {
  // Use native hook if on device
  if (Platform.OS !== "web" && nativeUseEvent) {
    nativeUseEvent(event, callback);
    return;
  }

  // Web fallback hook
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const wrapper = (payload: any) => {
      callbackRef.current(payload);
    };

    listeners[event]?.add(wrapper as any);

    return () => {
      listeners[event]?.delete(wrapper as any);
    };
  }, [event]);
}
