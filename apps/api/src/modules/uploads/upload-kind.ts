import { BadRequestException } from "@nestjs/common";
import { IMAGE_MEDIA, type UploadKind } from "@hiredesq/shared";

// Re-export the shared image-media helper so existing importers of this module keep
// working; the canonical map lives in @hiredesq/shared (one contract, both sides).
export { imageMediaType } from "@hiredesq/shared";

// Map an uploaded file to a parse kind + the canonical extension used in its
// storage key. Detection is mimetype-first, extension as a fallback (browsers
// vary on CSV/Excel mime types). Anything unrecognised is rejected (400) — we
// never store bytes we can't route.
export interface DetectedKind {
  kind: UploadKind;
  ext: string;
  /** Content type to persist on the stored object. */
  contentType: string;
}

export function detectKind(filename: string, mimetype: string): DetectedKind {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const mime = mimetype.toLowerCase();

  if (mime === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", ext: "pdf", contentType: "application/pdf" };
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return {
      kind: "docx",
      ext: ext === "doc" ? "doc" : "docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  if (mime.startsWith("image/") || ext in IMAGE_MEDIA) {
    const normalized = ext in IMAGE_MEDIA ? ext : mime.slice("image/".length);
    const media = IMAGE_MEDIA[normalized] ?? IMAGE_MEDIA[ext];
    if (!media) throw new BadRequestException(`unsupported image type: ${filename}`);
    const imgExt = media === "image/jpeg" ? "jpg" : media === "image/png" ? "png" : "webp";
    return { kind: "image", ext: imgExt, contentType: media };
  }
  if (mime === "text/csv" || mime === "application/csv" || ext === "csv") {
    return { kind: "csv", ext: "csv", contentType: "text/csv" };
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return {
      kind: "xlsx",
      ext: ext === "xls" ? "xls" : "xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  throw new BadRequestException(`unsupported upload type: ${filename}`);
}
