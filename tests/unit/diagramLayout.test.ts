import { describe, expect, it } from 'vitest';

import {
  applySimilarity,
  distance,
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
