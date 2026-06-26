import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasTextLayer } from "./extract.js";

// Text-vs-vision routing heuristic (doc §2): a PDF with a real text layer goes
// the cheap text path; an image-only/scanned PDF (little/no extractable text)
// routes to Haiku vision. We decide on substantive chars per page.

describe("hasTextLayer", () => {
  it("treats a substantive text layer as text-extractable", () => {
    const resume = "John Doe Senior Engineer ".repeat(40); // ~hundreds of chars
    assert.equal(hasTextLayer(resume, 1), true);
  });

  it("routes an image-only/scanned PDF (empty text) to vision", () => {
    assert.equal(hasTextLayer("", 3), false);
  });

  it("routes whitespace-only extraction to vision", () => {
    assert.equal(hasTextLayer("   \n\n  \t  ", 1), false);
  });

  it("accounts for page count (thin text spread over many pages → vision)", () => {
    // ~150 substantive chars but across 5 pages → ~30/page → below threshold.
    const thin = "x".repeat(150);
    assert.equal(hasTextLayer(thin, 5), false);
    // Same text on a single page clears the per-page threshold.
    assert.equal(hasTextLayer(thin, 1), true);
  });

  it("keeps a sparse SHORT text PDF on the text path (absolute floor, low page count)", () => {
    // ~250 substantive chars over 2 pages → ~125/page already clears per-page,
    // and even a thin 1–3 page resume clears the absolute floor → text layer.
    assert.equal(hasTextLayer("x".repeat(250), 3), true);
  });

  it("routes a long scanned PDF leaking a little stray text to vision", () => {
    // ~250 stray chars over 10 pages → ~25/page; the absolute floor is gated to
    // ≤3 pages, so a long scanned doc isn't misread as a (sparse) text layer.
    assert.equal(hasTextLayer("x".repeat(250), 10), false);
  });
});
