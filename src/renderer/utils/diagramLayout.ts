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

/** Attributs où sont mémorisées les géométries d'origine, avant déplacement. */
const ORIGINAL_PATH = 'data-puml-d';
const ORIGINAL_POINTS = 'data-puml-points';
const ORIGINAL_X = 'data-puml-x';
const ORIGINAL_Y = 'data-puml-y';

export interface EntityHandle {
  id: string;
  group: SVGGElement;
  /** Centre de la géométrie d'origine, invariant sous nos transformations. */
  center: Point;
}

/** Recense les éléments déplaçables d'un diagramme rendu. */
export function indexEntities(root: SVGSVGElement): Map<string, EntityHandle> {
  const entities = new Map<string, EntityHandle>();

  root.querySelectorAll<SVGGElement>('g.entity[data-entity]').forEach((group) => {
    const id = group.getAttribute('data-entity');
    if (!id) return;

    // `getBBox` ignore la transformation propre du groupe : le centre reste
    // donc celui de la mise en page calculée par PlantUML, même après un
    // déplacement.
    const box = group.getBBox();
    entities.set(id, {
      id,
      group,
      center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
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
  const entities = indexEntities(root);

  entities.forEach((entity) => {
    const offset = offsets[entity.id];
    if (offset) translateGroup(entity.group, offset);
    else entity.group.removeAttribute('transform');
  });

  root.querySelectorAll<SVGGElement>('g.link[data-entity-1]').forEach((link) => {
    reflowLink(link, entities, offsets);
  });

  fitViewBox(root, Object.keys(offsets).length > 0);
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
  offsets: LayoutOffsets
): void {
  const from = entities.get(link.getAttribute('data-entity-1') ?? '');
  const to = entities.get(link.getAttribute('data-entity-2') ?? '');

  const path = link.querySelector<SVGPathElement>('path');
  const original = path ? readOriginal(path, ORIGINAL_PATH, 'd') : null;
  const endpoints = original ? pathEndpoints(original) : null;

  let transform = identitySimilarity();

  if (from && to && endpoints) {
    // Le tracé peut partir de l'un ou l'autre élément : on rattache chaque
    // extrémité au plus proche.
    const departVersFrom =
      distance(endpoints.start, from.center) <= distance(endpoints.start, to.center);
    const debut = departVersFrom ? from : to;
    const fin = departVersFrom ? to : from;

    transform = similarityBetween(
      endpoints.start,
      endpoints.end,
      addOffset(endpoints.start, offsets[debut.id]),
      addOffset(endpoints.end, offsets[fin.id])
    );
  }

  link.querySelectorAll<SVGPathElement>('path').forEach((element) => {
    const source = readOriginal(element, ORIGINAL_PATH, 'd');
    if (source) element.setAttribute('d', transformPathData(source, transform));
  });

  link.querySelectorAll<SVGPolygonElement | SVGPolylineElement>('polygon, polyline').forEach(
    (element) => {
      const source = readOriginal(element, ORIGINAL_POINTS, 'points');
      if (source) element.setAttribute('points', transformPoints(source, transform));
    }
  );

  // Les étiquettes sont translatées sans être tournées : un texte incliné
  // serait illisible alors que la rotation n'apporte rien ici.
  const deplacement = etiquetteDeplacement(transform, endpoints);
  link.querySelectorAll<SVGTextElement>('text').forEach((element) => {
    const x = readOriginal(element, ORIGINAL_X, 'x');
    const y = readOriginal(element, ORIGINAL_Y, 'y');
    if (x !== null) element.setAttribute('x', round(Number(x) + deplacement.x));
    if (y !== null) element.setAttribute('y', round(Number(y) + deplacement.y));
  });
}

function etiquetteDeplacement(
  transform: Similarity,
  endpoints: { start: Point; end: Point } | null
): Point {
  if (!endpoints) return { x: 0, y: 0 };

  const debut = applySimilarity(transform, endpoints.start);
  const fin = applySimilarity(transform, endpoints.end);
  return {
    x: (debut.x - endpoints.start.x + (fin.x - endpoints.end.x)) / 2,
    y: (debut.y - endpoints.start.y + (fin.y - endpoints.end.y)) / 2,
  };
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
