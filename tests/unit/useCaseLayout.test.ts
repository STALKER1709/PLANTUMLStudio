import { describe, expect, it } from 'vitest';

import { boxCenter, type Box } from '../../src/renderer/utils/diagramLayout';
import { ACTOR_SPACING, COLUMN_GAP, arrangeUseCaseColumns } from '../../src/renderer/utils/useCaseLayout';

/** Boîtes d'un diagramme typique : un cadre, trois cas, trois acteurs. */
function diagramme(): Map<string, Box> {
  return new Map<string, Box>([
    ['SYS', { x: 200, y: 0, width: 400, height: 300 }],
    ['UC1', { x: 250, y: 20, width: 120, height: 40 }],
    ['UC2', { x: 250, y: 130, width: 120, height: 40 }],
    ['UC3', { x: 250, y: 240, width: 120, height: 40 }],
    // Placés n'importe où par Graphviz : c'est ce qu'on vient corriger.
    ['A1', { x: 700, y: 500, width: 60, height: 50 }],
    ['A2', { x: 10, y: 900, width: 80, height: 50 }],
    ['S1', { x: 0, y: -200, width: 100, height: 40 }],
  ]);
}

/** Position finale d'un élément, décalage appliqué. */
function place(boxes: Map<string, Box>, offsets: Record<string, { x: number; y: number }>, id: string): Box {
  const box = boxes.get(id) as Box;
  const offset = offsets[id] ?? { x: 0, y: 0 };
  return { ...box, x: box.x + offset.x, y: box.y + offset.y };
}

describe('Mise en colonnes des acteurs', () => {
  const boxes = diagramme();
  const offsets = arrangeUseCaseColumns({ boxes, primary: ['A1', 'A2'], secondary: ['S1'] });

  it('met les principaux à gauche de tout le reste', () => {
    const noyauGauche = 200; // bord gauche du cadre
    ['A1', 'A2'].forEach((id) => {
      const boite = place(boxes, offsets, id);
      expect(boite.x + boite.width, id).toBeLessThanOrEqual(noyauGauche - COLUMN_GAP);
    });
  });

  it('met les secondaires à droite de tout le reste', () => {
    const noyauDroit = 600; // bord droit du cadre
    const boite = place(boxes, offsets, 'S1');
    expect(boite.x).toBeGreaterThanOrEqual(noyauDroit + COLUMN_GAP);
  });

  it('aligne les acteurs d’une colonne sur un même axe vertical', () => {
    const a1 = place(boxes, offsets, 'A1');
    const a2 = place(boxes, offsets, 'A2');
    // Largeurs différentes, mais centres alignés.
    expect(boxCenter(a1).x).toBeCloseTo(boxCenter(a2).x, 6);
  });

  it('respecte l’ordre donné, qui est celui de la source', () => {
    const a1 = place(boxes, offsets, 'A1');
    const a2 = place(boxes, offsets, 'A2');
    expect(boxCenter(a1).y).toBeLessThan(boxCenter(a2).y);
  });

  it('répartit les acteurs sur la hauteur du diagramme', () => {
    const a1 = place(boxes, offsets, 'A1');
    const a2 = place(boxes, offsets, 'A2');
    // Le noyau va de 0 à 300 : deux acteurs se placent au quart et aux trois quarts.
    expect(boxCenter(a1).y).toBeCloseTo(75, 6);
    expect(boxCenter(a2).y).toBeCloseTo(225, 6);
  });

  it('ne tasse jamais deux acteurs l’un sur l’autre', () => {
    // Six acteurs pour un noyau de 300 de haut : la colonne doit déborder
    // plutôt que de les superposer.
    const serre = new Map(boxes);
    const nombreux = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
    nombreux.forEach((id, rang) => serre.set(id, { x: 0, y: rang * 10, width: 60, height: 50 }));

    const compact = arrangeUseCaseColumns({ boxes: serre, primary: nombreux, secondary: [] });
    const places = nombreux
      .map((id) => place(serre, compact, id))
      .sort((a, b) => a.y - b.y);

    places.slice(1).forEach((boite, rang) => {
      const precedente = places[rang];
      expect(boite.y).toBeGreaterThanOrEqual(precedente.y + precedente.height + ACTOR_SPACING - 1e-6);
    });
  });

  it('ne touche à rien s’il n’y a que des acteurs', () => {
    const sansCas = new Map<string, Box>([['A1', { x: 0, y: 0, width: 60, height: 50 }]]);
    expect(arrangeUseCaseColumns({ boxes: sansCas, primary: ['A1'], secondary: [] })).toEqual({});
  });

  it('ignore un acteur absent du rendu', () => {
    const resultat = arrangeUseCaseColumns({ boxes, primary: ['A1', 'FANTOME'], secondary: [] });
    expect(resultat).not.toHaveProperty('FANTOME');
    expect(resultat).toHaveProperty('A1');
  });
});
