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
 * Le réglage est mémorisé d'une session à l'autre : sans le remettre dans son
 * état par défaut, un test dépendrait de ce qu'une exécution précédente a
 * laissé — et pourrait passer pour une mauvaise raison.
 */
async function activerFormalisme(): Promise<void> {
  const bouton = window.locator('button', { hasText: /^Formalisme$/ });
  if ((await bouton.getAttribute('aria-pressed')) !== 'true') await bouton.click();
  await expect(bouton).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Les déplacements survivent aux régénérations tant qu'un élément garde son
 * nom — c'est voulu, et documenté. Deux tests qui nomment leurs classes « A »
 * et « B » se transmettent donc leurs déplacements : chacun doit repartir
 * d'une disposition vierge.
 */
async function reinitialiserDisposition(): Promise<void> {
  // Repéré par son intitulé : le libellé visible « ↺ 3 » varie avec le compte.
  const bouton = window.locator('button[title="Annuler tous les déplacements"]');
  if ((await bouton.count()) > 0) await bouton.click();
  await expect(bouton).toHaveCount(0);
}

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

  await activerFormalisme();

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

  await activerFormalisme();

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

  await activerFormalisme();

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

  await activerFormalisme();

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

  await activerFormalisme();

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
  // Le pied de diagramme n'existe pas toujours — « style strictuml » le
  // supprime — mais tout ce qui porte le participant doit suivre.
  const morceaux = window.locator('[data-participant="B"]');
  const nombreDeMorceaux = await morceaux.count();
  expect(nombreDeMorceaux, 'au moins la tête et la ligne de vie').toBeGreaterThanOrEqual(2);

  const boite = await tete.boundingBox();
  if (!boite) throw new Error('participant introuvable');
  await window.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await window.mouse.down();
  // Le geste comporte une composante verticale, qui doit être ignorée.
  await window.mouse.move(boite.x + boite.width / 2 + 150, boite.y + boite.height / 2 + 40, {
    steps: 10,
  });
  await window.mouse.up();

  // Tous les morceaux du participant se déplacent ensemble, et seulement en
  // abscisse : la chronologie n'est pas touchée.
  await expect(tete).toHaveAttribute('transform', 'translate(150,0)');
  for (let index = 0; index < nombreDeMorceaux; index += 1) {
    await expect(morceaux.nth(index)).toHaveAttribute('transform', 'translate(150,0)');
  }

  // Le message s'allonge du côté déplacé, et de lui seul.
  expect(Number(await trait.getAttribute('x1'))).toBeCloseTo(Number(avantDebut), 1);
  expect(Number(await trait.getAttribute('x2'))).toBeCloseTo(Number(avantFin) + 150, 1);
});

test('un lien contourne l’élément qu’on pose sur sa route', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await activerFormalisme();

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

test('« Optimiser » corrige la disposition et rend compte du gain', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await reinitialiserDisposition();
  await activerFormalisme();

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  // Noms propres à ce test : les déplacements sont indexés par nom d'élément
  // et survivent aux régénérations, si bien que deux tests nommant tous deux
  // leurs classes « A » et « B » se transmettraient leurs déplacements.
  // « OptB » est déclaré entre les deux autres : PlantUML l'aligne au milieu,
  // et le lien OptA→OptC le traverse.
  await window.keyboard.type(
    '@startuml\nclass OptA\nclass OptB\nclass OptC\nOptA --> OptC\nOptA --> OptB\n@enduml'
  );
  await expect(window.locator('.preview-stage svg g.link').first()).toBeVisible({
    timeout: 30_000,
  });

  const positionAvant = await window
    .locator('g.entity[data-entity="OptB"]')
    .getAttribute('transform');
  expect(positionAvant, 'aucun déplacement au départ').toBeNull();

  await window.locator('button', { hasText: /^Optimiser$/ }).click();

  // Le message rend compte du nombre de défauts avant et après. Les messages
  // s'empilent : seul le dernier concerne le test en cours.
  const toast = window.locator('.toast').last();
  await expect(toast).toBeVisible({ timeout: 20_000 });
  const message = (await toast.textContent()) ?? '';
  expect(message).toMatch(/Disposition optimisée : (\d+) défauts → (\d+)\.|Disposition déjà/);

  if (/optimisée/.test(message)) {
    const [, avant, apres] = message.match(/(\d+) défauts → (\d+)/) ?? [];
    expect(Number(apres), 'le score annoncé doit être meilleur').toBeLessThan(Number(avant));

    // Le compteur d'annulation apparaît : l'optimisation est un déplacement
    // comme un autre, réversible d'un clic.
    await expect(window.locator('button', { hasText: /^↺ \d+$/ })).toBeVisible();
  }
});

test("l'assistant écrit un diagramme sans qu'on tape de PlantUML", async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await activerFormalisme();
  await window.locator('button', { hasText: /^Assistant$/ }).click();

  const dialogue = window.locator('.dialog.assistant');
  await expect(dialogue).toBeVisible();

  await dialogue.locator('.assistant-entete select').selectOption({
    label: "Diagramme de cas d'utilisation",
  });
  await dialogue.locator('.assistant-entete input').fill('Réservation en ligne');

  // Le formulaire est organisé par acteur : chacun porte ses propres cas.
  await expect(dialogue.locator('.assistant-section legend')).toHaveText([
    'Système',
    'Acteurs et leurs cas d’utilisation',
    'Cas sans acteur direct',
    'Relations entre cas',
  ]);

  const acteurs = dialogue.locator('.assistant-section', { hasText: 'Acteurs' }).first();
  await acteurs.getByRole('button', { name: /Ajouter/ }).click();
  const nouvelle = acteurs.locator('.assistant-ligne').last();
  await nouvelle.locator('input').first().fill('Administrateur');
  // Il hérite du visiteur ET répète l'un de ses cas : c'est ce que la règle
  // doit rattraper.
  await nouvelle.locator('select').nth(1).selectOption('Visiteur');
  await nouvelle.locator('textarea').fill('Consulter le catalogue\nModérer les avis');

  const apercu = dialogue.locator('.assistant-apercu pre');
  await expect(apercu).toContainText('title Réservation en ligne');
  await expect(apercu).toContainText('actor "Administrateur"');
  // Les recettes de disposition documentées sont écrites par l'assistant.
  await expect(apercu).toContainText('left to right direction');
  await expect(apercu).toContainText('together {');

  const source = (await apercu.textContent()) ?? '';
  // Le cas propre est relié…
  expect(source).toContain('Administrateur -- Moderer_les_avis');
  // …mais pas celui que la généralisation lui donne déjà.
  expect(source, 'la flèche héritée n’est pas redessinée').not.toContain(
    'Administrateur -- Consulter_le_catalogue'
  );
  expect(source).toContain('Visiteur -- Consulter_le_catalogue');

  await dialogue.locator('button', { hasText: /^Créer le diagramme$/ }).click();
  await expect(dialogue).toHaveCount(0);

  // La source atterrit dans l'éditeur et se génère sans erreur.
  await expect(window.locator('.preview-stage svg .entity').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(window.locator('.error-panel')).toHaveCount(0);
});

test('le Gantt se compose au formulaire et se génère', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await activerFormalisme();
  await window.locator('button', { hasText: /^Assistant$/ }).click();

  const dialogue = window.locator('.dialog.assistant');
  await expect(dialogue).toBeVisible();

  await dialogue.locator('.assistant-entete select').selectOption({
    label: 'Diagramme de Gantt',
  });
  await dialogue.locator('.assistant-entete input').fill('Planning de la refonte');

  await expect(dialogue.locator('.assistant-section legend')).toHaveText([
    'Projet',
    'Phases',
    'Jalons',
    'Jours non travaillés',
  ]);

  // Les phases sont déjà nommées : il ne reste que les périodes à changer.
  const phases = dialogue.locator('.assistant-section', { hasText: 'Phases' }).first();
  await expect(phases.locator('.assistant-ligne')).toHaveCount(8);
  await expect(phases.locator('.assistant-ligne').first().locator('input').first()).toHaveValue(
    "Phase d'insertion"
  );

  // On ne retouche qu'une période, comme le ferait l'utilisateur.
  const analyse = phases.locator('.assistant-ligne').nth(3);
  await analyse.locator('input').nth(1).fill('2024-03-04');
  await analyse.locator('input').nth(2).fill('2024-03-22');

  const apercu = dialogue.locator('.assistant-apercu pre');
  const source = (await apercu.textContent()) ?? '';

  // Le Gantt a ses propres balises : ce n'est pas de l'UML.
  expect(source.startsWith('@startgantt')).toBe(true);
  expect(source).not.toContain('@startuml');
  expect(source).toContain('title Planning de la refonte');
  expect(source).toContain('[Analyse du projet] starts 2024-03-04 and ends 2024-03-22');
  // La date de projet, laissée vide, est prise sur la phase la plus précoce.
  expect(source).toContain('Project starts 2023-07-03');
  // Deux phases se chevauchent sans qu'aucun enchaînement soit écrit.
  expect(source).toContain('[Rédaction du rapport] starts 2023-08-29 and ends 2023-09-29');
  expect(source).not.toContain('starts at');

  await dialogue.locator('button', { hasText: /^Créer le diagramme$/ }).click();
  await expect(dialogue).toHaveCount(0);

  // Le moteur le rend comme n'importe quel autre diagramme.
  await expect(window.locator('.preview-stage svg')).toBeVisible({ timeout: 30_000 });
  await expect(window.locator('.preview-stage svg')).toContainText('Analyse du projet');
  await expect(window.locator('.error-panel')).toHaveCount(0);
});

test('une flèche rendue redondante par un héritage est signalée', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await activerFormalisme();

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type(
    [
      '@startuml',
      'actor "Visiteur" as V',
      'actor "Client" as C',
      'usecase "Consulter" as UC',
      'V -- UC',
      'C -- UC',
      'V <|-- C',
      '@enduml',
    ].join('\n')
  );

  // Le diagramme se génère : ce n'est pas une erreur de syntaxe, mais une
  // faute de notation.
  const panneau = window.locator('.error-panel');
  await expect(panneau).toBeVisible({ timeout: 20_000 });
  await expect(panneau).toContainText('À corriger dans le diagramme');
  await expect(panneau).toContainText('redondante');
  // La ligne fautive est celle de la flèche, et elle est cliquable.
  await expect(panneau.locator('.error-line-link')).toHaveText('Ligne 6');
  await expect(window.locator('.preview-stage svg')).toBeVisible();

  // Un clic retire la flèche de trop et laisse un commentaire à sa place.
  await panneau.locator('.warnings-fix').click();
  await expect(panneau).toHaveCount(0, { timeout: 20_000 });

  // La source porte désormais l'explication, à la place de la flèche.
  await expect(window.locator('.monaco-editor')).toContainText(
    'sa flèche vers « Consulter » a été retirée'
  );

  // Le diagramme reste généré, et la flèche héritée a disparu du rendu. Trois
  // traits au départ — deux associations et la généralisation —, deux après ;
  // l'assertion patiente le temps que l'aperçu se régénère.
  await expect(window.locator('.preview-stage svg')).toBeVisible();
  await expect(window.locator('.preview-stage svg g.link')).toHaveCount(2, {
    timeout: 20_000,
  });
});

test('la dérivation produit les autres diagrammes depuis les cas d’utilisation', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await activerFormalisme();

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type(
    [
      '@startuml',
      'actor "Client" as C',
      'actor "Prestataire" as P',
      'usecase "Publier une mission" as UC1',
      'usecase "Postuler" as UC2',
      'usecase "S authentifier" as UC3',
      'C -- UC1',
      'P -- UC2',
      'UC1 ..> UC3 : <<include>>',
      '@enduml',
    ].join('\n')
  );
  await expect(window.locator('.preview-stage svg')).toBeVisible({ timeout: 30_000 });

  await window.locator('button', { hasText: /^Dériver$/ }).click();
  const dialogue = window.locator('.dialog.assistant');
  await expect(dialogue).toBeVisible();

  // Le diagramme a bien été lu.
  await expect(dialogue.locator('.assistant-aide').first()).toContainText('2 acteurs');
  await expect(dialogue.locator('.assistant-aide').first()).toContainText('3 cas');

  // Classes d'analyse, vue d'ensemble, puis séquence et communication par cas.
  const propositions = await dialogue.locator('.derive-choix strong').allTextContents();
  expect(propositions).toHaveLength(8);
  expect(propositions).toContain("Classes d'analyse");
  expect(propositions).toContain('Séquence — Publier une mission');

  // Ce qui ne se dérive pas est dit, avec sa raison.
  await expect(dialogue.locator('.derive-exclusions li').first()).toContainText('domaine');

  await dialogue.locator('.derive-choix', { hasText: 'Séquence — Publier une mission' }).click();
  const apercu = dialogue.locator('.assistant-apercu pre');
  // L'acteur du cas et le cas inclus s'y retrouvent, sans avoir été saisis.
  await expect(apercu).toContainText('actor "Client"');
  await expect(apercu).toContainText('ref over');
  await expect(apercu).toContainText('S authentifier');

  await dialogue.locator('button', { hasText: /^Ouvrir dans l’éditeur$/ }).click();
  await expect(dialogue).toHaveCount(0);

  // La source dérivée se génère sans erreur.
  await expect(window.locator('.preview-stage svg')).toBeVisible({ timeout: 30_000 });
  await expect(window.locator('.error-panel')).toHaveCount(0);
});

test('les acteurs se rangent en colonnes, et le zoom ne l’efface pas', async () => {
  test.skip(!fs.existsSync(JAR), 'plantuml.jar absent : le rendu est impossible.');

  await reinitialiserDisposition();
  await activerFormalisme();

  const editor = window.locator('.monaco-editor');
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.type(
    [
      '@startuml',
      'left to right direction',
      'actor "visiteur" as V',
      'actor "client" as C',
      'rectangle "API de paiement" as API <<actor>>',
      'rectangle "SmartLink" {',
      ' usecase "visiter" as U1',
      ' usecase "payer" as U2',
      '}',
      'V -- U1',
      'C -- U2',
      'U2 -- API',
      '@enduml',
    ].join('\n')
  );
  // Attendre un élément propre à CE diagramme : les entités du précédent
  // restent affichées jusqu'à ce que le nouveau rendu les remplace.
  await expect(window.locator('g.entity[data-entity="API"]')).toBeVisible({ timeout: 30_000 });
  await expect(window.locator('g.entity[data-entity="V"]')).toBeVisible();

  await window.locator('button', { hasText: /^Optimiser$/ }).click();
  // Les messages s'empilent et ne disparaissent qu'au bout de quelques
  // secondes : seul le dernier concerne le test en cours.
  const message = window.locator('.toast').last();
  await expect(message).toBeVisible({ timeout: 20_000 });
  await expect(message).toContainText('colonnes');

  /** Abscisses réellement occupées, décalages compris. */
  const abscisses = () =>
    window.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll('.preview-stage svg g[data-entity]')).map((g) => [
          g.getAttribute('data-entity'),
          Math.round((g as SVGGElement).getBoundingClientRect().x),
        ])
      )
    );

  const avant = (await abscisses()) as Record<string, number>;

  // Les principaux sont à gauche de tout le reste, le secondaire à droite.
  ['U1', 'U2', 'SmartLink', 'API'].forEach((id) => {
    expect(avant.V, `visiteur à gauche de ${id}`).toBeLessThan(avant[id]);
    expect(avant.C, `client à gauche de ${id}`).toBeLessThan(avant[id]);
  });
  ['U1', 'U2', 'SmartLink'].forEach((id) => {
    expect(avant.API, `API à droite de ${id}`).toBeGreaterThan(avant[id]);
  });

  // Régression : un zoom reconstruit le SVG côté React, et effaçait jusqu'ici
  // toutes les écritures faites dans le DOM — donc la disposition entière.
  await window.locator('button[title="Zoomer"]').click();
  await window.waitForTimeout(400);

  const transformes = await window.evaluate(() =>
    Array.from(document.querySelectorAll('.preview-stage svg g[data-entity][transform]')).length
  );
  expect(transformes, 'la disposition survit au zoom').toBeGreaterThan(0);
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
