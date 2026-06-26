// The lib entrypoint avoids pdf-parse's index debug-harness import bug, but
// @types/pdf-parse only types the package root. Declare the subpath we use.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
