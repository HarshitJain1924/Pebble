import { Platform, Alert } from "react-native";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";

export interface OpenFileOptions {
  mimeType?: string;
  name?: string;
}

/**
 * Robust cross-platform file and URL opener for mobile (Expo Go / standalone) and web.
 * - HTTP/HTTPS URLs open in the in-app browser or default browser.
 * - Local files (PDF, images, documents) open via native iOS QuickLook / Android system viewer via expo-sharing.
 */
export async function openAttachmentFile(
  uri: string,
  options?: OpenFileOptions
): Promise<void> {
  if (!uri) return;

  const isWebUrl = uri.startsWith("http://") || uri.startsWith("https://");

  // 1. Handle Web URLs
  if (isWebUrl) {
    try {
      if (Platform.OS !== "web") {
        await WebBrowser.openBrowserAsync(uri);
        return;
      }
    } catch {
      // fallback
    }

    try {
      await Linking.openURL(uri);
      return;
    } catch (e) {
      console.warn("Failed to open web URL", e);
      Alert.alert("Open Link", `Could not open ${uri}`);
      return;
    }
  }

  // 2. Handle Native Mobile Files (PDF, images, docs) via Sharing / QuickLook
  if (Platform.OS !== "web") {
    try {
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        const isPdf = options?.mimeType?.includes("pdf") || uri.toLowerCase().endsWith(".pdf");
        await Sharing.shareAsync(uri, {
          mimeType: options?.mimeType || (isPdf ? "application/pdf" : undefined),
          dialogTitle: options?.name || "Open File",
          UTI: isPdf ? "com.adobe.pdf" : undefined,
        });
        return;
      }
    } catch (e) {
      console.warn("Sharing failed, attempting fallback", e);
    }
  }

  // 3. Fallback to Linking for Web or custom schemes
  try {
    const canOpen = await Linking.canOpenURL(uri);
    if (canOpen) {
      await Linking.openURL(uri);
      return;
    }
  } catch {
    // ignore
  }

  // If all fails on mobile, alert the file name
  Alert.alert("File Preview", `File: ${options?.name || uri}`);
}
