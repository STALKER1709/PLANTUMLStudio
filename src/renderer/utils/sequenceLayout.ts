/**
 * Édition du rendu : cas particulier du diagramme de séquence.
 *
 * PlantUML y emploie un tout autre vocabulaire que dans les autres diagrammes :
 * les participants sont annotés `data-participant` et non `data-entity`, les
 * messages `data-participant-1` / `data-participant-2` et non `data-entity-1`,
 * et chaque participant est dessiné en trois morceaux — sa tête, son pied, et
 * la ligne de vie qui les relie, identifiée par un simple `<title>`.
 *
 * Le déplacement y est aussi de nature différente : l'axe vertical porte la
 * chronologie, il n'est donc pas déplaçable. Un participant ne se règle
 * qu'horizontalement, ce qui revient à choisir l'ordre et l'espacement des
 * colonnes.
 */

import type { LayoutOffsets, Point } from './diagramLayout';

/** Les trois morceaux qui composent un participant, et son abscisse d'origine. */
export interface ParticipantHandle {
  id: string;
  groups: SVGGElement[];
  /** Abscisse de la ligne de vie, à laquelle s'accrochent les messages. */
  x: number;
}

const NEGLIGIBLE = 1e-6;

/** Attributs où sont mémorisées les coordonnées d'origine. */
const ORIGINAL_X1 = 'data-puml-x1';
const ORIGINAL_X2 = 'data-puml-x2';
const ORIGINAL_POINTS = 'data-puml-points';
const ORIGINAL_TEXT_X = 'data-puml-x';

/** `true` si le SVG rendu est un diagramme de séquence. */
export function isSequenceDiagram(root: SVGSVGElement): boolean {
  return root.getAttribute('data-diagram-type') === 'SEQUENCE';
}

/** Recense les participants et leurs trois morceaux. */
export function indexParticipants(root: SVGSVGElement): Map<string, ParticipantHandle> {
  const participants = new Map<string, ParticipantHandle>();

  const handleFor = (id: string): ParticipantHandle => {
    const existing = participants.get(id);
    if (existing) return existing;
    const created: ParticipantHandle = { id, groups: [], x: Number.NaN };
    participants.set(id, created);
    return created;
  };

  root.querySelectorAll<SVGGElement>('g.participant[data-participant]').forEach((group) => {
    const id = group.getAttribute('data-participant');
    if (id) handleFor(id).groups.push(group);
  });

  // La ligne de vie n'a ni classe ni attribut : seul son `<title>` la nomme.
  root.querySelectorAll<SVGTitleElement>('title').forEach((title) => {
    const group = title.parentElement as SVGGElement | null;
    const id = title.textContent?.trim();
    if (!group || !id || group.tagName.toLowerCase() !== 'g') return;
    if (!participants.has(id)) return;

    const handle = handleFor(id);
    handle.groups.push(group);
    // La ligne de vie devient saisissable comme le reste : c'est la cible la
    // plus facile à viser dans un diagramme de séquence.
    group.setAttribute('data-participant', id);
    const ligne = group.querySelector('line');
    if (ligne) handle.x = Number(ligne.getAttribute('x1'));
  });

  // Sans ligne de vie exploitable, le centre de la tête fait référence.
  participants.forEach((handle) => {
    if (Number.isFinite(handle.x) || handle.groups.length === 0) return;
    const rect = handle.groups[0].getBBox();
    handle.x = rect.x + rect.width / 2;
  });

  return participants;
}

/**
 * Applique les décalages à un diagramme de séquence : les participants glissent
 * horizontalement et les messages restent accrochés à leurs lignes de vie.
 */
export function applySequenceOffsets(root: SVGSVGElement, offsets: LayoutOffsets): void {
  const participants = indexParticipants(root);

  const decalage = (id: string | null | undefined): number => {
    if (!id) return 0;
    // Seule l'abscisse compte : la chronologie n'est pas négociable.
    return participants.has(id) ? (offsets[id]?.x ?? 0) : 0;
  };

  participants.forEach((participant) => {
    const dx = decalage(participant.id);
    participant.groups.forEach((group) => {
      if (Math.abs(dx) > NEGLIGIBLE) group.setAttribute('transform', `translate(${round(dx)},0)`);
      else group.removeAttribute('transform');
    });
  });

  root.querySelectorAll<SVGGElement>('g.message').forEach((message) => {
    reflowMessage(message, participants, {
      depart: decalage(message.getAttribute('data-participant-1')),
      arrivee: decalage(message.getAttribute('data-participant-2')),
    });
  });
}

function reflowMessage(
  message: SVGGElement,
  participants: Map<string, ParticipantHandle>,
  dx: { depart: number; arrivee: number }
): void {
  const bouge = Math.abs(dx.depart) > NEGLIGIBLE || Math.abs(dx.arrivee) > NEGLIGIBLE;
  if (!bouge) {
    translateMessage(message, 0);
    return;
  }

  // Les deux extrémités suivent le même mouvement — message réflexif, ou
  // participants déplacés de concert : le tracé reste valable tel quel.
  if (Math.abs(dx.depart - dx.arrivee) < NEGLIGIBLE) {
    translateMessage(message, dx.depart);
    return;
  }

  const xDepart = participants.get(message.getAttribute('data-participant-1') ?? '')?.x;
  const xArrivee = participants.get(message.getAttribute('data-participant-2') ?? '')?.x;
  if (xDepart === undefined || xArrivee === undefined) {
    translateMessage(message, 0);
    return;
  }

  // Chaque abscisse suit la ligne de vie dont elle est la plus proche : le
  // message s'allonge ou se raccourcit au lieu d'être étiré uniformément.
  const suivre = (x: number): number =>
    x +
    nearestShift(
      x,
      { x: xDepart, dx: dx.depart },
      { x: xArrivee, dx: dx.arrivee }
    );

  message.querySelectorAll<SVGLineElement>('line').forEach((ligne) => {
    const x1 = readOriginal(ligne, ORIGINAL_X1, 'x1');
    const x2 = readOriginal(ligne, ORIGINAL_X2, 'x2');
    if (x1 !== null) ligne.setAttribute('x1', round(suivre(Number(x1))));
    if (x2 !== null) ligne.setAttribute('x2', round(suivre(Number(x2))));
  });

  // La pointe de flèche est déplacée d'un bloc : elle ne doit ni s'étirer ni
  // se dédoubler, sa position est celle de la ligne de vie qu'elle touche.
  message.querySelectorAll<SVGPolygonElement>('polygon').forEach((pointe) => {
    const points = readOriginal(pointe, ORIGINAL_POINTS, 'points');
    if (points === null) return;
    const nombres = lireNombres(points);
    if (nombres.length < 2) return;
    const glissement = suivre(nombres[0]) - nombres[0];
    pointe.setAttribute('points', decalerPoints(nombres, glissement));
  });

  // L'étiquette se recentre sur le nouveau segment.
  translateTexts(message, (dx.depart + dx.arrivee) / 2);
}

/** Déplace tout un message d'un bloc, ou le restitue si le décalage est nul. */
function translateMessage(message: SVGGElement, dx: number): void {
  message.querySelectorAll<SVGLineElement>('line').forEach((ligne) => {
    const x1 = readOriginal(ligne, ORIGINAL_X1, 'x1');
    const x2 = readOriginal(ligne, ORIGINAL_X2, 'x2');
    if (x1 !== null) ligne.setAttribute('x1', round(Number(x1) + dx));
    if (x2 !== null) ligne.setAttribute('x2', round(Number(x2) + dx));
  });

  message.querySelectorAll<SVGPolygonElement>('polygon').forEach((pointe) => {
    const points = readOriginal(pointe, ORIGINAL_POINTS, 'points');
    if (points !== null) pointe.setAttribute('points', decalerPoints(lireNombres(points), dx));
  });

  translateTexts(message, dx);
}

function translateTexts(message: SVGGElement, dx: number): void {
  message.querySelectorAll<SVGTextElement>('text').forEach((texte) => {
    const x = readOriginal(texte, ORIGINAL_TEXT_X, 'x');
    if (x !== null) texte.setAttribute('x', round(Number(x) + dx));
  });
}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function lireNombres(points: string): number[] {
  return (points.match(NUMBER) ?? []).map(Number);
}

function decalerPoints(nombres: number[], dx: number): string {
  const sortie: string[] = [];
  for (let index = 0; index + 1 < nombres.length; index += 2) {
    sortie.push(`${round(nombres[index] + dx)},${round(nombres[index + 1])}`);
  }
  return sortie.join(' ');
}

/** Lit une coordonnée d'origine, en la mémorisant au premier passage. */
function readOriginal(element: Element, storageAttribute: string, attribute: string): string | null {
  const memorised = element.getAttribute(storageAttribute);
  if (memorised !== null) return memorised;

  const current = element.getAttribute(attribute);
  if (current === null) return null;

  element.setAttribute(storageAttribute, current);
  return current;
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** Décalage d'un participant : seule son abscisse a un sens. */
export function horizontalOnly(offset: Point): Point {
  return { x: offset.x, y: 0 };
}

/** Une ligne de vie : où elle était, de combien elle s'est déplacée. */
export interface Lifeline {
  x: number;
  dx: number;
}

/**
 * Déplacement à appliquer à l'abscisse d'un morceau de message : celui de la
 * ligne de vie dont ce point est le plus proche.
 *
 * C'est ce qui permet à un message de s'allonger d'un seul côté quand un seul
 * de ses deux participants a bougé — plutôt que d'être étiré tout entier, ce
 * qui décollerait sa pointe de flèche de la ligne de vie visée.
 */
export function nearestShift(x: number, depart: Lifeline, arrivee: Lifeline): number {
  return Math.abs(x - depart.x) <= Math.abs(x - arrivee.x) ? depart.dx : arrivee.dx;
}
