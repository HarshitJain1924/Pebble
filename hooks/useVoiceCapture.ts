import { useState, useEffect, useCallback, useRef } from "react";
import * as Haptics from "expo-haptics";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  SpeechRecognitionService,
} from "@/services/speechRecognition";

export type VoiceCaptureStatus = "idle" | "listening" | "processing" | "completed" | "error";

interface UseVoiceCaptureOptions {
  onTranscriptComplete?: (finalTranscript: string) => void;
  onTranscriptChange?: (interimTranscript: string) => void;
}

export function useVoiceCapture({ onTranscriptComplete, onTranscriptChange }: UseVoiceCaptureOptions = {}) {
  const [status, setStatus] = useState<VoiceCaptureStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [volume, setVolume] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isListeningRef = useRef(false);
  const completionTimeoutRef = useRef<any>(null);

  // Safe cleanup on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
      if (isListeningRef.current) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {}
      }
    };
  }, []);

  // Subscribe to speech transcription results
  useSpeechRecognitionEvent("result", (event) => {
    const primaryResult = event.results[0];
    const text = primaryResult?.transcript || "";
    setTranscript(text);
    onTranscriptChange?.(text);

    // If marked as final by the session event
    if (event.isFinal) {
      handleComplete(text);
    }
  });

  // Subscribe to recognition session end event
  useSpeechRecognitionEvent("end", () => {
    isListeningRef.current = false;
    
    // Move to processing if it ended while in listening state
    setStatus((prev) => {
      if (prev === "listening") {
        return "processing";
      }
      return prev;
    });
  });

  // Subscribe to recognition errors
  useSpeechRecognitionEvent("error", (event) => {
    isListeningRef.current = false;
    setStatus("error");
    const msg = event.message || event.error || "An error occurred during recognition";
    setErrorMsg(msg);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } catch {}
  });

  // Subscribe to volume changes to drive waveforms
  useSpeechRecognitionEvent("volumechange", (event) => {
    const dbValue = event.value;
    // Normalizes volume level (typically -2 to 10) to a [0, 1] range
    const normalized = Math.max(0, Math.min(1, (dbValue + 2) / 12));
    setVolume(normalized);
  });

  const handleComplete = (finalText: string) => {
    isListeningRef.current = false;
    setStatus("completed");
    
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {}
    
    onTranscriptComplete?.(finalText);

    // Let user see completion checkmark state briefly before resetting to idle
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }
    completionTimeoutRef.current = setTimeout(() => {
      setStatus("idle");
      setTranscript("");
      setVolume(0);
    }, 1500);
  };

  const startRecording = useCallback(async () => {
    console.log("[VOICE] start recording");
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }

    const available = await SpeechRecognitionService.checkAvailability();
    if (!available) {
      setStatus("error");
      setErrorMsg("Voice input is not supported on this platform.");
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } catch {}
      return;
    }

    const hasPermission = await SpeechRecognitionService.requestPermissions();
    if (!hasPermission) {
      setStatus("error");
      setErrorMsg("Microphone/Speech permissions denied.");
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } catch {}
      return;
    }

    setErrorMsg(null);
    setTranscript("");
    setVolume(0);
    setStatus("listening");
    isListeningRef.current = true;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {}

    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 80,
        },
      });
    } catch (e: any) {
      isListeningRef.current = false;
      setStatus("error");
      setErrorMsg(e.message || "Failed to start speech recognition.");
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } catch {}
    }
  }, [onTranscriptComplete, onTranscriptChange]);

  const stopRecording = useCallback(async () => {
    if (!isListeningRef.current) return;
    setStatus("processing");
    isListeningRef.current = false;
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message || "Failed to stop recording.");
    }
  }, []);

  const cancelRecording = useCallback(() => {
    isListeningRef.current = false;
    setStatus("idle");
    setTranscript("");
    setVolume(0);
    setErrorMsg(null);

    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
  }, []);

  return {
    status,
    transcript,
    volume,
    errorMsg,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
export default useVoiceCapture;
