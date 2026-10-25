import {
  getStreamResourceStyle,
  type ResourceKind,
  type StreamResourceStyle,
} from "@/shared/constants/categoryColors";

/**
 * Resource presentation for the Today workspace stream.
 *
 * `resolveResourceVisual` classifies a raw resource record into one of the four
 * categories the stream renders (image / pdf / link / note) and resolves the
 * thumbnail URI + attachment count. Kept byte-for-byte behaviour-compatible with
 * the implementation that previously lived in `WorkspaceSectionedStream.tsx`.
 */

export type ResourceCategory = "image" | "pdf" | "link" | "note";

export interface ResourceVisualInfo {
  category: ResourceCategory;
  label: string;
  thumbnailUri?: string;
  attachmentCount?: number;
}

/** Resolved tile styling for every stream resource category in a scheme. */
export type StreamResourcePalette = Record<ResourceCategory, StreamResourceStyle>;

/** Resolve the stream's resource tile palette for a color scheme. */
export function getStreamResourcePalette(isDark: boolean): StreamResourcePalette {
  return {
    image: getStreamResourceStyle("image", isDark),
    pdf: getStreamResourceStyle("pdf", isDark),
    link: getStreamResourceStyle("link", isDark),
    note: getStreamResourceStyle("note", isDark),
  };
}

/** Convenience alias so callers can index the palette by `ResourceKind`. */
export function getStreamResourceStyleFor(
  kind: ResourceKind,
  isDark: boolean,
): StreamResourceStyle {
  return getStreamResourceStyle(kind, isDark);
}

/**
 * Robust resource category and thumbnail resolver.
 * Identifies images (by MIME or extension), PDFs, links, and notes.
 * Extracts image thumbnail URI from attachments, direct URI, or content.
 */
export function resolveResourceVisual(res: any): ResourceVisualInfo {
  if (!res) {
    return {
      category: "note",
      label: "Resource",
      attachmentCount: 0,
    };
  }
  const attachments = Array.isArray(res.attachments) ? res.attachments : [];
  const attachment = attachments[0];
  const name = (attachment?.name || res.title || "").toLowerCase();
  const mime = (attachment?.mimeType || res.mimeType || "").toLowerCase();
  const uri =
    attachment?.uri ||
    res.uri ||
    (typeof res.content === "string" &&
    (res.content.startsWith("file://") ||
      res.content.startsWith("http://") ||
      res.content.startsWith("https://") ||
      res.content.startsWith("data:image/"))
      ? res.content
      : undefined);

  // 1. Image detection
  const isImageMime = mime.startsWith("image/");
  const isImageExt =
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(name) ||
    (uri ? /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(uri) : false);

  if (isImageMime || isImageExt) {
    return {
      category: "image",
      label: "Image",
      thumbnailUri: uri,
      attachmentCount: attachments.length,
    };
  }

  // 2. PDF detection
  const isPdfMime = mime.includes("pdf");
  const isPdfExt =
    /\.pdf(\?.*)?$/i.test(name) ||
    (uri ? /\.pdf(\?.*)?$/i.test(uri) : false);

  if (isPdfMime || isPdfExt) {
    return {
      category: "pdf",
      label: "PDF",
      attachmentCount: attachments.length,
    };
  }

  // 3. Link detection
  const isLink =
    res.type === "link" ||
    /^(https?:\/\/|www\.)/i.test(res.title || "") ||
    /^(https?:\/\/|www\.)/i.test(res.content || "") ||
    /^(https?:\/\/|www\.)/i.test(res.body || "");

  if (isLink) {
    return {
      category: "link",
      label: "Link",
      attachmentCount: attachments.length,
    };
  }

  // 4. Note / Idea fallback
  return {
    category: "note",
    label: res.type === "idea" ? "Idea" : "Note",
    attachmentCount: attachments.length,
  };
}

/**
 * Resolves the primary Feather icon name for a resource record based on its classified visual category.
 *
 * - link → "link-2"
 * - image → "image"
 * - pdf → "file"
 * - note / idea → "file-text"
 * - fallback / unspecified → "paperclip"
 */
export function resolveResourceIconName(res: any): string {
  if (!res) return "paperclip";
  const visual = resolveResourceVisual(res);
  switch (visual.category) {
    case "link":
      return "link-2";
    case "image":
      return "image";
    case "pdf":
      return "file";
    case "note":
    default:
      return "file-text";
  }
}

