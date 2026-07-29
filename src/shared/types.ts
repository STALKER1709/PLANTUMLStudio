/**
 * Types partagés entre le main process, le preload et le renderer.
 * Aucun import Node/Electron ici : ce fichier est compilé par les deux chaînes.
 */

export type DiagramFormat = 'svg' | 'png' | 'pdf';

/** Erreur PlantUML normalisée (message déjà traduit en français si reconnu). */
export interface PlantUMLError {
  /** Message lisible, en français lorsque le motif est reconnu. */
  message: string;
  /** Numéro de ligne dans la source, si PlantUML l'a fourni. */
  line?: number;
  /** Ligne brute renvoyée par le moteur (utile au débogage). */
  raw: string;
}

export interface RenderResult {
  success: boolean;
  format: DiagramFormat;
  /** Renseigné uniquement pour le format `svg`. */
  svgContent?: string;
  /** Renseigné lorsqu'un rendu a été écrit sur disque. */
  outputPath?: string;
  errors?: PlantUMLError[];
  durationMs: number;
}

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface ProjectSettings {
  /** Format d'export par défaut du projet. */
  defaultFormat: DiagramFormat;
  /** Dossier (relatif au projet) où sont écrits les exports. */
  exportDirectory: string;
}

export interface ProjectMeta {
  name: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
}

export interface Project {
  /** Dossier racine du projet. */
  rootPath: string;
  /** Chemin du fichier `.plantumlproj`. */
  projectFilePath: string;
  meta: ProjectMeta;
}

export interface EnvironmentStatus {
  javaAvailable: boolean;
  /** Chemin du binaire java retenu (embarqué ou système). */
  javaPath: string | null;
  javaVersion: string | null;
  /** `true` si le java retenu provient de `resources/jre`. */
  javaIsEmbedded: boolean;
  plantumlJarAvailable: boolean;
  plantumlJarPath: string | null;
  graphvizAvailable: boolean;
  graphvizPath: string | null;
  /** Moteur de mise en page effectif : Graphviz ou le repli Java « smetana ». */
  layoutEngine: 'graphviz' | 'smetana';
  /** Diagnostics en français à afficher dans l'écran de démarrage. */
  diagnostics: string[];
  ready: boolean;
}

export interface ExportRequest {
  source: string;
  format: DiagramFormat;
  /** Chemin de destination complet, extension incluse. */
  targetPath: string;
}

export interface ExportProjectRequest {
  /** Fichiers `.puml` à exporter. */
  files: string[];
  format: DiagramFormat;
  /** Chemin de l'archive `.zip` à produire. */
  targetPath: string;
}

export interface ExportResult {
  success: boolean;
  outputPath?: string;
  /** Fichiers dont l'export a échoué, avec le motif. */
  failures?: Array<{ file: string; reason: string }>;
  errors?: PlantUMLError[];
}

/** Les 14 diagrammes UML 2.5 se répartissent en deux familles. */
export type DiagramCategory = 'structurel' | 'comportemental';

export interface TemplateSummary {
  id: string;
  /** Libellé affiché dans le sélecteur de diagramme. */
  label: string;
  /** Famille UML, déclarée par « ' @categorie … » en tête de modèle. */
  category: DiagramCategory;
  fileName: string;
}

export interface SaveFileResult {
  success: boolean;
  path?: string;
  error?: string;
}

/** Enveloppe uniforme des réponses IPC susceptibles d'échouer. */
export interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * API exposée au renderer par le preload via `contextBridge`.
 * Toute évolution ici doit être répercutée dans `src/preload/preload.ts`.
 */
export interface ElectronAPI {
  renderDiagram(source: string, format: DiagramFormat): Promise<RenderResult>;

  openProject(): Promise<IpcResult<Project>>;
  createProject(): Promise<IpcResult<Project>>;
  readProject(projectPath: string): Promise<IpcResult<Project>>;

  listProjectFiles(projectPath: string): Promise<IpcResult<FileNode>>;
  readFile(filePath: string): Promise<IpcResult<string>>;
  saveFile(filePath: string, content: string): Promise<SaveFileResult>;
  createFile(dirPath: string, fileName: string, content?: string): Promise<IpcResult<string>>;
  deleteFile(filePath: string): Promise<IpcResult<null>>;
  renameFile(oldPath: string, newName: string): Promise<IpcResult<string>>;

  exportDiagram(source: string, format: DiagramFormat): Promise<IpcResult<ExportResult>>;
  exportProject(files: string[], format: DiagramFormat): Promise<IpcResult<ExportResult>>;

  checkEnvironment(): Promise<EnvironmentStatus>;
  listTemplates(): Promise<IpcResult<TemplateSummary[]>>;
  readTemplate(id: string): Promise<IpcResult<string>>;
}
