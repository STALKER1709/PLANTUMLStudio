/**
 * Extrait un modèle de disposition d'un SVG PlantUML, sans DOM.
 *
 * Les tests unitaires tournent sous Node : il n'y a ni `getBBox` ni
 * `querySelector`. Les boîtes sont donc reconstituées à partir des formes que
 * chaque groupe contient, exactement comme le navigateur le ferait.
 */
import type {
  LayoutModel,
  OptimizerLink,
  OptimizerNode,
} from '../../../src/renderer/utils/layoutOptimizer';

const NOMBRE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/** Nombre d'arguments par commande de chemin. */
const ARITE: Record<string, number> = {
  M: 2,
  L: 2,
  T: 2,
  C: 6,
  S: 4,
  Q: 4,
  A: 7,
  H: 1,
  V: 1,
};

function nombres(texte: string): number[] {
  return (texte.match(NOMBRE) ?? []).map(Number);
}

/** Points d'un attribut `d`, sans confondre rayons d'arc et coordonnées. */
function pointsDuChemin(d: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let x = 0;
  let y = 0;

  for (const [, commande, arguments_] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const lettre = commande.toUpperCase();
    const taille = ARITE[lettre];
    if (!taille) continue;
    const valeurs = nombres(arguments_);

    for (let index = 0; index + taille <= valeurs.length; index += taille) {
      const lot = valeurs.slice(index, index + taille);
      if (lettre === 'H') x = lot[0];
      else if (lettre === 'V') y = lot[0];
      else if (lettre === 'A') {
        x = lot[5];
        y = lot[6];
      } else if (lettre === 'C' || lettre === 'S' || lettre === 'Q') {
        for (let k = 0; k < taille; k += 2) points.push([lot[k], lot[k + 1]]);
        x = lot[taille - 2];
        y = lot[taille - 1];
        continue;
      } else {
        x = lot[0];
        y = lot[1];
      }
      points.push([x, y]);
    }
  }

  return points;
}

function attribut(balise: string, nom: string): number {
  const trouve = balise.match(new RegExp(`\\b${nom}="([^"]*)"`));
  return trouve ? Number(trouve[1]) : 0;
}

/**
 * Rectangle englobant des formes contenues dans un fragment de balisage.
 *
 * Les libellés comptent : `getBBox`, dont ceci reproduit le résultat côté Node,
 * les inclut — et un nom d'acteur déborde largement du bonhomme qu'il désigne.
 */
function boiteDe(fragment: string): { x: number; y: number; width: number; height: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const [, balise] of fragment.matchAll(/<(text\b[^>]*)>/g)) {
    const x = attribut(balise, 'x');
    const y = attribut(balise, 'y');
    const corps = attribut(balise, 'font-size') || 14;
    xs.push(x, x + attribut(balise, 'textLength'));
    // `y` est la ligne de base : le texte monte au-dessus et déborde un peu
    // en dessous, dans les proportions usuelles d'une fonte latine.
    ys.push(y - corps * 0.8, y + corps * 0.25);
  }

  for (const [, balise] of fragment.matchAll(/<(rect\b[^>]*)>/g)) {
    const x = attribut(balise, 'x');
    const y = attribut(balise, 'y');
    xs.push(x, x + attribut(balise, 'width'));
    ys.push(y, y + attribut(balise, 'height'));
  }
  for (const [, balise] of fragment.matchAll(/<(ellipse\b[^>]*)>/g)) {
    const cx = attribut(balise, 'cx');
    const cy = attribut(balise, 'cy');
    const rx = attribut(balise, 'rx');
    const ry = attribut(balise, 'ry');
    xs.push(cx - rx, cx + rx);
    ys.push(cy - ry, cy + ry);
  }
  for (const [, points] of fragment.matchAll(/<polygon\b[^>]*\bpoints="([^"]*)"/g)) {
    const valeurs = nombres(points);
    valeurs.forEach((valeur, index) => (index % 2 === 0 ? xs : ys).push(valeur));
  }
  for (const [, d] of fragment.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)) {
    pointsDuChemin(d).forEach(([x, y]) => {
      xs.push(x);
      ys.push(y);
    });
  }

  if (xs.length === 0) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Découpe les groupes de premier niveau, avec leur classe et leur contenu. */
function groupes(svg: string): Array<{ ouverture: string; contenu: string }> {
  const trouves: Array<{ ouverture: string; contenu: string }> = [];

  for (const correspondance of svg.matchAll(/<g\s([^>]*)>/g)) {
    const ouverture = correspondance[1];
    const debut = (correspondance.index ?? 0) + correspondance[0].length;

    // Les groupes de PlantUML ne s'imbriquent pas : la première fermeture est
    // la bonne.
    const fin = svg.indexOf('</g>', debut);
    if (fin === -1) continue;
    trouves.push({ ouverture, contenu: svg.slice(debut, fin) });
  }

  return trouves;
}

function valeur(ouverture: string, nom: string): string | null {
  const trouve = ouverture.match(new RegExp(`\\b${nom}="([^"]*)"`));
  return trouve ? trouve[1] : null;
}

export function modelFromSvg(svg: string): LayoutModel {
  const nodes: OptimizerNode[] = [];
  const links: OptimizerLink[] = [];

  groupes(svg).forEach(({ ouverture, contenu }) => {
    const classe = valeur(ouverture, 'class') ?? '';
    const entite = valeur(ouverture, 'data-entity');

    if (entite && (classe.includes('entity') || classe.includes('cluster'))) {
      const box = boiteDe(contenu);
      if (box) {
        nodes.push({
          id: entite,
          box,
          ellipse: /<ellipse\b/.test(contenu),
          container: classe.includes('cluster'),
        });
      }
      return;
    }

    if (classe === 'link') {
      const from = valeur(ouverture, 'data-entity-1');
      const to = valeur(ouverture, 'data-entity-2');
      const trace = contenu.match(/<path\b[^>]*\bd="([^"]*)"/);
      if (from && to) {
        links.push({
          from,
          to,
          path: trace ? pointsDuChemin(trace[1]).map(([x, y]) => ({ x, y })) : [],
        });
      }
    }
  });

  return { nodes, links };
}
