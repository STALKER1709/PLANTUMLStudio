/**
 * Constantes partagées entre le main process, le preload et le renderer.
 * Ce fichier ne doit dépendre d'aucun module Node ni d'Electron : il est
 * compilé à la fois par tsc (main/preload) et par Vite (renderer).
 */

export const IPC_CHANNELS = {
  // Rendu
  RENDER_DIAGRAM: 'render:diagram',

  // Projets
  OPEN_PROJECT: 'project:open',
  CREATE_PROJECT: 'project:create',
  READ_PROJECT: 'project:read',
  SAVE_LAYOUT: 'project:saveLayout',

  // Fichiers
  LIST_FILES: 'file:list',
  READ_FILE: 'file:read',
  SAVE_FILE: 'file:save',
  SAVE_FILE_AS: 'file:saveAs',
  CREATE_FILE: 'file:create',
  DELETE_FILE: 'file:delete',
  RENAME_FILE: 'file:rename',

  // Export
  EXPORT_DIAGRAM: 'export:diagram',
  EXPORT_PROJECT: 'export:project',
  EXPORT_RENDERED: 'export:rendered',

  // Environnement / templates
  CHECK_ENVIRONMENT: 'env:check',
  LIST_TEMPLATES: 'templates:list',
  READ_TEMPLATE: 'templates:read',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Extension d'un fichier de projet PlantUML Studio. */
export const PROJECT_FILE_EXTENSION = '.plantumlproj';

/** Extensions considérées comme des sources PlantUML. */
export const PUML_EXTENSIONS = ['.puml', '.plantuml', '.pu', '.iuml', '.wsd'] as const;

/** Délai de debounce (ms) avant de déclencher un rendu depuis l'éditeur. */
export const DEFAULT_RENDER_DEBOUNCE_MS = 400;

/** Bornes du zoom de la prévisualisation. */
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;

/** Contenu inséré dans un nouveau fichier .puml. */
export const NEW_FILE_TEMPLATE = `@startuml
' Nouveau diagramme — remplacez ce contenu
title Mon diagramme

Alice -> Bob : Bonjour
Bob --> Alice : Salut

@enduml
`;

export const APP_ID = 'com.plantumlstudio.app';
export const APP_NAME = 'PlantUML Studio';
