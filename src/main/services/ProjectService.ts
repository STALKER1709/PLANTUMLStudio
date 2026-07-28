import fs from 'node:fs/promises';
import path from 'node:path';

import { PROJECT_FILE_EXTENSION, NEW_FILE_TEMPLATE } from '../../shared/constants';
import type { Project, ProjectMeta, ProjectSettings } from '../../shared/types';
import { logger } from '../utils/logger';

const DEFAULT_SETTINGS: ProjectSettings = {
  defaultFormat: 'svg',
  exportDirectory: 'exports',
};

const PROJECT_FORMAT_VERSION = '1';

export class ProjectService {
  /**
   * Crée un projet dans `rootPath` : fichier `.plantumlproj` + premier
   * diagramme. Échoue si un projet y existe déjà.
   */
  async createProject(rootPath: string, name?: string): Promise<Project> {
    await fs.mkdir(rootPath, { recursive: true });

    const existing = await this.findProjectFile(rootPath);
    if (existing) {
      throw new Error(
        `Ce dossier contient déjà un projet (${path.basename(existing)}). Ouvrez-le plutôt.`
      );
    }

    const projectName = name?.trim() || path.basename(rootPath);
    const now = new Date().toISOString();
    const meta: ProjectMeta = {
      name: projectName,
      version: PROJECT_FORMAT_VERSION,
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_SETTINGS },
    };

    const projectFilePath = path.join(rootPath, `${this.slugify(projectName)}${PROJECT_FILE_EXTENSION}`);
    await this.writeMeta(projectFilePath, meta);

    // Un projet vide n'aide personne : on amorce avec un diagramme d'exemple.
    const firstDiagram = path.join(rootPath, '01-premier-diagramme.puml');
    await fs.writeFile(firstDiagram, NEW_FILE_TEMPLATE, 'utf-8');

    logger.info(`Projet créé : ${projectFilePath}`);
    return { rootPath, projectFilePath, meta };
  }

  /**
   * Ouvre un projet à partir d'un dossier ou d'un fichier `.plantumlproj`.
   * Un dossier sans fichier projet est adopté tel quel : on y écrit un
   * `.plantumlproj` afin que l'utilisateur retrouve ses réglages ensuite.
   */
  async openProject(target: string): Promise<Project> {
    const stats = await fs.stat(target);

    if (!stats.isDirectory()) {
      if (!target.endsWith(PROJECT_FILE_EXTENSION)) {
        throw new Error(`« ${path.basename(target)} » n'est pas un fichier projet PlantUML Studio.`);
      }
      return this.readProject(target);
    }

    const projectFile = await this.findProjectFile(target);
    if (projectFile) return this.readProject(projectFile);

    logger.info(`Aucun fichier projet dans ${target} — création automatique.`);
    const now = new Date().toISOString();
    const meta: ProjectMeta = {
      name: path.basename(target),
      version: PROJECT_FORMAT_VERSION,
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_SETTINGS },
    };
    const projectFilePath = path.join(
      target,
      `${this.slugify(meta.name)}${PROJECT_FILE_EXTENSION}`
    );
    await this.writeMeta(projectFilePath, meta);
    return { rootPath: target, projectFilePath, meta };
  }

  /** Lit un `.plantumlproj` en tolérant les champs manquants. */
  async readProject(projectFilePath: string): Promise<Project> {
    const raw = await fs.readFile(projectFilePath, 'utf-8');

    let parsed: Partial<ProjectMeta>;
    try {
      parsed = JSON.parse(raw) as Partial<ProjectMeta>;
    } catch {
      throw new Error(
        `Le fichier projet « ${path.basename(projectFilePath)} » est illisible (JSON invalide).`
      );
    }

    const rootPath = path.dirname(projectFilePath);
    const now = new Date().toISOString();
    const meta: ProjectMeta = {
      name: parsed.name ?? path.basename(rootPath),
      version: parsed.version ?? PROJECT_FORMAT_VERSION,
      createdAt: parsed.createdAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };

    return { rootPath, projectFilePath, meta };
  }

  /** Met à jour les métadonnées (et `updatedAt`) d'un projet existant. */
  async updateProject(project: Project, changes: Partial<ProjectMeta>): Promise<Project> {
    const meta: ProjectMeta = {
      ...project.meta,
      ...changes,
      settings: { ...project.meta.settings, ...(changes.settings ?? {}) },
      updatedAt: new Date().toISOString(),
    };
    await this.writeMeta(project.projectFilePath, meta);
    return { ...project, meta };
  }

  /** Retourne le premier fichier `.plantumlproj` du dossier, sinon `null`. */
  async findProjectFile(directory: string): Promise<string | null> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const match = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(PROJECT_FILE_EXTENSION))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    return match ? path.join(directory, match.name) : null;
  }

  private async writeMeta(projectFilePath: string, meta: ProjectMeta): Promise<void> {
    await fs.writeFile(projectFilePath, `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  }

  private slugify(value: string): string {
    return (
      value
        .normalize('NFD')
        // Retire les diacritiques (accents) : « Modèle Métier » → « modele-metier »
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'projet'
    );
  }
}
