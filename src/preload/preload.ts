import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronAPI, DiagramFormat } from '../shared/types';

/**
 * Preload exécuté dans un renderer *sandboxé* (`sandbox: true`).
 *
 * Contrainte importante : un preload sandboxé ne peut pas faire de `require`
 * relatif. Les noms de canaux sont donc recopiés ici plutôt qu'importés depuis
 * `src/shared/constants.ts` — seuls les imports de *types* (effacés à la
 * compilation) et le module `electron` sont autorisés.
 * `tests/unit/PreloadApi.test.ts` vérifie que cette copie reste synchronisée.
 */
const CHANNELS = {
  RENDER_DIAGRAM: 'render:diagram',
  OPEN_PROJECT: 'project:open',
  CREATE_PROJECT: 'project:create',
  READ_PROJECT: 'project:read',
  LIST_FILES: 'file:list',
  READ_FILE: 'file:read',
  SAVE_FILE: 'file:save',
  SAVE_FILE_AS: 'file:saveAs',
  CREATE_FILE: 'file:create',
  DELETE_FILE: 'file:delete',
  RENAME_FILE: 'file:rename',
  EXPORT_DIAGRAM: 'export:diagram',
  EXPORT_PROJECT: 'export:project',
  EXPORT_RENDERED: 'export:rendered',
  CHECK_ENVIRONMENT: 'env:check',
  LIST_TEMPLATES: 'templates:list',
  READ_TEMPLATE: 'templates:read',
} as const;

const api: ElectronAPI = {
  renderDiagram: (source: string, format: DiagramFormat, applyFormalism = true) =>
    ipcRenderer.invoke(CHANNELS.RENDER_DIAGRAM, source, format, applyFormalism),

  openProject: () => ipcRenderer.invoke(CHANNELS.OPEN_PROJECT),
  createProject: () => ipcRenderer.invoke(CHANNELS.CREATE_PROJECT),
  readProject: (projectPath: string) => ipcRenderer.invoke(CHANNELS.READ_PROJECT, projectPath),

  listProjectFiles: (projectPath: string) => ipcRenderer.invoke(CHANNELS.LIST_FILES, projectPath),
  readFile: (filePath: string) => ipcRenderer.invoke(CHANNELS.READ_FILE, filePath),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(CHANNELS.SAVE_FILE, filePath, content),
  saveFileAs: (content: string, suggestedName?: string) =>
    ipcRenderer.invoke(CHANNELS.SAVE_FILE_AS, content, suggestedName),
  createFile: (dirPath: string, fileName: string, content?: string) =>
    ipcRenderer.invoke(CHANNELS.CREATE_FILE, dirPath, fileName, content ?? ''),
  deleteFile: (filePath: string) => ipcRenderer.invoke(CHANNELS.DELETE_FILE, filePath),
  renameFile: (oldPath: string, newName: string) =>
    ipcRenderer.invoke(CHANNELS.RENAME_FILE, oldPath, newName),

  exportDiagram: (source: string, format: DiagramFormat, applyFormalism = true) =>
    ipcRenderer.invoke(CHANNELS.EXPORT_DIAGRAM, source, format, applyFormalism),
  exportProject: (files: string[], format: DiagramFormat, applyFormalism = true) =>
    ipcRenderer.invoke(CHANNELS.EXPORT_PROJECT, files, format, applyFormalism),

  exportRendered: (format: DiagramFormat, svg: string, pngBase64?: string) =>
    ipcRenderer.invoke(CHANNELS.EXPORT_RENDERED, format, svg, pngBase64),

  checkEnvironment: () => ipcRenderer.invoke(CHANNELS.CHECK_ENVIRONMENT),
  listTemplates: () => ipcRenderer.invoke(CHANNELS.LIST_TEMPLATES),
  readTemplate: (id: string) => ipcRenderer.invoke(CHANNELS.READ_TEMPLATE, id),
};

contextBridge.exposeInMainWorld('electronAPI', api);
