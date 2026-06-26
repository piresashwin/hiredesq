// Local extraction for the CV-parse pipeline (CLAUDE.md §5, doc §2). Text-layer
// PDFs and DOCX are extracted here for the cheap text path; image-only PDFs fall
// back to Haiku vision. NEVER log the extracted text — it is PII (§2).
//
// pdf-parse's index re-exports a debug harness that reads a test fixture at
// import time; import the lib entrypoint directly to avoid that bug.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/** Result of pulling text out of a PDF — text plus the page count for routing. */
export interface PdfText {
  text: string;
  pages: number;
}

/** Extract a PDF's text layer (if any) and page count. */
export async function extractPdf(bytes: Buffer): Promise<PdfText> {
  const result = await pdfParse(bytes);
  return { text: result.text ?? "", pages: result.numpages ?? 1 };
}

/** Extract raw text from a DOCX. */
export async function extractDocx(bytes: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value ?? "";
}

/**
 * Decide whether a PDF's extracted text is a real text layer or whether the file
 * is image-only/scanned (route to vision). Heuristic: average substantive chars
 * per page below a threshold means there's effectively no text layer.
 */
export function hasTextLayer(text: string, pages: number): boolean {
  const substantive = text.replace(/\s+/g, "").length;
  const perPage = substantive / Math.max(pages, 1);
  // A real resume page carries hundreds of glyphs; a scanned page yields near zero.
  // The absolute floor keeps a legitimately sparse SHORT text PDF (thin text on a
  // 1–3 page resume) on the cheap text path — but only at low page counts, so a
  // long scanned PDF leaking a little stray OCR text per page still routes to
  // vision rather than being misread as a text layer. Thresholds are empirical.
  return perPage >= 100 || (pages <= 3 && substantive >= 200);
}

/** A single parsed CSV/XLSX row keyed by (raw) header. Values are strings. */
export type ImportRow = Record<string, string>;

/** Read CSV bytes into row objects keyed by header (first row). */
export function readCsv(bytes: Buffer): ImportRow[] {
  const parsed = Papa.parse<ImportRow>(bytes.toString("utf8"), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return parsed.data.filter((row) => row && Object.keys(row).length > 0);
}

/** Read the first sheet of an XLSX workbook into row objects keyed by header. */
export function readXlsx(bytes: Buffer): ImportRow[] {
  const wb = XLSX.read(bytes, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.map((row) => {
    const out: ImportRow = {};
    for (const [key, value] of Object.entries(row)) {
      out[key.trim()] = value == null ? "" : String(value);
    }
    return out;
  });
}
