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
  /**
   * États précédents de la disposition, du plus ancien au plus récent.
   *
   * Une pile d'instantanés plutôt qu'un journal d'actions : déplacer un
   * élément, optimiser l'ensemble et remettre un élément à sa place sont alors
   * annulables par le même chemin, sans code particulier pour chacun.
   */
  layoutHistory: LayoutOffsets[];

  /**
   * Ouvre un fichier, avec la disposition que le projet a conservée pour lui.
   */
  openFile(filePath: string, content: string, offsets?: LayoutOffsets): void;
  openDraft(content?: string): void;
  setContent(content: string): void;
  markSaved(filePath?: string): void;
  closeFile(): void;
  requestRevealLine(line: number): void;
  consumeRevealLine(): void;
  /**
   * Ouvre un geste de déplacement : c'est ici que l'état est mémorisé.
   *
   * Un glisser à la souris appelle `moveElement` des dizaines de fois ;
   * mémoriser à chaque appel ferait reculer l'annulation d'un pixel au lieu
   * d'un geste. La borne, c'est l'appui du bouton, pas le mouvement.
   */
  beginMove(): void;
  moveElement(id: string, offset: Point): void;
  /** Remplace tous les décalages d'un coup — résultat d'une optimisation. */
  applyLayout(offsets: LayoutOffsets): void;
  /** Remet un seul élément à la place calculée par PlantUML. */
  resetElement(id: string): void;
  /** Revient à l'état précédent de la disposition. */
  undoLayout(): void;
  resetLayout(): void;
}

/**
 * Profondeur de l'historique.
 *
 * Au-delà, les états les plus anciens sont oubliés : une session de mise en
 * page peut compter des centaines de petits déplacements, et les conserver
 * tous n'apporterait rien qu'une consommation qui grimpe.
 */
const PROFONDEUR_HISTORIQUE = 50;

function empiler(historique: LayoutOffsets[], etat: LayoutOffsets): LayoutOffsets[] {
  return [...historique, etat].slice(-PROFONDEUR_HISTORIQUE);
}

export const useEditorStore = create<EditorState>()((set) => ({
  filePath: null,
  content: '',
  savedContent: '',
  revealLine: null,
  layoutOffsets: {},
  layoutHistory: [],

  // Les décalages appartiennent au diagramme affiché : ouvrir un autre fichier
  // installe les siens, conservés par le projet, ou repart à plat.
  openFile: (filePath, content, offsets = {}) =>
    set({
      filePath,
      content,
      savedContent: content,
      revealLine: null,
      layoutOffsets: offsets,
      layoutHistory: [],
    }),

  // Un brouillon neuf n'est pas « modifié » : son contenu de référence est
  // celui qu'on vient d'y placer. Sans cela, l'application demanderait
  // confirmation avant d'insérer un modèle alors que rien n'a été saisi.
  openDraft: (content = NEW_FILE_TEMPLATE) =>
    set({
      filePath: null,
      content,
      savedContent: content,
      revealLine: null,
      layoutOffsets: {},
      layoutHistory: [],
    }),

  setContent: (content) => set({ content }),

  markSaved: (filePath) =>
    set((state) => ({
      filePath: filePath ?? state.filePath,
      savedContent: state.content,
    })),

  closeFile: () =>
    set({
      filePath: null,
      content: '',
      savedContent: '',
      revealLine: null,
      layoutOffsets: {},
      layoutHistory: [],
    }),

  requestRevealLine: (line) => set({ revealLine: line }),
  consumeRevealLine: () => set({ revealLine: null }),

  beginMove: () =>
    set((state) => ({ layoutHistory: empiler(state.layoutHistory, state.layoutOffsets) })),

  moveElement: (id, offset) =>
    set((state) => ({ layoutOffsets: { ...state.layoutOffsets, [id]: offset } })),

  applyLayout: (offsets) =>
    set((state) => ({
      layoutOffsets: offsets,
      layoutHistory: empiler(state.layoutHistory, state.layoutOffsets),
    })),

  resetElement: (id) =>
    set((state) => {
      if (!(id in state.layoutOffsets)) return state;
      const suivant = { ...state.layoutOffsets };
      delete suivant[id];
      return {
        layoutOffsets: suivant,
        layoutHistory: empiler(state.layoutHistory, state.layoutOffsets),
      };
    }),

  undoLayout: () =>
    set((state) => {
      const precedent = state.layoutHistory[state.layoutHistory.length - 1];
      if (precedent === undefined) return state;
      return {
        layoutOffsets: precedent,
        layoutHistory: state.layoutHistory.slice(0, -1),
      };
    }),

  resetLayout: () =>
    set((state) =>
      Object.keys(state.layoutOffsets).length === 0
        ? state
        : { layoutOffsets: {}, layoutHistory: empiler(state.layoutHistory, state.layoutOffsets) }
    ),
}));

/** `true` si le contenu de l'éditeur diffère du disque. */
export function selectIsDirty(state: EditorState): boolean {
  return state.content !== state.savedContent;
}
