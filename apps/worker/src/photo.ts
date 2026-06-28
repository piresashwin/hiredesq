// Candidate-photo extraction for the CV-parse pipeline (CLAUDE.md §2/§5).
//
// The LLM parser returns structured TEXT, never pixels — so a headshot is pulled
// from the file's own bytes here, separately from the Haiku parse. We read the
// images EMBEDDED in the document (DOCX `word/media/*`, PDF image XObjects), score
// them, and normalise the best candidate to a small JPEG. Scanned / image-only CVs
// (no embedded image, just a page raster) are intentionally out of scope for v1 —
// they'd need face detection to crop. A candidate photo is PII (§2): never log the
// bytes; the caller stores it workspace-namespaced.

import sharp from "sharp";
import JSZip from "jszip";
import type { UploadKind } from "@hiredesq/shared";

// Heuristic bounds. A headshot is portrait-to-square and a few hundred px on a
// side; icons/bullets are tiny and banners/full-page scans are huge or very wide.
const MIN_SIDE = 80; // below this it's a bullet/icon/logo, not a face
const MAX_SIDE = 2000; // above this it's a full-page raster, not a crop
const MAX_IMAGES = 12; // bound the work per file
const MAX_PDF_PAGES = 3; // a headshot lives on page 1; don't scan a whole report
const PHOTO_MAX_DIM = 512; // output cap — a profile thumbnail, not the original

/** One embedded image, with its dimensions for scoring and a lazy sharp pipeline. */
interface CandidateImage {
  width: number;
  height: number;
  toSharp: () => sharp.Sharp;
}

/**
 * Extract the best embedded headshot and normalise it to a small JPEG, or null
 * when the file carries no plausible portrait. Best-effort and self-contained —
 * the caller wraps this so a failure never fails the parse.
 */
export async function extractHeadshot(
  kind: UploadKind,
  bytes: Buffer,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let images: CandidateImage[] = [];
  if (kind === "docx") images = await extractDocxImages(bytes);
  else if (kind === "pdf") images = await extractPdfImages(bytes);
  else return null; // image/text/csv/xlsx carry no embedded headshot to pull

  let best: CandidateImage | null = null;
  let bestScore = 0;
  for (const img of images) {
    const s = scoreHeadshot(img);
    if (s > bestScore) {
      bestScore = s;
      best = img;
    }
  }
  if (!best) return null;

  // Normalise: honour EXIF orientation, cap dimensions, re-encode to JPEG. A
  // 512px JPEG is well under the 2MB candidate-photo ceiling the API enforces.
  const buffer = await best
    .toSharp()
    .rotate()
    .resize(PHOTO_MAX_DIM, PHOTO_MAX_DIM, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { buffer, contentType: "image/jpeg" };
}

/** Higher score = more headshot-like; <= 0 means reject. */
function scoreHeadshot(img: CandidateImage): number {
  const minSide = Math.min(img.width, img.height);
  const maxSide = Math.max(img.width, img.height);
  if (minSide < MIN_SIDE) return -1; // icon / bullet / logo
  if (maxSide > MAX_SIDE) return -1; // full-page scan / banner
  const aspect = img.width / img.height;
  let score: number;
  if (aspect >= 0.6 && aspect <= 1.1)
    score = 100; // portrait/square — a headshot
  else if (aspect > 1.1 && aspect <= 1.4) score = 20;
  else return -1; // wide/letterbox — a banner or rule, not a face
  // Prefer larger (to a point) — a 300px photo beats an 80px thumbnail.
  return score + Math.min(minSide, 600) / 10;
}

/** DOCX images are real JPEG/PNG files under `word/media/` in the zip. */
async function extractDocxImages(bytes: Buffer): Promise<CandidateImage[]> {
  const out: CandidateImage[] = [];
  const zip = await JSZip.loadAsync(bytes);
  for (const path of Object.keys(zip.files)) {
    if (out.length >= MAX_IMAGES) break;
    if (!/^word\/media\/[^/]+\.(jpe?g|png)$/i.test(path)) continue;
    const file = zip.files[path];
    if (!file || file.dir) continue;
    const buf = await file.async("nodebuffer");
    try {
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) continue;
      out.push({ width: meta.width, height: meta.height, toSharp: () => sharp(buf) });
    } catch {
      // Not a decodable image (corrupt/unsupported) — skip it.
    }
  }
  return out;
}

// ── PDF image XObjects via pdfjs (legacy build for Node) ──────────────────────
// The legacy ESM build is the Node-safe entry. We import it through a variable
// specifier so the type checker treats it structurally (no fragile dependence on
// pdfjs' published subpath types) while Node still resolves the real module.

interface PdfImageObject {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}
interface PdfPage {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get(name: string, callback: (obj: PdfImageObject) => void): void };
  cleanup?: () => void;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
interface PdfjsApi {
  OPS: Record<string, number>;
  ImageKind: { GRAYSCALE_1BPP: number; RGB_24BPP: number; RGBA_32BPP: number };
  getDocument(src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
  }): { promise: Promise<PdfDocument> };
}

async function extractPdfImages(bytes: Buffer): Promise<CandidateImage[]> {
  const out: CandidateImage[] = [];
  const specifier = "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = (await import(specifier)) as unknown as PdfjsApi;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const paintImage = pdfjs.OPS.paintImageXObject;
    for (let p = 1; p <= pages; p++) {
      if (out.length >= MAX_IMAGES) break;
      const page = await doc.getPage(p);
      try {
        const ops = await page.getOperatorList();
        const names = new Set<string>();
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] !== paintImage) continue;
          const arg = ops.argsArray[i]?.[0];
          if (typeof arg === "string") names.add(arg);
        }
        for (const name of names) {
          if (out.length >= MAX_IMAGES) break;
          const img = await getImageObject(page, name);
          if (!img?.data || !img.width || !img.height) continue;
          const channels =
            img.kind === pdfjs.ImageKind.RGBA_32BPP
              ? 4
              : img.kind === pdfjs.ImageKind.RGB_24BPP
                ? 3
                : 0;
          if (channels === 0) continue; // 1bpp grayscale / unknown — not a photo
          const raw = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
          const width = img.width;
          const height = img.height;
          out.push({
            width,
            height,
            toSharp: () => sharp(raw, { raw: { width, height, channels } }),
          });
        }
      } finally {
        page.cleanup?.();
      }
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

/** Resolve a pdfjs image object, bounded by a timeout so a stuck object can't hang the parse. */
function getImageObject(page: PdfPage, name: string): Promise<PdfImageObject | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (obj: PdfImageObject | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(obj);
    };
    const timer = setTimeout(() => finish(null), 3000);
    try {
      page.objs.get(name, (obj) => finish(obj));
    } catch {
      finish(null);
    }
  });
}
