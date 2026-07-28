import fs from 'node:fs/promises';
import path from 'node:path';

import type { FileNode } from '../../shared/types';
import { PUML_EXTENSIONS, PROJECT_FILE_EXTENSION } from '../../shared/constants';

/** Dossiers systématiquement masqués dans l'arborescence. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.svn', '__pycache__']);

export interface BuildTreeOptions {
  /** Profondeur maximale d'exploration (garde-fou anti-arborescence infinie). */
  maxDepth?: number;
  /** Inclure les fichiers qui ne sont pas des sources PlantUML. */
  includeAllFiles?: boolean;
}

export class FileService {
  /** `true` si le fichier porte une extension de source PlantUML. */
  isPumlFile(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase();
    return (PUML_EXTENSIONS as readonly string[]).includes(extension);
  }

  /** Ajoute `.puml` si l'utilisateur n'a pas saisi d'extension connue. */
  ensurePumlExtension(fileName: string): string {
    return this.isPumlFile(fileName) ? fileName : `${fileName}.puml`;
  }

  /**
   * Vérifie qu'un chemin reste sous une racine autorisée.
   * Utilisé par les handlers IPC : le renderer ne doit pas pouvoir lire ou
   * écrire en dehors du projet ouvert.
   */
  isWithin(root: string, target: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  async readPumlFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * Écriture « presque atomique » : on écrit dans un fichier voisin puis on
   * renomme, pour ne jamais laisser un `.puml` tronqué en cas de coupure.
   */
  async writePumlFile(filePath: string, content: string): Promise<void> {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporaryPath, content, 'utf-8');
    try {
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async buildFileTree(rootPath: string, options: BuildTreeOptions = {}): Promise<FileNode> {
    const maxDepth = options.maxDepth ?? 12;
    return this.buildNode(path.resolve(rootPath), 0, maxDepth, options.includeAllFiles ?? false);
  }

  private async buildNode(
    currentPath: string,
    depth: number,
    maxDepth: number,
    includeAllFiles: boolean
  ): Promise<FileNode> {
    const name = path.basename(currentPath);
    const stats = await fs.stat(currentPath);

    if (!stats.isDirectory()) {
      return { name, path: currentPath, isDirectory: false };
    }

    if (depth >= maxDepth) {
      return { name, path: currentPath, isDirectory: true, children: [] };
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const children: FileNode[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
        children.push(
          await this.buildNode(
            path.join(currentPath, entry.name),
            depth + 1,
            maxDepth,
            includeAllFiles
          )
        );
        continue;
      }

      if (!entry.isFile()) continue;

      const isProjectFile = entry.name.endsWith(PROJECT_FILE_EXTENSION);
      if (!includeAllFiles && !this.isPumlFile(entry.name) && !isProjectFile) continue;

      children.push({
        name: entry.name,
        path: path.join(currentPath, entry.name),
        isDirectory: false,
      });
    }

    // Dossiers d'abord, puis tri alphabétique insensible à la casse/accents.
    children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });

    return { name, path: currentPath, isDirectory: true, children };
  }

  /** Crée un fichier `.puml`. Échoue si le fichier existe déjà. */
  async createFile(dirPath: string, fileName: string, initialContent = ''): Promise<string> {
    const fullPath = path.join(dirPath, this.ensurePumlExtension(fileName));
    await fs.mkdir(dirPath, { recursive: true });
    // `wx` : erreur si le fichier existe, pour ne jamais écraser un diagramme.
    const handle = await fs.open(fullPath, 'wx');
    try {
      await handle.writeFile(initialContent, 'utf-8');
    } finally {
      await handle.close();
    }
    return fullPath;
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.rm(filePath, { recursive: true, force: false });
  }

  async renameFile(oldPath: string, newName: string): Promise<string> {
    const newPath = path.join(path.dirname(oldPath), this.ensurePumlExtension(newName));
    if (newPath !== oldPath) {
      await fs.access(newPath).then(
        () => {
          throw new Error(`Un fichier nommé « ${path.basename(newPath)} » existe déjà.`);
        },
        () => undefined
      );
    }
    await fs.rename(oldPath, newPath);
    return newPath;
  }

  async createDirectory(parentPath: string, name: string): Promise<string> {
    const fullPath = path.join(parentPath, name);
    await fs.mkdir(fullPath, { recursive: false });
    return fullPath;
  }

  /** Liste récursive des sources PlantUML d'un dossier (pour l'export ZIP). */
  async listPumlFiles(rootPath: string): Promise<string[]> {
    const tree = await this.buildFileTree(rootPath);
    const files: string[] = [];

    const walk = (node: FileNode) => {
      if (!node.isDirectory) {
        if (this.isPumlFile(node.path)) files.push(node.path);
        return;
      }
      node.children?.forEach(walk);
    };

    walk(tree);
    return files;
  }
}
