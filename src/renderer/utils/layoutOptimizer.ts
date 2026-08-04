/**
 * Optimisation de la disposition d'un diagramme rendu.
 *
 * PlantUML délègue le placement à Graphviz, qui raisonne sur le graphe : il
 * minimise les croisements *avant* de connaître les dimensions définitives des
 * boîtes, et ne voit jamais la géométrie finale. Il reste donc, après coup, des
 * défauts visibles — flèches qui se croisent, qui se frôlent, qui traversent un
 * élément.
 *
 * Ce module part de cette mise en page et la polit : il évalue la géométrie
 * réelle, telle qu'elle est dessinée, et cherche par déplacements successifs
 * une disposition qui marque mieux. Chaque déplacement passe par le même
 * mécanisme de décalages que l'édition à la souris — il est donc annulable, et
 * l'export le conserve.
 *
 * La recherche est déterministe : deux appels sur le même diagramme donnent le
 * même résultat.
 */

import {
  addOffset,
  boxCenter,
  clipToShape,
  distance,
  segmentCrossesBox,
  translateBox,
  type Box,
  type LayoutOffsets,
  type Point,
} from './diagramLayout';

/** Un élément déplaçable, réduit à ce dont l'optimisation a besoin. */
export interface OptimizerNode {
  id: string;
  box: Box;
  /** Un cas d'utilisation : les flèches s'arrêtent sur l'ovale. */
  ellipse: boolean;
  /** Un regroupement : il porte d'autres éléments et ne se déplace pas seul. */
  container: boolean;
}

export interface OptimizerLink {
  from: string;
  to: string;
  /**
   * Tracé calculé par PlantUML, échantillonné.
   *
   * Il est conservé tant qu'aucune des deux extrémités ne bouge — c'est ce que
   * le rendu affiche alors réellement. Dès qu'une extrémité se déplace, le lien
   * est retracé d'une bordure à l'autre, et c'est ce segment qui compte.
   */
  path?: readonly Point[];
}

export interface LayoutModel {
  nodes: readonly OptimizerNode[];
  links: readonly OptimizerLink[];
}

/** Détail du score, pour pouvoir rendre compte de ce qui a été gagné. */
export interface LayoutScore {
  /** Couples de liens qui se coupent. */
  crossings: number;
  /** Couples de liens qui se frôlent sans se couper. */
  nearMisses: number;
  /** Liens qui traversent un élément qu'ils ne relient pas. */
  throughElements: number;
  /** Couples d'éléments qui se chevauchent ou se serrent de trop près. */
  overlaps: number;
  /** Longueur cumulée des liens, en unités SVG. */
  length: number;
  /** Somme des déplacements imposés aux éléments. */
  displacement: number;
  /** Combinaison pondérée : c'est elle que la recherche minimise. */
  total: number;
}

/** En deçà de cet écart, deux tracés se touchent à l'œil. */
export const TOUCH_DISTANCE = 8;
/** Marge exigée entre deux éléments. */
export const NODE_CLEARANCE = 16;

/**
 * Poids du score.
 *
 * L'esprit : **réparer au moindre coût**, jamais reconstruire. La mise en page
 * de Graphviz encode une hiérarchie — rangs, sens de lecture — que ce score ne
 * sait pas voir ; s'en écarter est donc en soi une perte, facturée par le terme
 * de déplacement. Un défaut franc vaut plus qu'un déplacement raisonnable, mais
 * pas plus qu'un déménagement complet.
 *
 * Le terme de longueur ne pénalise que l'**allongement** par rapport à la mise
 * en page de départ. Facturer la longueur absolue reviendrait à récompenser le
 * tassement : la recherche empilerait les éléments pour raccourcir les traits.
 */
const WEIGHTS = {
  crossing: 100,
  nearMiss: 40,
  throughElement: 160,
  overlap: 400,
  /** Par unité SVG d'allongement, au-delà de la longueur de départ. */
  lengthIncrease: 0.15,
  /** Par unité de déplacement : un écart de 96 unités coûte ~58. */
  displacement: 0.6,
};

/** Un lien tel qu'il sera dessiné : une suite de segments. */
interface RoutedLink {
  from: string;
  to: string;
  segments: Array<{ a: Point; b: Point }>;
}

/** Position courante de chaque élément, décalages hérités compris. */
function placedBoxes(model: LayoutModel, offsets: LayoutOffsets): Map<string, Box> {
  const boxes = new Map<string, Box>();
  model.nodes.forEach((node) => boxes.set(node.id, translateBox(node.box, offsets[node.id])));
  return boxes;
}

function bouge(offsets: LayoutOffsets, id: string): boolean {
  const offset = offsets[id];
  return offset !== undefined && (Math.abs(offset.x) > 1e-9 || Math.abs(offset.y) > 1e-9);
}

/**
 * Tracé de chaque lien, tel que le rendu le dessinera.
 *
 * C'est le point clef de la fidélité du score : un lien dont les extrémités
 * n'ont pas bougé garde la courbe de PlantUML, les autres sont retracés en
 * ligne droite. Modéliser tout le monde en segments droits ferait compter des
 * croisements qui n'existent pas — et manquer ceux qui existent.
 */
function routedLinks(
  model: LayoutModel,
  boxes: Map<string, Box>,
  offsets: LayoutOffsets
): RoutedLink[] {
  const parId = new Map(model.nodes.map((node) => [node.id, node]));
  const routes: RoutedLink[] = [];

  model.links.forEach((link) => {
    const depart = parId.get(link.from);
    const arrivee = parId.get(link.to);
    const boiteDepart = boxes.get(link.from);
    const boiteArrivee = boxes.get(link.to);
    if (!depart || !arrivee || !boiteDepart || !boiteArrivee || link.from === link.to) return;

    const intact = !bouge(offsets, link.from) && !bouge(offsets, link.to);
    if (intact && link.path && link.path.length >= 2) {
      routes.push({
        from: link.from,
        to: link.to,
        segments: link.path.slice(1).map((point, index) => ({
          a: (link.path as readonly Point[])[index],
          b: point,
        })),
      });
      return;
    }

    const centreDepart = boxCenter(boiteDepart);
    const centreArrivee = boxCenter(boiteArrivee);
    routes.push({
      from: link.from,
      to: link.to,
      segments: [
        {
          a: clipToShape(boiteDepart, depart.ellipse, centreArrivee),
          b: clipToShape(boiteArrivee, arrivee.ellipse, centreDepart),
        },
      ],
    });
  });

  return routes;
}

function orientation(a: Point, b: Point, c: Point): number {
  const valeur = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(valeur) < 1e-9 ? 0 : Math.sign(valeur);
}

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  return (
    orientation(a1, a2, b1) !== orientation(a1, a2, b2) &&
    orientation(b1, b2, a1) !== orientation(b1, b2, a2)
  );
}

function pointToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const norme = dx * dx + dy * dy;
  if (norme < 1e-9) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / norme));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Distance entre deux segments : nulle s'ils se coupent. */
export function segmentDistance(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegment(a1, b1, b2),
    pointToSegment(a2, b1, b2),
    pointToSegment(b1, a1, a2),
    pointToSegment(b2, a1, a2)
  );
}

/** Chevauchement de deux boîtes, marge comprise : 0 si elles sont à l'écart. */
export function boxOverlap(a: Box, b: Box, clearance = NODE_CLEARANCE): number {
  const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + clearance;
  const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + clearance;
  if (horizontal <= 0 || vertical <= 0) return 0;
  return Math.min(horizontal, vertical);
}

/**
 * Évalue une disposition. Plus le total est bas, plus le diagramme est lisible.
 *
 * `baselineLength` est la longueur cumulée des liens dans la mise en page de
 * départ : seul le dépassement est facturé. Laissée à zéro, la longueur entière
 * compte — ce qui n'a de sens que pour comparer deux dispositions sans origine
 * commune.
 */
export function scoreLayout(
  model: LayoutModel,
  offsets: LayoutOffsets,
  baselineLength = 0
): LayoutScore {
  const boxes = placedBoxes(model, offsets);
  const routes = routedLinks(model, boxes, offsets);

  let crossings = 0;
  let nearMisses = 0;
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      // Deux liens qui partagent une extrémité se rejoignent forcément : ce
      // n'est ni un croisement ni un frôlement.
      if (partagentUneExtremite(routes[i], routes[j])) continue;

      let ecart = Infinity;
      routes[i].segments.forEach((a) => {
        routes[j].segments.forEach((b) => {
          ecart = Math.min(ecart, segmentDistance(a.a, a.b, b.a, b.b));
        });
      });

      if (ecart === 0) crossings += 1;
      else if (ecart < TOUCH_DISTANCE) nearMisses += 1;
    }
  }

  let throughElements = 0;
  routes.forEach((route) => {
    const traverse = model.nodes.some((node) => {
      if (node.id === route.from || node.id === route.to || node.container) return false;
      const boite = boxes.get(node.id);
      if (!boite) return false;
      return route.segments.some((segment) => segmentCrossesBox(segment.a, segment.b, boite));
    });
    if (traverse) throughElements += 1;
  });

  let overlaps = 0;
  const deplacables = model.nodes.filter((node) => !node.container);
  for (let i = 0; i < deplacables.length; i += 1) {
    for (let j = i + 1; j < deplacables.length; j += 1) {
      const a = boxes.get(deplacables[i].id);
      const b = boxes.get(deplacables[j].id);
      if (a && b && boxOverlap(a, b) > 0) overlaps += 1;
    }
  }

  const length = routes.reduce(
    (somme, route) =>
      somme + route.segments.reduce((sous, segment) => sous + distance(segment.a, segment.b), 0),
    0
  );
  const displacement = Object.values(offsets).reduce(
    (somme, point) => somme + Math.hypot(point.x, point.y),
    0
  );

  return {
    crossings,
    nearMisses,
    throughElements,
    overlaps,
    length,
    displacement,
    total:
      crossings * WEIGHTS.crossing +
      nearMisses * WEIGHTS.nearMiss +
      throughElements * WEIGHTS.throughElement +
      overlaps * WEIGHTS.overlap +
      Math.max(0, length - baselineLength) * WEIGHTS.lengthIncrease +
      displacement * WEIGHTS.displacement,
  };
}

function partagentUneExtremite(a: RoutedLink, b: RoutedLink): boolean {
  return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
}

/** Nombre de défauts visibles : ce dont on rend compte à l'utilisateur. */
export function countDefects(score: LayoutScore): number {
  return score.crossings + score.nearMisses + score.throughElements + score.overlaps;
}

export interface OptimizeOptions {
  /**
   * Éléments que la recherche ne doit pas déplacer.
   *
   * Sert au formalisme des cas d'utilisation : les acteurs sont rangés en
   * colonnes avant la recherche, et celle-ci ne doit pas défaire ce rangement
   * pour gagner quelques unités de tracé.
   */
  locked?: ReadonlySet<string>;
  /** Amplitudes essayées, en unités SVG. */
  steps?: readonly number[];
  /** Nombre maximal de passes ; chacune applique le meilleur déplacement. */
  maxPasses?: number;
  /** Au-delà, le diagramme est trop gros pour une recherche exhaustive. */
  maxNodes?: number;
}

/** Huit directions : les quatre axes et les quatre diagonales. */
const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

const DEFAULT_STEPS = [96, 48, 24] as const;

export interface OptimizeResult {
  offsets: LayoutOffsets;
  before: LayoutScore;
  after: LayoutScore;
  /** Nombre de déplacements retenus. */
  moves: number;
  /** `true` si le diagramme dépassait la taille traitable. */
  skipped: boolean;
  /** Nombre d'acteurs rangés en colonnes par le formalisme, le cas échéant. */
  arranged?: number;
}

/**
 * Cherche une meilleure disposition par améliorations successives.
 *
 * À chaque passe, tous les déplacements candidats sont évalués et **le
 * meilleur** est appliqué ; on s'arrête dès qu'aucun n'améliore le score. Les
 * amplitudes sont essayées de la plus grande à la plus petite, ce qui permet de
 * sortir d'un mauvais placement avant d'affiner.
 *
 * Les regroupements ne sont pas déplacés : ils emmèneraient leur contenu, et
 * l'optimisation reviendrait à faire glisser des pans entiers du diagramme.
 */
export function optimizeLayout(
  model: LayoutModel,
  depart: LayoutOffsets = {},
  options: OptimizeOptions = {}
): OptimizeResult {
  const steps = options.steps ?? DEFAULT_STEPS;
  const maxPasses = options.maxPasses ?? 40;
  const maxNodes = options.maxNodes ?? 60;

  // La longueur des tracés au départ sert de référence : la recherche ne paie
  // que ce qu'elle allonge, et n'a donc rien à gagner à tasser le diagramme.
  const reference = scoreLayout(model, depart).length;
  const before = scoreLayout(model, depart, reference);
  const verrouilles = options.locked ?? new Set<string>();
  const deplacables = model.nodes.filter(
    (node) => !node.container && !verrouilles.has(node.id)
  );

  if (deplacables.length === 0 || deplacables.length > maxNodes) {
    return {
      offsets: depart,
      before,
      after: before,
      moves: 0,
      skipped: deplacables.length > maxNodes,
    };
  }

  let courant: LayoutOffsets = { ...depart };
  let meilleurScore = before;
  let moves = 0;

  for (let passe = 0; passe < maxPasses; passe += 1) {
    let meilleurCandidat: LayoutOffsets | null = null;
    let meilleurTotal = meilleurScore.total;
    let meilleurDetail = meilleurScore;

    for (const node of deplacables) {
      for (const step of steps) {
        for (const direction of DIRECTIONS) {
          const candidat: LayoutOffsets = {
            ...courant,
            [node.id]: addOffset(courant[node.id] ?? { x: 0, y: 0 }, {
              x: direction.x * step,
              y: direction.y * step,
            }),
          };
          const score = scoreLayout(model, candidat, reference);
          // Le seuil évite d'enchaîner des gains numériques insignifiants.
          if (score.total < meilleurTotal - 1e-6) {
            meilleurTotal = score.total;
            meilleurCandidat = candidat;
            meilleurDetail = score;
          }
        }
      }
    }

    if (!meilleurCandidat) break;
    courant = meilleurCandidat;
    meilleurScore = meilleurDetail;
    moves += 1;
  }

  // Un décalage nul n'a pas à encombrer la liste des déplacements.
  const offsets: LayoutOffsets = {};
  Object.entries(courant).forEach(([id, point]) => {
    if (Math.abs(point.x) > 1e-6 || Math.abs(point.y) > 1e-6) offsets[id] = point;
  });

  return { offsets, before, after: meilleurScore, moves, skipped: false };
}
