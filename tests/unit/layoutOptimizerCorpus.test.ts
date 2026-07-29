/**
 * Épreuve de l'optimiseur sur les diagrammes réellement produits.
 *
 * Les cas construits à la main vérifient la mécanique ; seul le rendu réel dit
 * si elle sert à quelque chose. Les 14 modèles livrés sont générés puis
 * analysés, et l'optimisation doit, sur chacun, ne rien dégrader.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  countDefects,
  optimizeLayout,
  scoreLayout,
  type LayoutModel,
} from '../../src/renderer/utils/layoutOptimizer';
import { modelFromSvg } from './helpers/svgModel';

const ROOT = path.resolve(__dirname, '../..');
const JAR = path.join(ROOT, 'resources/plantuml.jar');
const TEMPLATES = path.join(ROOT, 'templates');
const CONFIG = path.join(TEMPLATES, '_formalisme.puml');

function rendu(fichier: string): string {
  return execFileSync(
    'java',
    ['-jar', JAR, '-tsvg', '-pipe', '-charset', 'UTF-8', '-config', CONFIG],
    { input: fs.readFileSync(fichier), maxBuffer: 32 * 1024 * 1024 }
  ).toString('utf-8');
}

const modeles = fs.existsSync(TEMPLATES)
  ? fs
      .readdirSync(TEMPLATES)
      .filter((nom) => /^\d/.test(nom) && nom.endsWith('.puml'))
      .sort()
  : [];

describe.skipIf(!fs.existsSync(JAR))('Optimisation des modèles livrés', () => {
  const modeles14 = modeles.map((nom) => {
    const svg = rendu(path.join(TEMPLATES, nom));
    return { nom, model: modelFromSvg(svg) };
  });

  it.each(modeles14)('$nom : l’optimisation ne dégrade rien', ({ model }) => {
    const resultat = optimizeLayout(model);

    // La recherche n'accepte que des candidats strictement meilleurs : le score
    // final ne peut pas dépasser celui du départ.
    expect(resultat.after.total).toBeLessThanOrEqual(resultat.before.total + 1e-6);
    expect(countDefects(resultat.after)).toBeLessThanOrEqual(countDefects(resultat.before));
  });

  it('laisse intacts les diagrammes déjà sans défaut', () => {
    const sains = modeles14.filter(({ model }) => countDefects(scoreLayout(model, {})) === 0);

    // La grande majorité des modèles sort déjà propre de PlantUML : c'est bien
    // le cas à préserver, l'optimisation ne doit pas y toucher.
    expect(sains.length).toBeGreaterThan(0);
    sains.forEach(({ nom, model }) => {
      expect(optimizeLayout(model).offsets, `${nom} devrait rester tel quel`).toEqual({});
    });
  });

  it('corrige les défauts que PlantUML laisse derrière lui', () => {
    const avant = modeles14.reduce(
      (somme, { model }) => somme + countDefects(scoreLayout(model, {})),
      0
    );
    const apres = modeles14.reduce(
      (somme, { model }) => somme + countDefects(optimizeLayout(model).after),
      0
    );

    // Sans défaut à corriger, la garantie n'aurait aucune valeur : trois des
    // modèles livrés en présentent.
    expect(avant).toBeGreaterThan(0);
    expect(apres).toBeLessThan(avant);
  });

  it('termine assez vite pour un clic, sur chaque modèle', () => {
    modeles14.forEach(({ nom, model }) => {
      const debut = Date.now();
      optimizeLayout(model);
      expect(Date.now() - debut, `${nom} est trop lent`).toBeLessThan(2000);
    });
  });

  it('extrait bien le modèle du SVG rendu', () => {
    const classes = modeles14.find(({ nom }) => nom.startsWith('01'));
    expect(classes).toBeDefined();
    // Le diagramme de classes livré compte 8 éléments et 7 relations.
    expect((classes as { model: LayoutModel }).model.nodes.length).toBeGreaterThanOrEqual(8);
    expect((classes as { model: LayoutModel }).model.links.length).toBeGreaterThanOrEqual(7);
  });
});
