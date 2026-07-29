import { create } from 'zustand';

import type { FileNode, Project } from '../../shared/types';
import { translate } from '../i18n';
import { useEditorStore } from './editorStore';
import { useSettingsStore } from './settingsStore';
import { useToastStore } from './toastStore';

interface ProjectState {
  project: Project | null;
  tree: FileNode | null;
  loading: boolean;

  openProject(): Promise<void>;
  createProject(): Promise<void>;
  refreshTree(): Promise<void>;
  openFile(filePath: string): Promise<void>;
  saveCurrentFile(): Promise<void>;
  saveCurrentFileAs(): Promise<void>;
  createFile(directory: string, fileName: string): Promise<void>;
  renameFile(filePath: string, newName: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
}

function t(key: string, params?: Record<string, string | number>): string {
  return translate(useSettingsStore.getState().language, key, params);
}

function notifyError(message: string): void {
  useToastStore.getState().push('error', t('toast.error', { message }));
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: null,
  tree: null,
  loading: false,

  openProject: async () => {
    set({ loading: true });
    try {
      const result = await window.electronAPI.openProject();
      if (!result.ok || !result.data) {
        // L'annulation utilisateur n'est pas une erreur : on reste silencieux.
        if (result.error && !/annul/i.test(result.error)) notifyError(result.error);
        return;
      }
      set({ project: result.data });
      await get().refreshTree();
      useToastStore
        .getState()
        .push('success', t('toast.projectOpened', { name: result.data.meta.name }));
    } finally {
      set({ loading: false });
    }
  },

  createProject: async () => {
    set({ loading: true });
    try {
      const result = await window.electronAPI.createProject();
      if (!result.ok || !result.data) {
        if (result.error && !/annul/i.test(result.error)) notifyError(result.error);
        return;
      }
      set({ project: result.data });
      await get().refreshTree();
    } finally {
      set({ loading: false });
    }
  },

  refreshTree: async () => {
    const { project } = get();
    if (!project) {
      set({ tree: null });
      return;
    }

    const result = await window.electronAPI.listProjectFiles(project.rootPath);
    if (!result.ok || !result.data) {
      notifyError(result.error ?? t('errors.unknown'));
      return;
    }
    set({ tree: result.data });
  },

  openFile: async (filePath) => {
    const result = await window.electronAPI.readFile(filePath);
    if (!result.ok || result.data === undefined) {
      notifyError(result.error ?? t('errors.unknown'));
      return;
    }
    useEditorStore.getState().openFile(filePath, result.data);
  },

  saveCurrentFile: async () => {
    const { filePath, content } = useEditorStore.getState();
    // Un brouillon n'a pas encore de destination : on la demande.
    if (!filePath) {
      await get().saveCurrentFileAs();
      return;
    }

    const result = await window.electronAPI.saveFile(filePath, content);
    if (!result.success) {
      notifyError(result.error ?? t('errors.unknown'));
      return;
    }

    useEditorStore.getState().markSaved(filePath);
    useToastStore.getState().push('success', t('toast.saved', { name: fileName(filePath) }));
  },

  saveCurrentFileAs: async () => {
    const { filePath, content } = useEditorStore.getState();
    const suggested = filePath ? fileName(filePath) : 'diagramme.puml';

    const result = await window.electronAPI.saveFileAs(content, suggested);
    if (!result.ok || !result.data) {
      // L'annulation utilisateur n'est pas une erreur.
      if (result.error && !/annul/i.test(result.error)) notifyError(result.error);
      return;
    }

    // Le fichier devient le document courant : les enregistrements suivants
    // vont droit à cette destination.
    useEditorStore.getState().markSaved(result.data);
    // S'il a été déposé dans le projet ouvert, l'arborescence doit le montrer.
    await get().refreshTree();
    useToastStore.getState().push('success', t('toast.saved', { name: fileName(result.data) }));
  },

  createFile: async (directory, name) => {
    const result = await window.electronAPI.createFile(directory, name);
    if (!result.ok || !result.data) {
      notifyError(result.error ?? t('errors.unknown'));
      return;
    }

    await get().refreshTree();
    await get().openFile(result.data);
    useToastStore
      .getState()
      .push('success', t('toast.fileCreated', { name: fileName(result.data) }));
  },

  renameFile: async (filePath, newName) => {
    const result = await window.electronAPI.renameFile(filePath, newName);
    if (!result.ok || !result.data) {
      notifyError(result.error ?? t('errors.unknown'));
      return;
    }

    await get().refreshTree();
    // Le fichier renommé reste ouvert : on met à jour le chemin courant.
    if (useEditorStore.getState().filePath === filePath) {
      await get().openFile(result.data);
    }
  },

  deleteFile: async (filePath) => {
    const result = await window.electronAPI.deleteFile(filePath);
    if (!result.ok) {
      notifyError(result.error ?? t('errors.unknown'));
      return;
    }

    if (useEditorStore.getState().filePath === filePath) {
      useEditorStore.getState().closeFile();
    }
    await get().refreshTree();
    useToastStore.getState().push('info', t('toast.fileDeleted', { name: fileName(filePath) }));
  },
}));
