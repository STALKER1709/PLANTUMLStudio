import { create } from 'zustand';

import { NEW_FILE_TEMPLATE } from '../../shared/constants';
import type { LayoutOffsets, Point } from '../utils/diagramLayout';

interface EditorState {
  /** Chemin absolu du fichier ouvert, `null` pour un brouillon non enregistré. */
  filePath: string | null;
  content: string;
  /** Dernier contenu écrit sur disque, base de comparaison pour `isDirty`. */
  savedContent: string;
  /** Ligne à révéler dans Monaco (clic sur une erreur), consommée par l'éditeur. */
  revealLine: number | null;
  /**
   * Déplacements appliqués au rendu, par identifiant d'élément. Ils se
   * superposent à la mise en page calculée sans modifier la source, et
   * survivent aux régénérations tant que l'élément garde son nom.
   */
  layoutOffsets: LayoutOffsets;

  openFile(filePath: string, content: string): void;
  openDraft(content?: string): void;
  setContent(content: string): void;
  markSaved(filePath?: string): void;
  closeFile(): void;
  requestRevealLine(line: number): void;
  consumeRevealLine(): void;
  moveElement(id: string, offset: Point): void;
  resetLayout(): void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  filePath: null,
  content: '',
  savedContent: '',
  revealLine: null,
  layoutOffsets: {},

  // Ouvrir un autre fichier remet la disposition à plat : les décalages
  // appartiennent au diagramme affiché.
  openFile: (filePath, content) =>
    set({ filePath, content, savedContent: content, revealLine: null, layoutOffsets: {} }),

  // Un brouillon neuf n'est pas « modifié » : son contenu de référence est
  // celui qu'on vient d'y placer. Sans cela, l'application demanderait
  // confirmation avant d'insérer un modèle alors que rien n'a été saisi.
  openDraft: (content = NEW_FILE_TEMPLATE) =>
    set({ filePath: null, content, savedContent: content, revealLine: null, layoutOffsets: {} }),

  setContent: (content) => set({ content }),

  markSaved: (filePath) =>
    set((state) => ({
      filePath: filePath ?? state.filePath,
      savedContent: state.content,
    })),

  closeFile: () =>
    set({ filePath: null, content: '', savedContent: '', revealLine: null, layoutOffsets: {} }),

  requestRevealLine: (line) => set({ revealLine: line }),
  consumeRevealLine: () => set({ revealLine: null }),

  moveElement: (id, offset) =>
    set((state) => ({ layoutOffsets: { ...state.layoutOffsets, [id]: offset } })),

  resetLayout: () => set({ layoutOffsets: {} }),
}));

/** `true` si le contenu de l'éditeur diffère du disque. */
export function selectIsDirty(state: EditorState): boolean {
  return state.content !== state.savedContent;
}
