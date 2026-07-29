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

/**
 * Le bouton bascule, et les tests partagent la même fenêtre : cliquer sans
 * regarder l'état désactiverait l'édition laissée active par le test précédent.
 */
async function activerEdition(): Promise<void> {
  const bouton = window.locator('button', { hasText: /^Éditer$/ });
  if ((await bouton.getAttribute('aria-pressed')) !== 'true') await bouton.click();
  await expect(bouton).toHaveAttribute('aria-pressed', 'true');
}

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

  await activerEdition();

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

test('un paquetage déplacé emmène son contenu et ses liens', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type(
    '@startuml\npackage "Metier" as PKG {\n class Compte\n}\nclass Client\nClient --> Compte\n@enduml'
  );
  await expect(window.locator('.preview-stage svg .cluster').first()).toBeVisible({
    timeout: 30_000,
  });

  await activerEdition();

  const paquetage = window.locator('g.cluster[data-entity="PKG"]');
  const classe = window.locator('g.entity[data-entity="Compte"]');
  const lien = window.locator('g.link[data-entity-1="Client"] path');

  const boitePaquetage = await paquetage.boundingBox();
  const avantLien = await lien.getAttribute('d');
  if (!boitePaquetage) throw new Error('paquetage introuvable');
  expect(await classe.getAttribute('transform'), 'aucun déplacement au départ').toBeNull();

  // On saisit le paquetage par son bandeau de titre, hors de la classe qu'il
  // contient : c'est bien le contenant qui doit être pris.
  await window.mouse.move(boitePaquetage.x + 18, boitePaquetage.y + 10);
  await window.mouse.down();
  await window.mouse.move(boitePaquetage.x + 18 + 220, boitePaquetage.y + 10 + 60, { steps: 10 });
  await window.mouse.up();

  // La classe n'a pas été saisie : elle suit parce qu'elle est contenue.
  await expect(paquetage).toHaveAttribute('transform', 'translate(220,60)');
  await expect(classe, 'le contenu hérite du déplacement').toHaveAttribute(
    'transform',
    'translate(220,60)'
  );
  // Ce qui est resté hors du paquetage ne bouge pas.
  expect(await window.locator('g.entity[data-entity="Client"]').getAttribute('transform')).toBeNull();

  // Le lien vient de l'extérieur : il doit être réacheminé vers la classe.
  const apresLien = (await lien.getAttribute('d')) ?? '';
  expect(apresLien).not.toBe(avantLien);
  const arrivee = apresLien.match(/L([-\d.]+),([-\d.]+)$/);
  expect(arrivee, 'le tracé rejoint la classe déplacée').not.toBeNull();
});

test('un participant de séquence se règle en abscisse, messages compris', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type(
    '@startuml\nparticipant A\nparticipant B\nA -> B : demande\n@enduml'
  );
  await expect(window.locator('.preview-stage svg g.message').first()).toBeVisible({
    timeout: 30_000,
  });

  await activerEdition();

  const tete = window.locator('g.participant.participant-head[data-participant="B"]');
  const trait = window.locator('g.message line');
  const [avantDebut, avantFin] = [
    await trait.getAttribute('x1'),
    await trait.getAttribute('x2'),
  ];

  const boite = await tete.boundingBox();
  if (!boite) throw new Error('participant introuvable');
  await window.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await window.mouse.down();
  // Le geste comporte une composante verticale, qui doit être ignorée.
  await window.mouse.move(boite.x + boite.width / 2 + 150, boite.y + boite.height / 2 + 40, {
    steps: 10,
  });
  await window.mouse.up();

  // Tête, pied et ligne de vie se déplacent ensemble, et seulement en abscisse.
  await expect(tete).toHaveAttribute('transform', 'translate(150,0)');
  await expect(
    window.locator('g.participant.participant-tail[data-participant="B"]')
  ).toHaveAttribute('transform', 'translate(150,0)');

  // Le message s'allonge du côté déplacé, et de lui seul.
  expect(Number(await trait.getAttribute('x1'))).toBeCloseTo(Number(avantDebut), 1);
  expect(Number(await trait.getAttribute('x2'))).toBeCloseTo(Number(avantFin) + 150, 1);
});

test('un lien contourne l’élément qu’on pose sur sa route', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  // A et C sont alignés verticalement, B est à côté.
  await window.keyboard.type('@startuml\nclass A\nclass C\nclass B\nA --> C\n@enduml');
  await expect(window.locator('.preview-stage svg g.link').first()).toBeVisible({
    timeout: 30_000,
  });

  await activerEdition();

  const lien = window.locator('g.link[data-entity-1="A"] path');
  const avant = (await lien.getAttribute('d')) ?? '';
  expect(avant, 'PlantUML trace d’abord une courbe directe').toContain('C');

  const [boiteA, boiteC, boiteB] = await Promise.all([
    window.locator('g.entity[data-entity="A"]').boundingBox(),
    window.locator('g.entity[data-entity="C"]').boundingBox(),
    window.locator('g.entity[data-entity="B"]').boundingBox(),
  ]);
  if (!boiteA || !boiteC || !boiteB) throw new Error('éléments introuvables');

  // B est amené pile au milieu du segment A→C, dont aucune extrémité ne bouge.
  await window.mouse.move(boiteB.x + boiteB.width / 2, boiteB.y + boiteB.height / 2);
  await window.mouse.down();
  await window.mouse.move(boiteA.x + boiteA.width / 2, (boiteA.y + boiteA.height + boiteC.y) / 2, {
    steps: 12,
  });
  await window.mouse.up();

  await expect.poll(() => lien.getAttribute('d'), { timeout: 5000 }).not.toBe(avant);

  const apres = (await lien.getAttribute('d')) ?? '';
  // Le tracé est devenu une polyligne : il fait le tour au lieu de traverser.
  expect(apres, 'le lien est dévié en segments droits').toMatch(/^M[\d.,-]+(?: L[\d.,-]+){2,}$/);

  // Le détour comporte au moins un coude entre les deux extrémités.
  const sommets = [...apres.matchAll(/([-\d.]+),([-\d.]+)/g)];
  expect(sommets.length, 'le tracé passe par au moins un point de dégagement').toBeGreaterThan(2);
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
