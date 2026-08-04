import fs from 'node:fs/promises';
import path from 'node:path';

import type { DiagramCategory, TemplateSummary } from '../../shared/types';

/** Un modèle dont le nom commence par « _ » est un fichier de support. */
const SUPPORT_FILE_PREFIX = '_';

/**
 * Expose les modèles `.puml` livrés avec l'application (dossier `templates/`).
 *
 * Chaque modèle porte ses métadonnées en tête, sous forme de commentaires
 * PlantUML :
 *   ' Diagramme de classes — structure statique…
 *   ' @categorie structurel
 *
 * Les modèles sont en lecture seule : leur contenu est copié dans l'éditeur au
 * moment de l'insertion.
 */
export class TemplateService {
  constructor(private readonly templatesPath: string) {}

  getTemplatesPath(): string {
    return this.templatesPath;
  }

  async listTemplates(): Promise<TemplateSummary[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.templatesPath);
    } catch {
      return [];
    }

    return Promise.all(
      entries
        .filter((entry) => entry.endsWith('.puml') && !entry.startsWith(SUPPORT_FILE_PREFIX))
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(async (fileName) => {
          const metadata = await this.readMetadata(
            path.join(this.templatesPath, fileName),
            fileName
          );
          return { id: path.basename(fileName, '.puml'), fileName, ...metadata };
        })
    );
  }

  async readTemplate(id: string): Promise<string> {
    // `id` vient du renderer : on interdit toute sortie du dossier templates.
    const safeId = path.basename(id);
    const fullPath = path.join(this.templatesPath, `${safeId}.puml`);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Libellé et famille du modèle, lus dans son en-tête.
   * Un modèle sans métadonnées reste utilisable : on retombe sur son nom de
   * fichier embelli et sur la famille « structurel ».
   */
  private async readMetadata(
    fullPath: string,
    fileName: string
  ): Promise<{ label: string; category: DiagramCategory }> {
    let label = '';
    let category: DiagramCategory = 'structurel';

    try {
      const header = (await fs.readFile(fullPath, 'utf-8')).split('\n').slice(0, 10);

      for (const rawLine of header) {
        const line = rawLine.trim();
        if (!line.startsWith("'")) continue;

        const comment = line.replace(/^'+\s*/, '');
        const declaredCategory = comment.match(/^@categorie\s+(\w+)/i);

        if (declaredCategory) {
          const declaree = declaredCategory[1].toLowerCase();
          if (declaree === 'comportemental' || declaree === 'planification') {
            category = declaree;
          }
          continue;
        }

        if (!label) label = comment.split('—')[0].trim();
      }
    } catch {
      // Fichier illisible : on retombe sur le nom de fichier.
    }

    return { label: label || this.prettifyFileName(fileName), category };
  }

  private prettifyFileName(fileName: string): string {
    const pretty = path
      .basename(fileName, '.puml')
      .replace(/^\d+[-_]?/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }
}
