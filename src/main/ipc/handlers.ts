import path from 'node:path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import { PROJECT_FILE_EXTENSION } from '../../shared/constants';
import type {
  DiagramFormat,
  EnvironmentStatus,
  ExportResult,
  FileNode,
  IpcResult,
  Project,
  RenderResult,
  SaveFileResult,
  TemplateSummary,
} from '../../shared/types';
import type { EngineFormat, PlantUMLService } from '../services/PlantUMLService';
import type { EnvironmentService } from '../services/EnvironmentService';
import type { ExportService } from '../services/ExportService';
import type { FileService } from '../services/FileService';
import type { ProjectService } from '../services/ProjectService';
import type { TemplateService } from '../services/TemplateService';
import { logger } from '../utils/logger';
import { IPC_CHANNELS } from './channels';

export interface IpcContext {
  getMainWindow(): BrowserWindow | null;
  plantuml: PlantUMLService;
  files: FileService;
  projects: ProjectService;
  exports: ExportService;
  environment: EnvironmentService;
  templates: TemplateService;
}

const FORMAT_FILTERS: Record<DiagramFormat, Electron.FileFilter> = {
  svg: { name: 'Image vectorielle SVG', extensions: ['svg'] },
  png: { name: 'Image PNG', extensions: ['png'] },
  pdf: { name: 'Document PDF', extensions: ['pdf'] },
};

/** Projet actuellement ouvert : sert de racine autorisée aux opérations disque. */
let currentProject: Project | null = null;

/** Les boîtes de dialogue sont modales quand une fenêtre est disponible. */
function showOpenDialog(
  window: BrowserWindow | null,
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
}

function showSaveDialog(
  window: BrowserWindow | null,
  options: Electron.SaveDialogOptions
): Promise<Electron.SaveDialogReturnValue> {
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail<T>(error: unknown): IpcResult<T> {
  const message = toMessage(error);
  logger.error(`Échec d'une opération IPC : ${message}`);
  return { ok: false, error: message };
}

/**
 * Refuse tout accès disque hors du projet ouvert.
 * Tant qu'aucun projet n'est ouvert, seules les actions passant par une boîte
 * de dialogue système (choisie par l'utilisateur) sont possibles.
 */
function assertInsideProject(files: FileService, target: string): void {
  if (!currentProject) {
    throw new Error("Aucun projet ouvert : ouvrez un dossier avant de modifier des fichiers.");
  }
  if (!files.isWithin(currentProject.rootPath, target)) {
    throw new Error(
      `Accès refusé : « ${path.basename(target)} » se trouve en dehors du projet ouvert.`
    );
  }
}

function setCurrentProject(context: IpcContext, project: Project | null): void {
  currentProject = project;
  // Les `!include` ne sont autorisés qu'à l'intérieur du projet ouvert.
  context.plantuml.setIncludePath(project ? project.rootPath : null);
}

export function getCurrentProject(): Project | null {
  return currentProject;
}

export function registerIpcHandlers(context: IpcContext): void {
  const { plantuml, files, projects, exports: exportService, environment, templates } = context;

  // ---------------------------------------------------------------- Rendu
  ipcMain.handle(
    IPC_CHANNELS.RENDER_DIAGRAM,
    async (_event, source: string, format: DiagramFormat = 'svg'): Promise<RenderResult> => {
      const engineFormat: EngineFormat = format === 'png' ? 'png' : 'svg';
      try {
        return await plantuml.render(source, engineFormat);
      } catch (error) {
        return {
          success: false,
          format: engineFormat,
          durationMs: 0,
          errors: [{ message: `Erreur interne du moteur : ${toMessage(error)}`, raw: toMessage(error) }],
        };
      }
    }
  );

  // -------------------------------------------------------------- Projets
  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, async (): Promise<IpcResult<Project>> => {
    try {
      const window = context.getMainWindow();
      const selection = await showOpenDialog(window, {
        title: 'Ouvrir un projet PlantUML',
        properties: ['openDirectory'],
        buttonLabel: 'Ouvrir',
      });

      if (selection.canceled || selection.filePaths.length === 0) {
        return { ok: false, error: 'Ouverture annulée.' };
      }

      const project = await projects.openProject(selection.filePaths[0]);
      setCurrentProject(context, project);
      logger.info(`Projet ouvert : ${project.projectFilePath}`);
      return ok(project);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, async (): Promise<IpcResult<Project>> => {
    try {
      const window = context.getMainWindow();
      const selection = await showOpenDialog(window, {
        title: 'Choisir le dossier du nouveau projet',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Créer le projet',
      });

      if (selection.canceled || selection.filePaths.length === 0) {
        return { ok: false, error: 'Création annulée.' };
      }

      const project = await projects.createProject(selection.filePaths[0]);
      setCurrentProject(context, project);
      return ok(project);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.READ_PROJECT,
    async (_event, projectPath: string): Promise<IpcResult<Project>> => {
      try {
        const project = projectPath.endsWith(PROJECT_FILE_EXTENSION)
          ? await projects.readProject(projectPath)
          : await projects.openProject(projectPath);
        setCurrentProject(context, project);
        return ok(project);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ------------------------------------------------------------- Fichiers
  ipcMain.handle(
    IPC_CHANNELS.LIST_FILES,
    async (_event, projectPath: string): Promise<IpcResult<FileNode>> => {
      try {
        assertInsideProject(files, projectPath);
        return ok(await files.buildFileTree(projectPath));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.READ_FILE,
    async (_event, filePath: string): Promise<IpcResult<string>> => {
      try {
        assertInsideProject(files, filePath);
        return ok(await files.readPumlFile(filePath));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SAVE_FILE,
    async (_event, filePath: string, content: string): Promise<SaveFileResult> => {
      try {
        assertInsideProject(files, filePath);
        await files.writePumlFile(filePath, content);
        return { success: true, path: filePath };
      } catch (error) {
        logger.error(`Échec de l'enregistrement de ${filePath}`, error);
        return { success: false, error: toMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_FILE,
    async (
      _event,
      dirPath: string,
      fileName: string,
      content = ''
    ): Promise<IpcResult<string>> => {
      try {
        assertInsideProject(files, dirPath);
        return ok(await files.createFile(dirPath, fileName, content));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_FILE,
    async (_event, filePath: string): Promise<IpcResult<null>> => {
      try {
        assertInsideProject(files, filePath);
        await files.deleteFile(filePath);
        return ok(null);
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RENAME_FILE,
    async (_event, oldPath: string, newName: string): Promise<IpcResult<string>> => {
      try {
        assertInsideProject(files, oldPath);
        // `newName` est un nom, pas un chemin : on neutralise tout séparateur.
        return ok(await files.renameFile(oldPath, path.basename(newName)));
      } catch (error) {
        return fail(error);
      }
    }
  );

  // --------------------------------------------------------------- Export
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_DIAGRAM,
    async (_event, source: string, format: DiagramFormat): Promise<IpcResult<ExportResult>> => {
      try {
        const window = context.getMainWindow();
        const defaultDirectory = currentProject
          ? path.join(currentProject.rootPath, currentProject.meta.settings.exportDirectory)
          : undefined;

        const selection = await showSaveDialog(window, {
          title: 'Exporter le diagramme',
          defaultPath: defaultDirectory
            ? path.join(defaultDirectory, `diagramme.${format}`)
            : `diagramme.${format}`,
          filters: [FORMAT_FILTERS[format]],
        });

        if (selection.canceled || !selection.filePath) {
          return { ok: false, error: 'Export annulé.' };
        }

        const result = await exportService.exportDiagram({
          source,
          format,
          targetPath: selection.filePath,
        });
        return result.success ? ok(result) : { ok: false, error: describeExportFailure(result) };
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_PROJECT,
    async (_event, filePaths: string[], format: DiagramFormat): Promise<IpcResult<ExportResult>> => {
      try {
        if (!currentProject) throw new Error('Aucun projet ouvert.');
        filePaths.forEach((filePath) => assertInsideProject(files, filePath));

        const window = context.getMainWindow();
        const selection = await showSaveDialog(window, {
          title: 'Exporter le projet',
          defaultPath: path.join(
            currentProject.rootPath,
            `${currentProject.meta.name}-${format}.zip`
          ),
          filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
        });

        if (selection.canceled || !selection.filePath) {
          return { ok: false, error: 'Export annulé.' };
        }

        const targets =
          filePaths.length > 0 ? filePaths : await files.listPumlFiles(currentProject.rootPath);

        const result = await exportService.exportProject({
          files: targets,
          format,
          targetPath: selection.filePath,
        });
        return result.success ? ok(result) : { ok: false, error: describeExportFailure(result) };
      } catch (error) {
        return fail(error);
      }
    }
  );

  // -------------------------------------------- Environnement et modèles
  ipcMain.handle(IPC_CHANNELS.CHECK_ENVIRONMENT, async (): Promise<EnvironmentStatus> => {
    return environment.checkEnvironment();
  });

  ipcMain.handle(IPC_CHANNELS.LIST_TEMPLATES, async (): Promise<IpcResult<TemplateSummary[]>> => {
    try {
      return ok(await templates.listTemplates());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.READ_TEMPLATE,
    async (_event, id: string): Promise<IpcResult<string>> => {
      try {
        return ok(await templates.readTemplate(id));
      } catch (error) {
        return fail(error);
      }
    }
  );

  logger.info(`${Object.keys(IPC_CHANNELS).length} canaux IPC enregistrés.`);
}

function describeExportFailure(result: ExportResult): string {
  const errors = result.errors?.map((error) => error.message) ?? [];
  const failures = result.failures?.map((failure) => `${path.basename(failure.file)} : ${failure.reason}`) ?? [];
  return [...errors, ...failures].join('\n') || "L'export a échoué.";
}
