/**
 * Mise en colonnes des acteurs d'un diagramme de cas d'utilisation.
 *
 * Le formalisme impose une disposition : acteurs **principaux** en colonne à
 * gauche, acteurs **secondaires** en colonne à droite, cas d'utilisation entre
 * les deux.
 *
 * Le sens d'écriture des associations suffit à décider du **côté** — Graphviz
 * place la cible d'une association à droite de sa source —, mais pas de la
 * position verticale : les acteurs secondaires atterrissent volontiers en bas,
 * avec de longues diagonales. Aucune directive PlantUML ne contraint cet axe.
 *
 * Ce module ferme l'écart après le rendu, en déplaçant les acteurs par le même
 * mécanisme de décalages que l'édition à la souris : le résultat est donc
 * annulable et conservé à l'export.
 */

import { boxCenter, type Box, type LayoutOffsets } from './diagramLayout';

/** Écart laissé entre une colonne d'acteurs et le reste du diagramme. */
export const COLUMN_GAP = 60;
/** Écart vertical minimal entre deux acteurs d'une même colonne. */
export const ACTOR_SPACING = 30;

export interface ColumnInput {
  /** Boîtes de tous les éléments du diagramme, par identifiant. */
  boxes: ReadonlyMap<string, Box>;
  /** Acteurs principaux, dans l'ordre où ils doivent apparaître. */
  primary: readonly string[];
  /** Acteurs secondaires, dans le même esprit. */
  secondary: readonly string[];
}

/** Réunion de plusieurs boîtes. */
function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Décalages qui rangent les acteurs en deux colonnes.
 *
 * Le **noyau** — tout ce qui n'est pas un acteur : cas d'utilisation et cadre
 * du système — sert de référence. Les acteurs se placent de part et d'autre,
 * répartis régulièrement sur sa hauteur, dans l'ordre donné : celui de la
 * source, qui est aussi celui de la chaîne de généralisations.
 *
 * Les acteurs ne sont jamais tassés : si la hauteur du noyau ne suffit pas, la
 * colonne déborde vers le bas plutôt que de faire se chevaucher deux acteurs.
 */
export function arrangeUseCaseColumns(input: ColumnInput): LayoutOffsets {
  const acteurs = new Set([...input.primary, ...input.secondary]);
  const noyau = union(
    Array.from(input.boxes.entries())
      .filter(([id]) => !acteurs.has(id))
      .map(([, box]) => box)
  );
  if (!noyau) return {};

  const offsets: LayoutOffsets = {};

  const placer = (ids: readonly string[], cote: 'gauche' | 'droite') => {
    const boites = ids
      .map((id) => ({ id, box: input.boxes.get(id) }))
      .filter((entree): entree is { id: string; box: Box } => entree.box !== undefined);
    if (boites.length === 0) return;

    const plusLarge = Math.max(...boites.map((entree) => entree.box.width));
    // La colonne se colle au noyau : bord droit des principaux contre son bord
    // gauche, et l'inverse pour les secondaires.
    const gaucheColonne =
      cote === 'gauche' ? noyau.x - COLUMN_GAP - plusLarge : noyau.x + noyau.width + COLUMN_GAP;

    const hauteurNecessaire = boites.reduce(
      (somme, entree, rang) => somme + entree.box.height + (rang > 0 ? ACTOR_SPACING : 0),
      0
    );
    const hauteur = Math.max(noyau.height, hauteurNecessaire);
    const pas = hauteur / boites.length;
    const departY = noyau.y + (noyau.height - hauteur) / 2;

    boites.forEach((entree, rang) => {
      const centreVise = departY + pas * (rang + 0.5);
      const centreActuel = boxCenter(entree.box);
      // Chaque acteur est centré horizontalement dans sa colonne : les
      // libellés de largeurs différentes restent alignés sur leur milieu.
      const xVise = gaucheColonne + (plusLarge - entree.box.width) / 2;
      offsets[entree.id] = {
        x: xVise - entree.box.x,
        y: centreVise - centreActuel.y,
      };
    });
  };

  placer(input.primary, 'gauche');
  placer(input.secondary, 'droite');

  return offsets;
}
