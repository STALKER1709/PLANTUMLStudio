/**
 * Édition du rendu : déplacement des éléments d'un diagramme généré.
 *
 * PlantUML émet un SVG richement annoté — chaque élément porte son identifiant
 * de source (`data-entity`), chaque lien ses deux extrémités (`data-entity-1`,
 * `data-entity-2`). C'est ce qui rend le déplacement possible sans toucher au
 * texte : on applique des décalages par-dessus la mise en page calculée.
 *
 * Les décalages sont indexés par identifiant de source : ils survivent donc
 * aux régénérations du diagramme tant que l'élément garde son nom.
 */

import { applySequenceOffsets, isSequenceDiagram } from './sequenceLayout';

export interface Point {
  x: number;
  y: number;
}

/** Décalages appliqués au rendu, par identifiant d'élément. */
export type LayoutOffsets = Record<string, Point>;

/**
 * Similitude (translation + rotation + homothétie) envoyant le segment `p0p1`
 * sur `q0q1`. C'est la transformation qui garde à un lien la forme de son
 * tracé tout en le raccrochant à ses extrémités déplacées.
 */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

const IDENTITY: Similarity = { a: 1, b: 0, tx: 0, ty: 0 };

export function similarityBetween(p0: Point, p1: Point, q0: Point, q1: Point): Similarity {
  const px = p1.x - p0.x;
  const py = p1.y - p0.y;
  const normeSource = px * px + py * py;

  // Extrémités confondues (lien réflexif) : une similitude n'est pas définie,
  // on se rabat sur une simple translation.
  if (normeSource < 1e-9) {
    return { a: 1, b: 0, tx: q0.x - p0.x, ty: q0.y - p0.y };
  }

  const qx = q1.x - q0.x;
  const qy = q1.y - q0.y;

  // Écriture complexe : (a + ib) = (q1 - q0) / (p1 - p0)
  const a = (qx * px + qy * py) / normeSource;
  const b = (qy * px - qx * py) / normeSource;

  return {
    a,
    b,
    tx: q0.x - (a * p0.x - b * p0.y),
    ty: q0.y - (b * p0.x + a * p0.y),
  };
}

export function applySimilarity(transform: Similarity, point: Point): Point {
  return {
    x: transform.a * point.x - transform.b * point.y + transform.tx,
    y: transform.b * point.x + transform.a * point.y + transform.ty,
  };
}

export function isIdentity(transform: Similarity, tolerance = 1e-6): boolean {
  return (
    Math.abs(transform.a - 1) < tolerance &&
    Math.abs(transform.b) < tolerance &&
    Math.abs(transform.tx) < tolerance &&
    Math.abs(transform.ty) < tolerance
  );
}

export function identitySimilarity(): Similarity {
  return { ...IDENTITY };
}

/** Nombre décimal, éventuellement signé ou exponentiel. */
const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/**
 * Transforme les coordonnées d'un attribut `d` de chemin SVG.
 *
 * PlantUML n'émet que des commandes absolues (M, L, C, Q…) dont les arguments
 * vont deux par deux. La fonction laisse donc les lettres en place et ne
 * réécrit que les couples de nombres.
 */
export function transformPathData(data: string, transform: Similarity): string {
  return data.replace(
    /([A-Za-z])([^A-Za-z]*)/g,
    (_match, command: string, argumentList: string) => {
      // `A` (arc) mêle rayons et angles aux coordonnées : hors du domaine
      // couvert ici, on le laisse intact plutôt que de le corrompre.
      if (command.toUpperCase() === 'A') return command + argumentList;

      const numbers = argumentList.match(NUMBER);
      if (!numbers || numbers.length < 2) return command + argumentList;

      const transformed: string[] = [];
      for (let index = 0; index + 1 < numbers.length; index += 2) {
        const point = applySimilarity(transform, {
          x: Number(numbers[index]),
          y: Number(numbers[index + 1]),
        });
        transformed.push(round(point.x), round(point.y));
      }
      // Nombre impair d'arguments : on préserve le dernier tel quel.
      if (numbers.length % 2 === 1) transformed.push(numbers[numbers.length - 1]);

      return `${command}${transformed.join(',')} `;
    }
  );
}

/** Transforme une liste de points (`polygon`, `polyline`). */
export function transformPoints(points: string, transform: Similarity): string {
  const numbers = points.match(NUMBER);
  if (!numbers) return points;

  const transformed: string[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const point = applySimilarity(transform, {
      x: Number(numbers[index]),
      y: Number(numbers[index + 1]),
    });
    transformed.push(`${round(point.x)},${round(point.y)}`);
  }
  return transformed.join(' ');
}

/** Premier et dernier point d'un attribut `d`. */
export function pathEndpoints(data: string): { start: Point; end: Point } | null {
  const numbers = data.match(NUMBER);
  if (!numbers || numbers.length < 4) return null;

  return {
    start: { x: Number(numbers[0]), y: Number(numbers[1]) },
    end: {
      x: Number(numbers[numbers.length - 2]),
      y: Number(numbers[numbers.length - 1]),
    },
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function addOffset(point: Point, offset: Point | undefined): Point {
  return offset ? { x: point.x + offset.x, y: point.y + offset.y } : point;
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** Ce qu'il faut connaître d'un élément pour établir les emboîtements. */
export interface Containable {
  id: string;
  /** Rectangle englobant d'origine, invariant sous nos transformations. */
  box: Box;
  /** `true` pour un regroupement, seul candidat au rôle de contenant. */
  container: boolean;
}

/** Tolérance d'emboîtement, en unités SVG : absorbe l'épaisseur des traits. */
const CONTAINMENT_TOLERANCE = 1.5;

function boxArea(box: Box): number {
  return box.width * box.height;
}

/** `true` si `inner` tient entièrement dans `outer`, qui est strictement plus grand. */
export function containsBox(outer: Box, inner: Box): boolean {
  return (
    boxArea(outer) > boxArea(inner) &&
    outer.x - CONTAINMENT_TOLERANCE <= inner.x &&
    outer.y - CONTAINMENT_TOLERANCE <= inner.y &&
    outer.x + outer.width + CONTAINMENT_TOLERANCE >= inner.x + inner.width &&
    outer.y + outer.height + CONTAINMENT_TOLERANCE >= inner.y + inner.height
  );
}

/**
 * Reconstruit l'arbre d'emboîtement du diagramme : à chaque élément, le
 * regroupement qui le contient.
 *
 * Le SVG de PlantUML est plat — un paquetage et les classes qu'il renferme y
 * sont frères — et ne porte aucune information de parenté. Elle se déduit donc
 * de la géométrie : le contenant retenu est le plus petit de ceux qui englobent
 * l'élément, ce qui donne le bon parent même pour des paquetages imbriqués.
 */
export function buildHierarchy(items: readonly Containable[]): Map<string, string> {
  const parents = new Map<string, string>();
  const containers = items.filter((item) => item.container);
  if (containers.length === 0) return parents;

  items.forEach((item) => {
    let closest: Containable | undefined;
    containers.forEach((candidate) => {
      if (candidate.id === item.id || !containsBox(candidate.box, item.box)) return;
      if (!closest || boxArea(candidate.box) < boxArea(closest.box)) closest = candidate;
    });
    if (closest) parents.set(item.id, closest.id);
  });

  return parents;
}

/**
 * Décalage réellement subi par un élément : le sien, augmenté de ceux de tous
 * les regroupements qui le contiennent.
 *
 * C'est l'héritage attendu d'un diagramme : déplacer un paquetage emporte les
 * classes qu'il contient, et une classe déjà déplacée à la main conserve en
 * plus son propre décalage.
 */
export function resolveOffset(
  id: string,
  offsets: LayoutOffsets,
  parents: ReadonlyMap<string, string>
): Point {
  const total: Point = { x: 0, y: 0 };
  // Un emboîtement déduit de la géométrie ne devrait pas boucler ; la garde
  // évite qu'une géométrie inattendue ne fige l'interface.
  const visited = new Set<string>();
  let current: string | undefined = id;

  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    const own = offsets[current];
    if (own) {
      total.x += own.x;
      total.y += own.y;
    }
    current = parents.get(current);
  }

  return total;
}

const NEGLIGIBLE = 1e-6;

function isMoved(offset: Point): boolean {
  return Math.abs(offset.x) > NEGLIGIBLE || Math.abs(offset.y) > NEGLIGIBLE;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < NEGLIGIBLE && Math.abs(a.y - b.y) < NEGLIGIBLE;
}

/** Attributs où sont mémorisées les géométries d'origine, avant déplacement. */
const ORIGINAL_PATH = 'data-puml-d';
const ORIGINAL_POINTS = 'data-puml-points';
const ORIGINAL_X = 'data-puml-x';
const ORIGINAL_Y = 'data-puml-y';

export interface EntityHandle extends Containable {
  group: SVGGElement;
  /** Centre de la géométrie d'origine. */
  center: Point;
  /** `true` pour un cas d'utilisation : une flèche s'y arrête sur l'ovale. */
  ellipse: boolean;
}

/**
 * Éléments déplaçables : tout ce que PlantUML identifie par `data-entity`.
 *
 * `g.entity` couvre les classes, acteurs, cas d'utilisation, objets, composants,
 * artefacts et notes ; `g.cluster` les regroupements — paquetages, nœuds de
 * déploiement, frontières de système.
 */
export const MOVABLE_SELECTOR = 'g[data-entity]';

/**
 * Complète l'annotation du SVG là où PlantUML l'a omise.
 *
 * Les états d'un diagramme d'états ne reçoivent qu'un attribut `id` — alors que
 * les liens, eux, les désignent bien par `data-entity-1` / `data-entity-2`. On
 * leur pose l'attribut manquant, ce qui les rend déplaçables par le même chemin
 * que tout le reste.
 */
function annotateImplicitEntities(root: SVGSVGElement): void {
  root.querySelectorAll<SVGGElement>('g[id]:not([data-entity])').forEach((group) => {
    // Les groupes déjà classés (liens, regroupements) sont annotés correctement.
    if (group.classList.length > 0) return;
    const id = group.getAttribute('id');
    if (!id) return;
    // Un état imbriqué s'appelle « Composite.Etat » dans le SVG, mais « Etat »
    // dans les liens : c'est ce nom court qui sert de clef.
    group.setAttribute('data-entity', id.split('.').pop() as string);
  });
}

/** Recense les éléments déplaçables d'un diagramme rendu. */
export function indexEntities(root: SVGSVGElement): Map<string, EntityHandle> {
  const entities = new Map<string, EntityHandle>();
  annotateImplicitEntities(root);

  root.querySelectorAll<SVGGElement>(MOVABLE_SELECTOR).forEach((group) => {
    const id = group.getAttribute('data-entity');
    if (!id) return;

    // `getBBox` ignore la transformation propre du groupe : le centre reste
    // donc celui de la mise en page calculée par PlantUML, même après un
    // déplacement.
    const rect = group.getBBox();
    const box: Box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    entities.set(id, {
      id,
      group,
      box,
      center: boxCenter(box),
      // Un cas d'utilisation est dessiné par une ellipse : s'arrêter au
      // rectangle englobant laisserait un écart visible dans les angles.
      ellipse: group.querySelector('ellipse') !== null,
      container: group.classList.contains('cluster'),
    });
  });

  return entities;
}

/**
 * Applique les décalages au SVG rendu : les éléments sont translatés, et les
 * liens qui les touchent sont réécrits pour rester accrochés.
 *
 * La fonction est idempotente — elle repart toujours des géométries d'origine,
 * mémorisées au premier passage — et peut donc être rappelée à chaque
 * mouvement de souris sans que les transformations se cumulent.
 */
export function applyLayoutOffsets(root: SVGSVGElement, offsets: LayoutOffsets): void {
  // Le diagramme de séquence a sa propre géométrie : participants en colonnes,
  // messages accrochés aux lignes de vie.
  if (isSequenceDiagram(root)) {
    applySequenceOffsets(root, offsets);
    fitViewBox(root, Object.values(offsets).some(isMoved));
    return;
  }

  const entities = indexEntities(root);
  const parents = buildHierarchy(Array.from(entities.values()));

  // Les décalages hérités sont calculés une fois : les liens s'appuient sur les
  // mêmes valeurs que les éléments, ce qui garantit qu'ils restent accrochés.
  const applied = new Map<string, Point>();
  entities.forEach((entity) => {
    applied.set(entity.id, resolveOffset(entity.id, offsets, parents));
  });

  entities.forEach((entity) => {
    const offset = applied.get(entity.id) as Point;
    if (isMoved(offset)) translateGroup(entity.group, offset);
    else entity.group.removeAttribute('transform');
  });

  root.querySelectorAll<SVGGElement>('g.link[data-entity-1]').forEach((link) => {
    reflowLink(link, entities, applied);
  });

  fitViewBox(root, Array.from(applied.values()).some(isMoved));
}

const ORIGINAL_VIEWBOX = 'data-puml-viewbox';
const ORIGINAL_WIDTH = 'data-puml-width';
const ORIGINAL_HEIGHT = 'data-puml-height';
const ORIGINAL_STYLE = 'data-puml-style';
/** Marge laissée autour du contenu déplacé, en unités SVG. */
const VIEWBOX_MARGIN = 12;

/**
 * Étend la zone visible pour englober les éléments déplacés.
 *
 * Sans cela, un élément tiré au-delà des dimensions calculées par PlantUML
 * sort du cadre et se retrouve rogné. La zone ne fait que grandir : le
 * diagramme d'origine reste entièrement visible.
 */
function fitViewBox(root: SVGSVGElement, hasOffsets: boolean): void {
  const originalViewBox = readOriginal(root, ORIGINAL_VIEWBOX, 'viewBox');
  const originalWidth = readOriginal(root, ORIGINAL_WIDTH, 'width');
  const originalHeight = readOriginal(root, ORIGINAL_HEIGHT, 'height');
  // PlantUML fixe aussi les dimensions en style inline, qui l'emporte sur les
  // attributs : sans le mettre à jour, le contenu serait comprimé pour tenir
  // dans le cadre d'origine.
  const originalStyle = readOriginal(root, ORIGINAL_STYLE, 'style');

  if (!hasOffsets) {
    // Retour à la disposition calculée : on restitue le cadrage d'origine.
    if (originalViewBox) root.setAttribute('viewBox', originalViewBox);
    if (originalWidth) root.setAttribute('width', originalWidth);
    if (originalHeight) root.setAttribute('height', originalHeight);
    if (originalStyle !== null) root.setAttribute('style', originalStyle);
    return;
  }

  const content = root.querySelector<SVGGElement>('g');
  if (!content || !originalViewBox) return;

  const [ox, oy, ow, oh] = originalViewBox.split(/[\s,]+/).map(Number);
  if (![ox, oy, ow, oh].every(Number.isFinite)) return;

  // `getBBox` d'un groupe tient compte des transformations de ses enfants :
  // c'est donc l'étendue réelle après déplacements.
  const box = content.getBBox();
  const minX = Math.min(ox, box.x - VIEWBOX_MARGIN);
  const minY = Math.min(oy, box.y - VIEWBOX_MARGIN);
  const maxX = Math.max(ox + ow, box.x + box.width + VIEWBOX_MARGIN);
  const maxY = Math.max(oy + oh, box.y + box.height + VIEWBOX_MARGIN);

  const largeur = round(maxX - minX);
  const hauteur = round(maxY - minY);

  root.setAttribute('viewBox', `${round(minX)} ${round(minY)} ${largeur} ${hauteur}`);
  root.setAttribute('width', `${largeur}px`);
  root.setAttribute('height', `${hauteur}px`);
  root.style.width = `${largeur}px`;
  root.style.height = `${hauteur}px`;
}

function translateGroup(group: SVGGElement, offset: Point): void {
  group.setAttribute('transform', `translate(${round(offset.x)},${round(offset.y)})`);
}

function reflowLink(
  link: SVGGElement,
  entities: Map<string, EntityHandle>,
  applied: ReadonlyMap<string, Point>
): void {
  const from = entities.get(link.getAttribute('data-entity-1') ?? '');
  const to = entities.get(link.getAttribute('data-entity-2') ?? '');

  const paths = Array.from(link.querySelectorAll<SVGPathElement>('path'));
  const principal = paths[0] ?? null;
  const originalPath = principal ? readOriginal(principal, ORIGINAL_PATH, 'd') : null;
  const originalEndpoints = originalPath ? pathEndpoints(originalPath) : null;

  const ORIGINE: Point = { x: 0, y: 0 };
  const decalageDepart = (from && applied.get(from.id)) ?? ORIGINE;
  const decalageArrivee = (to && applied.get(to.id)) ?? ORIGINE;

  // Rien n'a bougé aux extrémités : la mise en page calculée par PlantUML est
  // meilleure que tout ce qu'on pourrait recalculer, on la restitue.
  if (
    !from ||
    !to ||
    !originalEndpoints ||
    (!isMoved(decalageDepart) && !isMoved(decalageArrivee))
  ) {
    restoreOriginalGeometry(link);
    return;
  }

  // Les deux extrémités subissent le même déplacement — lien réflexif, ou lien
  // interne à un paquetage qu'on vient de déplacer : le tracé calculé par
  // PlantUML reste valable, il suffit de l'emmener avec elles.
  if (samePoint(decalageDepart, decalageArrivee)) {
    translateLinkGeometry(link, decalageDepart);
    return;
  }

  const boiteDepart = translateBox(from.box, decalageDepart);
  const boiteArrivee = translateBox(to.box, decalageArrivee);
  const centreDepart = boxCenter(boiteDepart);
  const centreArrivee = boxCenter(boiteArrivee);

  // Le tracé rejoint les deux bordures en ligne droite : c'est le chemin le
  // plus court, et surtout celui qui reste correct quel que soit le côté vers
  // lequel l'élément a été déplacé.
  const depart = clipToShape(boiteDepart, from.ellipse, centreArrivee);
  const arrivee = clipToShape(boiteArrivee, to.ellipse, centreDepart);

  // L'extrémité du tracé d'origine la plus proche du départ donne le sens :
  // c'est elle qui porte, ou non, la pointe de flèche.
  const traceVaDeDepart =
    distance(originalEndpoints.start, from.center) <=
    distance(originalEndpoints.start, to.center);
  const nouveauDebut = traceVaDeDepart ? depart : arrivee;
  const nouvelleFin = traceVaDeDepart ? arrivee : depart;

  if (principal) {
    principal.setAttribute(
      'd',
      `M${round(nouveauDebut.x)},${round(nouveauDebut.y)} L${round(nouvelleFin.x)},${round(nouvelleFin.y)}`
    );
  }

  // Les tracés secondaires (double trait, décorations) suivent rigidement.
  const rotation =
    angleOf(nouveauDebut, nouvelleFin) -
    angleOf(originalEndpoints.start, originalEndpoints.end);

  paths.slice(1).forEach((element) => {
    const source = readOriginal(element, ORIGINAL_PATH, 'd');
    if (!source) return;
    const extremites = pathEndpoints(source);
    if (!extremites) return;
    const cible = distance(extremites.start, originalEndpoints.start) <=
      distance(extremites.start, originalEndpoints.end)
      ? nouveauDebut
      : nouvelleFin;
    element.setAttribute(
      'd',
      transformPathData(source, rigidTransform(extremites.start, cible, rotation))
    );
  });

  // Pointes de flèche et losanges : déplacés et réorientés, jamais redimensionnés.
  link
    .querySelectorAll<SVGPolygonElement | SVGPolylineElement>('polygon, polyline')
    .forEach((element) => {
      const source = readOriginal(element, ORIGINAL_POINTS, 'points');
      if (!source) return;

      const versFin =
        (nearestPoint(source, originalEndpoints.end) &&
          distance(nearestPoint(source, originalEndpoints.end) as Point, originalEndpoints.end) <=
            distance(
              nearestPoint(source, originalEndpoints.start) as Point,
              originalEndpoints.start
            )) ??
        true;

      const ancre = versFin ? originalEndpoints.end : originalEndpoints.start;
      const cible = versFin ? nouvelleFin : nouveauDebut;
      const pivot = nearestPoint(source, ancre) ?? ancre;
      const pivotCible = {
        x: cible.x + (pivot.x - ancre.x),
        y: cible.y + (pivot.y - ancre.y),
      };

      element.setAttribute(
        'points',
        transformPoints(source, rigidTransform(pivot, pivotCible, rotation))
      );
    });

  // L'étiquette se replace au milieu du nouveau trait, sans rotation.
  const milieuOrigine = {
    x: (originalEndpoints.start.x + originalEndpoints.end.x) / 2,
    y: (originalEndpoints.start.y + originalEndpoints.end.y) / 2,
  };
  const milieuCible = {
    x: (nouveauDebut.x + nouvelleFin.x) / 2,
    y: (nouveauDebut.y + nouvelleFin.y) / 2,
  };
  translateTexts(link, {
    x: milieuCible.x - milieuOrigine.x,
    y: milieuCible.y - milieuOrigine.y,
  });
}

/** Restitue la géométrie calculée par PlantUML. */
function restoreOriginalGeometry(link: SVGGElement): void {
  link.querySelectorAll<SVGPathElement>('path').forEach((element) => {
    const source = readOriginal(element, ORIGINAL_PATH, 'd');
    if (source) element.setAttribute('d', source);
  });
  link
    .querySelectorAll<SVGPolygonElement | SVGPolylineElement>('polygon, polyline')
    .forEach((element) => {
      const source = readOriginal(element, ORIGINAL_POINTS, 'points');
      if (source) element.setAttribute('points', source);
    });
  translateTexts(link, { x: 0, y: 0 });
}

/** Déplace tout le lien en bloc, sans le déformer. */
function translateLinkGeometry(link: SVGGElement, offset: Point): void {
  const translation = rigidTransform({ x: 0, y: 0 }, offset, 0);

  link.querySelectorAll<SVGPathElement>('path').forEach((element) => {
    const source = readOriginal(element, ORIGINAL_PATH, 'd');
    if (source) element.setAttribute('d', transformPathData(source, translation));
  });
  link
    .querySelectorAll<SVGPolygonElement | SVGPolylineElement>('polygon, polyline')
    .forEach((element) => {
      const source = readOriginal(element, ORIGINAL_POINTS, 'points');
      if (source) element.setAttribute('points', transformPoints(source, translation));
    });
  translateTexts(link, offset);
}

function translateTexts(link: SVGGElement, deplacement: Point): void {
  link.querySelectorAll<SVGTextElement>('text').forEach((element) => {
    const x = readOriginal(element, ORIGINAL_X, 'x');
    const y = readOriginal(element, ORIGINAL_Y, 'y');
    if (x !== null) element.setAttribute('x', round(Number(x) + deplacement.x));
    if (y !== null) element.setAttribute('y', round(Number(y) + deplacement.y));
  });
}

/** Lit la géométrie d'origine, en la mémorisant au premier passage. */
function readOriginal(element: Element, storageAttribute: string, attribute: string): string | null {
  const memorised = element.getAttribute(storageAttribute);
  if (memorised !== null) return memorised;

  const current = element.getAttribute(attribute);
  if (current === null) return null;

  element.setAttribute(storageAttribute, current);
  return current;
}

/** Rectangle englobant d'un élément, dans le repère du diagramme. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boxCenter(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function translateBox(box: Box, offset: Point | undefined): Box {
  if (!offset) return box;
  return { ...box, x: box.x + offset.x, y: box.y + offset.y };
}

/**
 * Point où le segment partant du centre de la forme vers `vers` en franchit la
 * bordure. C'est là que doit s'arrêter une flèche : ni au centre, ni au coin du
 * rectangle englobant.
 */
export function clipToShape(box: Box, ellipse: boolean, vers: Point): Point {
  const centre = boxCenter(box);
  const dx = vers.x - centre.x;
  const dy = vers.y - centre.y;

  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return centre;

  const rx = box.width / 2;
  const ry = box.height / 2;

  // Ellipse : le rapport qui ramène le point sur le contour.
  // Rectangle : le plus contraignant des deux axes.
  const facteur = ellipse
    ? 1 / Math.hypot(dx / (rx || 1), dy / (ry || 1))
    : Math.min(rx / Math.abs(dx || 1e-9), ry / Math.abs(dy || 1e-9));

  return { x: centre.x + dx * facteur, y: centre.y + dy * facteur };
}

export function angleOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Déplacement rigide : rotation d'un angle donné autour de `pivotSource`, puis
 * translation de ce pivot vers `pivotCible`. Contrairement à une similitude,
 * il ne change pas les dimensions — une pointe de flèche garde sa taille.
 */
export function rigidTransform(pivotSource: Point, pivotCible: Point, rotation: number): Similarity {
  const a = Math.cos(rotation);
  const b = Math.sin(rotation);
  return {
    a,
    b,
    tx: pivotCible.x - (a * pivotSource.x - b * pivotSource.y),
    ty: pivotCible.y - (b * pivotSource.x + a * pivotSource.y),
  };
}

/** Point d'une liste `points` le plus proche d'une référence. */
export function nearestPoint(points: string, reference: Point): Point | null {
  const numbers = points.match(NUMBER);
  if (!numbers || numbers.length < 2) return null;

  let best: Point | null = null;
  let bestDistance = Infinity;

  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const candidate = { x: Number(numbers[index]), y: Number(numbers[index + 1]) };
    const écart = distance(candidate, reference);
    if (écart < bestDistance) {
      bestDistance = écart;
      best = candidate;
    }
  }

  return best;
}
