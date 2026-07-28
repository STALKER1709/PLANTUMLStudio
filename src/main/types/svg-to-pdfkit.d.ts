/**
 * `svg-to-pdfkit` ne publie pas de types : déclaration minimale couvrant
 * l'usage réel de `ExportService`.
 */
declare module 'svg-to-pdfkit' {
  interface SVGtoPDFOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    useCSS?: boolean;
    fontCallback?: (family: string, bold: boolean, italic: boolean) => string;
    assumePt?: boolean;
  }

  function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: SVGtoPDFOptions
  ): void;

  export = SVGtoPDF;
}
