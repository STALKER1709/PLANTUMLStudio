import fs from 'node:fs/promises';
import path from 'node:path';

import type { TemplateSummary } from '../../shared/types';

/**
 * Expose les modèles `.puml` livrés avec l'application (dossier `templates/`).
 * Les modèles sont en lecture seule : ils sont copiés dans le projet de
 * l'utilisateur au moment de l'insertion.
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

    const templates = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.puml'))
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(async (fileName) => ({
          id: path.basename(fileName, '.puml'),
          fileName,
          label: await this.readLabel(path.join(this.templatesPath, fileName), fileName),
        }))
    );

    return templates;
  }

  async readTemplate(id: string): Promise<string> {
    // `id` vient du renderer : on interdit toute sortie du dossier templates.
    const safeId = path.basename(id);
    const fullPath = path.join(this.templatesPath, `${safeId}.puml`);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Libellé affiché : première ligne de commentaire du modèle
   * (`' Diagramme de classes — ...`), sinon nom de fichier embelli.
   */
  private async readLabel(fullPath: string, fileName: string): Promise<string> {
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const firstComment = content
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith("'"));

      if (firstComment) {
        const label = firstComment.replace(/^'+\s*/, '').split('—')[0].trim();
        if (label) return label;
      }
    } catch {
      // On retombe sur le nom de fichier.
    }

    const pretty = path
      .basename(fileName, '.puml')
      .replace(/^\d+[-_]?/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }
}
