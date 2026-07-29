import { describe, expect, it } from 'vitest';

import {
  angleOf,
  applySimilarity,
  boxCenter,
  buildHierarchy,
  clipToShape,
  containsBox,
  distance,
  nearestPoint,
  resolveOffset,
  rigidTransform,
  translateBox,
  isIdentity,
  pathEndpoints,
  similarityBetween,
  transformPathData,
  transformPoints,
} from '../../src/renderer/utils/diagramLayout';

describe('Géométrie du déplacement', () => {
  it('envoie exactement les extrémités sur leurs nouvelles positions', () => {
    const p0 = { x: 10, y: 20 };
    const p1 = { x: 110, y: 20 };
    const q0 = { x: 30, y: 60 };
    const q1 = { x: 30, y: 260 };

    const transform = similarityBetween(p0, p1, q0, q1);

    // C'est la propriété qui garantit qu'un lien reste accroché aux deux
    // éléments qu'il relie, quels que soient leurs déplacements.
    expect(applySimilarity(transform, p0).x).toBeCloseTo(q0.x, 6);
    expect(applySimilarity(transform, p0).y).toBeCloseTo(q0.y, 6);
    expect(applySimilarity(transform, p1).x).toBeCloseTo(q1.x, 6);
    expect(applySimilarity(transform, p1).y).toBeCloseTo(q1.y, 6);
  });

  it('conserve la forme du tracé : un point médian reste médian', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: 0 };
    const transform = similarityBetween(p0, p1, { x: 0, y: 0 }, { x: 0, y: 200 });

    const milieu = applySimilarity(transform, { x: 50, y: 0 });

    expect(milieu.x).toBeCloseTo(0, 6);
    expect(milieu.y).toBeCloseTo(100, 6);
  });

  it('se réduit à une translation quand rien ne tourne ni ne s’étire', () => {
    const transform = similarityBetween(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 7 },
      { x: 15, y: 7 }
    );

    expect(transform.a).toBeCloseTo(1, 6);
    expect(transform.b).toBeCloseTo(0, 6);
    expect(transform.tx).toBeCloseTo(5, 6);
    expect(transform.ty).toBeCloseTo(7, 6);
  });

  it('reste défini pour un lien réflexif, dont les extrémités coïncident', () => {
    const point = { x: 42, y: 42 };
    const transform = similarityBetween(point, point, { x: 52, y: 62 }, { x: 52, y: 62 });

    // Aucune rotation ni échelle possible : une translation pure fait l'affaire.
    expect(applySimilarity(transform, point)).toEqual({ x: 52, y: 62 });
  });

  it('reconnaît la transformation neutre', () => {
    const identique = similarityBetween(
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 1, y: 2 },
      { x: 3, y: 4 }
    );
    expect(isIdentity(identique)).toBe(true);
  });
});

describe('Réécriture des tracés SVG', () => {
  it('transforme les couples de coordonnées d’un chemin', () => {
    // Tracé réellement émis par PlantUML : commandes absolues, virgules.
    const data = 'M242.13,167 C282.27,167 355.29,167 399.35,167';
    const decalage = similarityBetween(
      { x: 242.13, y: 167 },
      { x: 399.35, y: 167 },
      { x: 242.13, y: 267 },
      { x: 399.35, y: 267 }
    );

    const resultat = transformPathData(data, decalage);
    const extremites = pathEndpoints(resultat);

    expect(extremites?.start.y).toBeCloseTo(267, 1);
    expect(extremites?.end.y).toBeCloseTo(267, 1);
    // Les lettres de commande sont préservées.
    expect(resultat).toMatch(/^M/);
    expect(resultat).toContain('C');
  });

  it('laisse intactes les commandes d’arc, qui mêlent rayons et angles', () => {
    const data = 'M0,0 A5,5 0 0 1 10,10';
    const resultat = transformPathData(data, { a: 1, b: 0, tx: 100, ty: 0 });

    // Le M est bien décalé, l'arc n'est pas corrompu.
    expect(resultat).toContain('M100,0');
    expect(resultat).toContain('A5,5 0 0 1 10,10');
  });

  it('transforme les points d’une pointe de flèche', () => {
    const points = '399.35,163 405.35,167 399.35,171 403.35,167';
    const resultat = transformPoints(points, { a: 1, b: 0, tx: 0, ty: 100 });

    expect(resultat.startsWith('399.35,263')).toBe(true);
    expect(resultat.split(' ')).toHaveLength(4);
  });

  it('lit les extrémités d’un tracé', () => {
    const extremites = pathEndpoints('M10,20 C30,40 50,60 70,80');

    expect(extremites?.start).toEqual({ x: 10, y: 20 });
    expect(extremites?.end).toEqual({ x: 70, y: 80 });
  });

  it('mesure les distances, pour rattacher chaque extrémité au bon élément', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('Réacheminement des flèches', () => {
  const boite = { x: 100, y: 100, width: 80, height: 40 };

  it('arrête le trait sur la bordure du rectangle, pas au centre ni au coin', () => {
    // Cible à droite : le trait doit s'arrêter au milieu du côté droit.
    const droite = clipToShape(boite, false, { x: 500, y: 120 });
    expect(droite.x).toBeCloseTo(180, 6);
    expect(droite.y).toBeCloseTo(120, 6);

    // Cible en dessous : au milieu du côté bas.
    const bas = clipToShape(boite, false, { x: 140, y: 500 });
    expect(bas.x).toBeCloseTo(140, 6);
    expect(bas.y).toBeCloseTo(140, 6);
  });

  it('suit le contour de l’ovale pour un cas d’utilisation', () => {
    const surOvale = clipToShape(boite, true, { x: 140 + 40, y: 120 + 20 });

    // À 45°, le point est sur l'ellipse : (dx/rx)² + (dy/ry)² = 1
    const dx = (surOvale.x - 140) / 40;
    const dy = (surOvale.y - 120) / 20;
    expect(dx * dx + dy * dy).toBeCloseTo(1, 6);
    // Et il est bien à l'intérieur du rectangle englobant.
    expect(surOvale.x).toBeLessThan(180);
  });

  it('rattache la flèche du bon côté quand l’élément passe à l’opposé', () => {
    const cible = { x: 100, y: 120 };
    const versLaGauche = clipToShape({ x: 300, y: 100, width: 80, height: 40 }, false, cible);

    // L'élément est maintenant à droite de sa cible : le trait doit sortir par
    // la gauche, ce qu'un simple étirement du tracé d'origine ne ferait pas.
    expect(versLaGauche.x).toBeCloseTo(300, 6);
  });

  it('déplace et oriente une pointe de flèche sans la redimensionner', () => {
    // Pointe horizontale de 10 unités de long, dirigée vers la droite.
    const pointe = '100,100 110,100 105,104';
    const avant = tailleDe(pointe);

    const transform = rigidTransform({ x: 100, y: 100 }, { x: 300, y: 300 }, Math.PI / 2);
    const apres = tailleDe(transformPoints(pointe, transform));

    // Une similitude aurait changé l'échelle ; un déplacement rigide, non.
    expect(apres.largeur).toBeCloseTo(avant.hauteur, 3);
    expect(apres.hauteur).toBeCloseTo(avant.largeur, 3);
  });

  it('translate une boîte sans en changer les dimensions', () => {
    const deplacee = translateBox(boite, { x: 15, y: -25 });

    expect(deplacee).toEqual({ x: 115, y: 75, width: 80, height: 40 });
    expect(boxCenter(deplacee)).toEqual({ x: 155, y: 95 });
  });

  it('mesure l’angle d’un segment', () => {
    expect(angleOf({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 6);
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it('trouve le point d’ancrage d’une pointe de flèche', () => {
    const proche = nearestPoint('10,10 200,200 12,11', { x: 11, y: 11 });
    expect(proche).toEqual({ x: 12, y: 11 });
  });
});

describe('Héritage des déplacements', () => {
  // Disposition typique : un paquetage, une classe dedans, un paquetage
  // imbriqué avec sa propre classe, et une classe restée à l'extérieur.
  const elements = [
    { id: 'PKG', box: { x: 0, y: 0, width: 400, height: 300 }, container: true },
    { id: 'Compte', box: { x: 20, y: 40, width: 100, height: 50 }, container: false },
    { id: 'INTERNE', box: { x: 150, y: 40, width: 200, height: 200 }, container: true },
    { id: 'Depot', box: { x: 170, y: 80, width: 100, height: 50 }, container: false },
    { id: 'Client', box: { x: 500, y: 40, width: 100, height: 50 }, container: false },
  ];

  it('reconnaît qu’un élément tient dans un regroupement', () => {
    expect(containsBox(elements[0].box, elements[1].box)).toBe(true);
    expect(containsBox(elements[0].box, elements[4].box)).toBe(false);
    // Un rectangle ne se contient pas lui-même : sans quoi deux éléments
    // superposés se désigneraient mutuellement comme parents.
    expect(containsBox(elements[0].box, elements[0].box)).toBe(false);
  });

  it('rattache chaque élément au plus petit regroupement qui l’englobe', () => {
    const parents = buildHierarchy(elements);

    expect(parents.get('Compte')).toBe('PKG');
    // « Depot » tient dans les deux paquetages : c'est le plus proche qui compte.
    expect(parents.get('Depot')).toBe('INTERNE');
    expect(parents.get('INTERNE')).toBe('PKG');
    expect(parents.has('Client')).toBe(false);
    expect(parents.has('PKG')).toBe(false);
  });

  it('fait suivre le contenu quand le contenant se déplace', () => {
    const parents = buildHierarchy(elements);
    const offsets = { PKG: { x: 30, y: -10 } };

    // La classe n'a aucun décalage propre, et se déplace pourtant.
    expect(resolveOffset('Compte', offsets, parents)).toEqual({ x: 30, y: -10 });
    // L'héritage traverse les paquetages imbriqués.
    expect(resolveOffset('Depot', offsets, parents)).toEqual({ x: 30, y: -10 });
    // Ce qui est en dehors ne bouge pas.
    expect(resolveOffset('Client', offsets, parents)).toEqual({ x: 0, y: 0 });
  });

  it('ajoute le déplacement propre d’un élément à celui de son contenant', () => {
    const parents = buildHierarchy(elements);
    const offsets = {
      PKG: { x: 100, y: 0 },
      INTERNE: { x: 10, y: 5 },
      Depot: { x: 1, y: 2 },
    };

    expect(resolveOffset('Depot', offsets, parents)).toEqual({ x: 111, y: 7 });
    expect(resolveOffset('INTERNE', offsets, parents)).toEqual({ x: 110, y: 5 });
  });

  it('ne boucle pas sur une hiérarchie incohérente', () => {
    const cyclique = new Map([
      ['A', 'B'],
      ['B', 'A'],
    ]);

    // Chaque décalage n'est compté qu'une fois, et l'appel se termine.
    expect(resolveOffset('A', { A: { x: 1, y: 0 }, B: { x: 2, y: 0 } }, cyclique)).toEqual({
      x: 3,
      y: 0,
    });
  });
});

function tailleDe(points: string): { largeur: number; hauteur: number } {
  const nombres = (points.match(/-?[\d.]+/g) ?? []).map(Number);
  const xs = nombres.filter((_, index) => index % 2 === 0);
  const ys = nombres.filter((_, index) => index % 2 === 1);
  return {
    largeur: Math.max(...xs) - Math.min(...xs),
    hauteur: Math.max(...ys) - Math.min(...ys),
  };
}
