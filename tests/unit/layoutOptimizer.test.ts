import { describe, expect, it } from 'vitest';

import {
  boxOverlap,
  countDefects,
  optimizeLayout,
  scoreLayout,
  segmentDistance,
  segmentsIntersect,
  type LayoutModel,
} from '../../src/renderer/utils/layoutOptimizer';

function noeud(id: string, x: number, y: number, container = false) {
  return { id, box: { x, y, width: 80, height: 40 }, ellipse: false, container };
}

describe('Mesure de la lisibilité', () => {
  it('reconnaît deux segments qui se coupent', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })
    ).toBe(true);
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })
    ).toBe(false);
  });

  it('mesure l’écart entre deux tracés parallèles', () => {
    const ecart = segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 3 }, { x: 10, y: 3 });
    expect(ecart).toBeCloseTo(3, 6);
    // Deux tracés qui se coupent sont à distance nulle.
    expect(
      segmentDistance({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })
    ).toBe(0);
  });

  it('mesure le chevauchement de deux boîtes, marge comprise', () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    // Franchement séparées.
    expect(boxOverlap(a, { x: 300, y: 0, width: 100, height: 50 })).toBe(0);
    // Superposées.
    expect(boxOverlap(a, { x: 50, y: 0, width: 100, height: 50 })).toBeGreaterThan(0);
    // Séparées, mais de moins que la marge exigée.
    expect(boxOverlap(a, { x: 105, y: 0, width: 100, height: 50 })).toBeGreaterThan(0);
  });

  it('compte un croisement entre deux liens qui ne partagent rien', () => {
    // A—D et B—C se croisent en X.
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 400, 0), noeud('C', 0, 300), noeud('D', 400, 300)],
      links: [
        { from: 'A', to: 'D' },
        { from: 'B', to: 'C' },
      ],
    };

    expect(scoreLayout(model, {}).crossings).toBe(1);
  });

  it('ne compte pas comme croisement deux liens partageant une extrémité', () => {
    const model: LayoutModel = {
      nodes: [noeud('A', 200, 0), noeud('B', 0, 300), noeud('C', 400, 300)],
      links: [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
      ],
    };

    expect(scoreLayout(model, {}).crossings).toBe(0);
  });

  it('compte un lien qui traverse un élément étranger', () => {
    // B est posé pile entre A et C.
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 0, 150), noeud('C', 0, 300)],
      links: [{ from: 'A', to: 'C' }],
    };

    expect(scoreLayout(model, {}).throughElements).toBe(1);
  });

  it('compte le chevauchement de deux éléments', () => {
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 20, 10)],
      links: [],
    };

    expect(scoreLayout(model, {}).overlaps).toBe(1);
  });

  it('ignore les regroupements, qui englobent légitimement les autres', () => {
    const model: LayoutModel = {
      nodes: [
        { id: 'PKG', box: { x: 0, y: 0, width: 300, height: 200 }, ellipse: false, container: true },
        noeud('A', 20, 20),
      ],
      links: [],
    };

    expect(scoreLayout(model, {}).overlaps).toBe(0);
  });
});

describe('Optimisation de la disposition', () => {
  it('écarte un élément posé sur un lien', () => {
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 0, 150), noeud('C', 0, 300)],
      links: [{ from: 'A', to: 'C' }],
    };

    const avant = scoreLayout(model, {});
    expect(avant.throughElements).toBe(1);

    const resultat = optimizeLayout(model);

    expect(resultat.after.throughElements).toBe(0);
    expect(resultat.moves).toBeGreaterThan(0);
    // Seul l'intrus a bougé : déplacer A ou C serait plus coûteux.
    expect(Object.keys(resultat.offsets)).toEqual(['B']);
  });

  it('sépare deux éléments qui se chevauchent', () => {
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 20, 10)],
      links: [],
    };

    const resultat = optimizeLayout(model);

    expect(resultat.before.overlaps).toBe(1);
    expect(resultat.after.overlaps).toBe(0);
  });

  it('ne dégrade jamais la disposition de départ', () => {
    // Configuration déjà propre : l'optimisation doit la laisser tranquille.
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 300, 0), noeud('C', 0, 300), noeud('D', 300, 300)],
      links: [
        { from: 'A', to: 'C' },
        { from: 'B', to: 'D' },
      ],
    };

    const resultat = optimizeLayout(model);

    expect(resultat.after.total).toBeLessThanOrEqual(resultat.before.total);
    expect(countDefects(resultat.after)).toBe(0);
  });

  it('est déterministe : deux appels donnent la même disposition', () => {
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 0, 150), noeud('C', 0, 300), noeud('D', 200, 150)],
      links: [
        { from: 'A', to: 'C' },
        { from: 'B', to: 'D' },
      ],
    };

    expect(optimizeLayout(model).offsets).toEqual(optimizeLayout(model).offsets);
  });

  it('repart des déplacements déjà faits à la main', () => {
    const model: LayoutModel = {
      nodes: [noeud('A', 0, 0), noeud('B', 0, 150), noeud('C', 0, 300)],
      links: [{ from: 'A', to: 'C' }],
    };

    // L'utilisateur a déjà écarté B, mais pas assez.
    const resultat = optimizeLayout(model, { B: { x: 30, y: 0 } });

    expect(resultat.after.throughElements).toBe(0);
    expect(resultat.before.throughElements).toBe(1);
  });

  it('renonce au-delà d’une certaine taille plutôt que de figer l’interface', () => {
    const model: LayoutModel = {
      nodes: Array.from({ length: 30 }, (_, index) => noeud(`N${index}`, index * 200, 0)),
      links: [],
    };

    const resultat = optimizeLayout(model, {}, { maxNodes: 10 });

    expect(resultat.skipped).toBe(true);
    expect(resultat.offsets).toEqual({});
  });

  it('ne déplace pas les regroupements, qui emmèneraient leur contenu', () => {
    const model: LayoutModel = {
      nodes: [
        { id: 'PKG', box: { x: 0, y: 0, width: 300, height: 200 }, ellipse: false, container: true },
        noeud('A', 20, 20),
        noeud('B', 20, 80),
      ],
      links: [],
    };

    const resultat = optimizeLayout(model);

    expect(Object.keys(resultat.offsets)).not.toContain('PKG');
  });

  it('additionne les défauts pour en rendre compte', () => {
    expect(
      countDefects({
        crossings: 2,
        nearMisses: 1,
        throughElements: 3,
        overlaps: 1,
        length: 1000,
        displacement: 50,
        total: 0,
      })
    ).toBe(7);
  });
});
