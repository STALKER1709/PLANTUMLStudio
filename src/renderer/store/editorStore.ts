import { create } from 'zustand';

import { NEW_FILE_TEMPLATE } from '../../shared/constants';

interface EditorState {
  /** Chemin absolu du fichier ouvert, `null` pour un brouillon non enregistré. */
  filePath: string | null;
  content: string;
  /** Dernier contenu écrit sur disque, base de comparaison pour `isDirty`. */
  savedContent: string;
  /** Ligne à révéler dans Monaco (clic sur une erreur), consommée par l'éditeur. */
  revealLine: number | null;

  openFile(filePath: string, content: string): void;
  openDraft(content?: string): void;
  setContent(content: string): void;
  markSaved(filePath?: string): void;
  closeFile(): void;
  requestRevealLine(line: number): void;
  consumeRevealLine(): void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  filePath: null,
  content: '',
  savedContent: '',
  revealLine: null,

  openFile: (filePath, content) =>
    set({ filePath, content, savedContent: content, revealLine: null }),

  openDraft: (content = NEW_FILE_TEMPLATE) =>
    set({ filePath: null, content, savedContent: '', revealLine: null }),

  setContent: (content) => set({ content }),

  markSaved: (filePath) =>
    set((state) => ({
      filePath: filePath ?? state.filePath,
      savedContent: state.content,
    })),

  closeFile: () => set({ filePath: null, content: '', savedContent: '', revealLine: null }),

  requestRevealLine: (line) => set({ revealLine: line }),
  consumeRevealLine: () => set({ revealLine: null }),
}));

/** `true` si le contenu de l'éditeur diffère du disque. */
export function selectIsDirty(state: EditorState): boolean {
  return state.content !== state.savedContent;
}
