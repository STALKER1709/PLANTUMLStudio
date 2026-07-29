import fs from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

import type {
  DiagramFormat,
  ExportProjectRequest,
  ExportRequest,
  ExportResult,
} from '../../shared/types';
import { logger } from '../utils/logger';
import type { EngineFormat, PlantUMLService } from './PlantUMLService';

/** Marge appliquée autour du diagramme dans le PDF, en points. */
const PDF_MARGIN_PT = 24;
/** 1 pixel CSS = 0,75 point PostScript (96 dpi → 72 dpi). */
const PX_TO_PT = 0.75;
/** Taille de repli si le SVG ne déclare pas ses dimensions (A4 portrait). */
const A4_PT: [number, number] = [595.28, 841.89];

export class ExportService {
  constructor(private readonly plantuml: PlantUMLService) {}

  /** Exporte un diagramme unique vers `targetPath`. */
  async exportDiagram(request: ExportRequest): Promise<ExportResult> {
    const { source, format, targetPath, applyFormalism = true } = request;

    if (format === 'pdf') {
      const svg = await this.plantuml.renderToBuffer(source, 'svg', { applyFormalism });
      if (!svg.success || !svg.buffer) {
        return { success: false, errors: svg.errors };
      }
      const pdf = await this.svgToPdfBuffer(svg.buffer.toString('utf-8'));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, pdf);
      return { success: true, outputPath: targetPath };
    }

    const result = await this.plantuml.renderToFile(source, format as EngineFormat, targetPath, {
      applyFormalism,
    });
    return result.success
      ? { success: true, outputPath: result.outputPath }
      : { success: false, errors: result.errors };
  }

  /**
   * Exporte plusieurs diagrammes dans une archive ZIP.
   * Un fichier en erreur n'interrompt pas le lot : il est signalé dans
   * `failures` et l'archive contient les diagrammes valides.
   */
  async exportProject(request: ExportProjectRequest): Promise<ExportResult> {
    const { files, format, targetPath, applyFormalism = true } = request;
    const zip = new AdmZip();
    const failures: Array<{ file: string; reason: string }> = [];
    let exported = 0;

    for (const file of files) {
      try {
        const source = await fs.readFile(file, 'utf-8');
        const buffer = await this.renderToBufferForFormat(source, format, applyFormalism);
        const entryName = `${path.basename(file, path.extname(file))}.${format}`;
        zip.addFile(entryName, buffer);
        exported += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.warn(`Export impossible pour ${file} : ${reason}`);
        failures.push({ file, reason });
      }
    }

    if (exported === 0) {
      return {
        success: false,
        failures,
        errors: [
          {
            message: "Aucun diagramme n'a pu être exporté.",
            raw: failures.map((failure) => failure.reason).join(' | '),
          },
        ],
      };
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, zip.toBuffer());

    return {
      success: true,
      outputPath: targetPath,
      failures: failures.length > 0 ? failures : undefined,
    };
  }

  /**
   * Écrit un rendu **déjà produit** — celui affiché dans l'aperçu, déplacements
   * compris — au lieu de le régénérer depuis la source.
   *
   * Le PNG arrive rastérisé par le renderer : le main process ne sait pas
   * dessiner un SVG, et Chromium le fait déjà, hors ligne.
   */
  async exportRenderedSvg(request: {
    svg: string;
    pngBase64?: string;
    format: DiagramFormat;
    targetPath: string;
  }): Promise<ExportResult> {
    const { svg, pngBase64, format, targetPath } = request;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (format === 'svg') {
      await fs.writeFile(targetPath, svg, 'utf-8');
      return { success: true, outputPath: targetPath };
    }

    if (format === 'pdf') {
      await fs.writeFile(targetPath, await this.svgToPdfBuffer(svg));
      return { success: true, outputPath: targetPath };
    }

    if (!pngBase64) {
      return {
        success: false,
        errors: [
          { message: "Le rendu PNG du diagramme édité n'a pas pu être produit.", raw: 'png missing' },
        ],
      };
    }

    await fs.writeFile(targetPath, Buffer.from(pngBase64, 'base64'));
    return { success: true, outputPath: targetPath };
  }

  /** Rend un diagramme dans le format demandé et retourne les octets produits. */
  async renderToBufferForFormat(
    source: string,
    format: DiagramFormat,
    applyFormalism = true
  ): Promise<Buffer> {
    if (format === 'pdf') {
      const svg = await this.plantuml.renderToBuffer(source, 'svg', { applyFormalism });
      if (!svg.success || !svg.buffer) {
        throw new Error(svg.errors?.map((error) => error.message).join(' ') ?? 'Rendu SVG échoué.');
      }
      return this.svgToPdfBuffer(svg.buffer.toString('utf-8'));
    }

    const result = await this.plantuml.renderToBuffer(source, format, { applyFormalism });
    if (!result.success || !result.buffer) {
      throw new Error(
        result.errors?.map((error) => error.message).join(' ') ?? 'Rendu du diagramme échoué.'
      );
    }
    return result.buffer;
  }

  /** Convertit un SVG PlantUML en PDF vectoriel (aucune perte de qualité). */
  async svgToPdfBuffer(svg: string): Promise<Buffer> {
    const size = this.readSvgSize(svg);

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const document = new PDFDocument({
          size: [size[0] + PDF_MARGIN_PT * 2, size[1] + PDF_MARGIN_PT * 2],
          margin: 0,
          info: { Producer: 'PlantUML Studio', Creator: 'PlantUML Studio' },
        });

        const chunks: Buffer[] = [];
        document.on('data', (chunk: Buffer) => chunks.push(chunk));
        document.on('error', reject);
        document.on('end', () => resolve(Buffer.concat(chunks)));

        SVGtoPDF(document, svg, PDF_MARGIN_PT, PDF_MARGIN_PT, {
          width: size[0],
          height: size[1],
          preserveAspectRatio: 'xMinYMin meet',
        });

        document.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Dimensions du SVG en points, depuis `width`/`height` puis `viewBox`. */
  private readSvgSize(svg: string): [number, number] {
    const width = this.readLength(svg.match(/\swidth="([\d.]+)(?:px|pt)?"/i)?.[1]);
    const height = this.readLength(svg.match(/\sheight="([\d.]+)(?:px|pt)?"/i)?.[1]);
    if (width && height) return [width * PX_TO_PT, height * PX_TO_PT];

    const viewBox = svg.match(/viewBox="([\d.\s-]+)"/i)?.[1];
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return [parts[2] * PX_TO_PT, parts[3] * PX_TO_PT];
      }
    }

    return A4_PT;
  }

  private readLength(raw: string | undefined): number | null {
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
}
