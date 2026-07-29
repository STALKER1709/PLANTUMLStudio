import { describe, expect, it } from 'vitest';

import { horizontalOnly, nearestShift } from '../../src/renderer/utils/sequenceLayout';

describe('Déplacement dans un diagramme de séquence', () => {
  it('interdit le déplacement vertical d’un participant', () => {
    // L'axe vertical porte la chronologie : la déplacer changerait l'ordre des
    // messages sans que la source le dise.
    expect(horizontalOnly({ x: 120, y: -45 })).toEqual({ x: 120, y: 0 });
  });

  it('accroche chaque extrémité d’un message à sa propre ligne de vie', () => {
    const depart = { x: 20, dx: 0 };
    const arrivee = { x: 100, dx: 150 };

    // L'extrémité côté départ ne bouge pas…
    expect(nearestShift(22, depart, arrivee)).toBe(0);
    // …celle qui touche le participant déplacé le suit intégralement.
    expect(nearestShift(96, depart, arrivee)).toBe(150);
  });

  it('départage un point à équidistance en faveur du départ', () => {
    // Cas d'un message très court : le choix doit rester déterministe.
    expect(nearestShift(60, { x: 20, dx: 5 }, { x: 100, dx: 40 })).toBe(5);
  });

  it('suit le participant déplacé même quand les deux ont bougé', () => {
    const depart = { x: 20, dx: -30 };
    const arrivee = { x: 200, dx: 80 };

    expect(nearestShift(25, depart, arrivee)).toBe(-30);
    expect(nearestShift(190, depart, arrivee)).toBe(80);
  });
});
