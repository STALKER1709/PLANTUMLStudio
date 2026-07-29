import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const ROOT = path.resolve(__dirname, '../..');
const MAIN_ENTRY = path.join(ROOT, 'dist/main/index.js');
const JAR = path.join(ROOT, 'resources/plantuml.jar');

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  test.skip(
    !fs.existsSync(MAIN_ENTRY),
    'Application non compilée : exécutez « npm run build » avant les tests e2e.'
  );

  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test("l'application démarre et affiche ses trois panneaux", async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : seul l’écran de diagnostic s’affiche.');

  await expect(window.locator('.toolbar')).toBeVisible();
  await expect(window.locator('.three-panel')).toBeVisible();
  await expect(window.getByText('Fichiers', { exact: true })).toBeVisible();
  await expect(window.getByText('Prévisualisation', { exact: true })).toBeVisible();
});

test('la saisie de code PlantUML produit un aperçu SVG', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  const editor = window.locator('.monaco-editor');
  // `force` : les calques de rendu de Monaco recouvrent sa zone de saisie ;
  // le clic sert uniquement à donner le focus avant la frappe au clavier.
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type('@startuml\nAlice -> Bob : Bonjour\n@enduml');

  // Le rendu est débouncé (400 ms par défaut) puis renvoyé par le main process.
  await expect(window.locator('.preview-stage svg')).toBeVisible({ timeout: 30_000 });
});

test('une syntaxe invalide affiche le panneau d’erreurs en français', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type('@startuml\nclass A {{{\n@enduml');

  await expect(window.locator('.error-panel')).toBeVisible({ timeout: 30_000 });
  await expect(window.getByText('Erreur de génération')).toBeVisible();
});

test('un brouillon édité peut être enregistré via « Enregistrer sous »', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : seul l’écran de diagnostic s’affiche.');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'puml-e2e-'));
  const chosenPath = path.join(directory, 'mon-diagramme');

  // La boîte de dialogue système ne s'automatise pas : on lui substitue une
  // réponse, ce qui laisse tout le reste du chemin s'exécuter réellement.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, chosenPath);

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type('@startuml\ntitle Version 1\n@enduml');

  await window.locator('button', { hasText: /^Enregistrer$/ }).click();
  const savedPath = `${chosenPath}.puml`;
  await expect
    .poll(() => fs.existsSync(savedPath), { timeout: 10_000 })
    .toBe(true);
  expect(fs.readFileSync(savedPath, 'utf-8')).toContain('Version 1');

  // Le fichier est adopté : le raccourci suivant y écrit directement, alors
  // même qu'aucun projet n'est ouvert.
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type('@startuml\ntitle Version 2\n@enduml');
  await window.keyboard.press('Control+s');
  await expect
    .poll(() => fs.readFileSync(savedPath, 'utf-8').includes('Version 2'), { timeout: 10_000 })
    .toBe(true);

  fs.rmSync(directory, { recursive: true, force: true });
});

test("une écriture hors des chemins désignés reste refusée", async () => {
  const intrus = path.join(os.tmpdir(), `puml-intrus-${Date.now()}.puml`);

  const result = await window.evaluate(
    (target) =>
      (
        globalThis as unknown as {
          electronAPI: { saveFile(path: string, content: string): Promise<{ success: boolean }> };
        }
      ).electronAPI.saveFile(target, 'contenu'),
    intrus
  );

  expect(result.success).toBe(false);
  expect(fs.existsSync(intrus)).toBe(false);
});

test('les flèches se réajustent quand un élément change de côté', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type(
    '@startuml\nleft to right direction\nusecase "Commander" as UC\nusecase "Payer" as P\nUC ..> P\n@enduml'
  );
  await expect(window.locator('.preview-stage svg .entity').first()).toBeVisible({
    timeout: 30_000,
  });

  await window.locator('button', { hasText: /^Éditer$/ }).click();

  const lien = window.locator('g.link[data-entity-1="UC"] path');
  const avant = await lien.getAttribute('d');

  // « Commander » passe largement à droite de « Payer » : la flèche doit
  // repartir du bord opposé, et non conserver son ancrage d'origine.
  const boite = await window.locator('g.entity[data-entity="UC"]').boundingBox();
  if (!boite) throw new Error('élément introuvable');
  await window.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await window.mouse.down();
  await window.mouse.move(boite.x + boite.width / 2 + 320, boite.y + boite.height / 2 + 90, {
    steps: 10,
  });
  await window.mouse.up();

  await expect.poll(() => lien.getAttribute('d'), { timeout: 5000 }).not.toBe(avant);

  const apres = (await lien.getAttribute('d')) ?? '';
  const [, x1, , x2] = apres.match(/M([-\d.]+),([-\d.]+) L([-\d.]+),([-\d.]+)/) ?? [];
  expect(apres, 'le tracé est recalculé, pas étiré').toMatch(/^M[-\d.]+,[-\d.]+ L[-\d.]+,[-\d.]+$/);
  // Le départ est désormais à droite de l'arrivée : la flèche a changé de bord.
  expect(Number(x1)).toBeGreaterThan(Number(x2));
});

test("l'application ne déclenche aucune requête réseau", async () => {
  const requests: string[] = [];
  window.on('request', (request) => {
    const url = request.url();
    if (!/^(file|devtools|data|blob):/i.test(url)) requests.push(url);
  });

  await window.waitForTimeout(2000);

  expect(requests, `requêtes inattendues : ${requests.join(', ')}`).toHaveLength(0);
});
