/**
 * La disposition retouchée à la souris doit survivre à la fermeture.
 *
 * Elle est rangée dans le `.plantumlproj` et non dans la source : un `.puml`
 * reste un fichier PlantUML valide, lisible par n'importe quel autre outil.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectService } from '../../src/main/services/ProjectService';
import { layoutKey } from '../../src/shared/paths';
import { useEditorStore } from '../../src/renderer/store/editorStore';

const dossiers: string[] = [];

async function projetNeuf() {
  const racine = await fs.mkdtemp(path.join(os.tmpdir(), 'puml-layout-'));
  dossiers.push(racine);
  const service = new ProjectService();
  return { service, projet: await service.createProject(racine, 'Essai') };
}

afterEach(async () => {
  await Promise.all(dossiers.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('Clef d’une disposition', () => {
  it('ramène le chemin au relatif, en séparateurs POSIX', () => {
    expect(layoutKey('/projets/demo', '/projets/demo/vues/classes.puml')).toBe('vues/classes.puml');
    expect(layoutKey('C:\\Projets\\Demo', 'C:\\Projets\\Demo\\vues\\classes.puml')).toBe(
      'vues/classes.puml'
    );
  });

  it('ignore la casse de la racine', () => {
    // Sous Windows et macOS, le même dossier se désigne de plusieurs façons.
    expect(layoutKey('C:\\Projets\\Demo', 'c:\\projets\\demo\\a.puml')).toBe('a.puml');
  });

  it('refuse un fichier hors du projet', () => {
    expect(layoutKey('/projets/demo', '/projets/autre/a.puml')).toBeNull();
    expect(layoutKey('/projets/demo', '/projets/demo')).toBeNull();
    expect(layoutKey('', '/a.puml')).toBeNull();
  });

  it('ne se laisse pas abuser par un préfixe partiel', () => {
    // « /projets/demo2 » commence par « /projets/demo » sans être dedans.
    expect(layoutKey('/projets/demo', '/projets/demo2/a.puml')).toBeNull();
  });
});

describe('Disposition conservée par le projet', () => {
  it('s’écrit dans le fichier projet et se relit', async () => {
    const { service, projet } = await projetNeuf();
    const fichier = path.join(projet.rootPath, '01-premier-diagramme.puml');

    const apres = await service.saveLayout(projet, fichier, { Client: { x: 40, y: -12 } });

    // Relu depuis le disque : c'est le seul test qui vaille.
    const relu = await service.readProject(projet.projectFilePath);
    expect(relu.meta.layouts['01-premier-diagramme.puml']).toEqual({ Client: { x: 40, y: -12 } });
    expect(service.layoutOf(relu, fichier)).toEqual({ Client: { x: 40, y: -12 } });
    expect(apres.meta.layouts).toEqual(relu.meta.layouts);
  });

  it('garde les dispositions des autres fichiers', async () => {
    const { service, projet } = await projetNeuf();
    const a = path.join(projet.rootPath, 'a.puml');
    const b = path.join(projet.rootPath, 'b.puml');

    const un = await service.saveLayout(projet, a, { A: { x: 1, y: 2 } });
    const deux = await service.saveLayout(un, b, { B: { x: 3, y: 4 } });

    expect(Object.keys(deux.meta.layouts).sort()).toEqual(['a.puml', 'b.puml']);
  });

  it('retire l’entrée quand la disposition est remise à plat', async () => {
    const { service, projet } = await projetNeuf();
    const fichier = path.join(projet.rootPath, 'a.puml');

    const posee = await service.saveLayout(projet, fichier, { A: { x: 1, y: 2 } });
    const remise = await service.saveLayout(posee, fichier, {});

    // Une table vide ne sert à rien et gonflerait le fichier projet.
    expect(remise.meta.layouts).toEqual({});
    const relu = await service.readProject(projet.projectFilePath);
    expect(relu.meta.layouts).toEqual({});
  });

  it('ignore un fichier situé hors du projet', async () => {
    const { service, projet } = await projetNeuf();

    const inchange = await service.saveLayout(projet, '/ailleurs/a.puml', { A: { x: 1, y: 2 } });

    expect(inchange.meta.layouts).toEqual({});
  });

  it('relit un projet écrit avant l’existence des dispositions', async () => {
    const { service, projet } = await projetNeuf();
    // Version antérieure du format : aucun champ « layouts ».
    await fs.writeFile(
      projet.projectFilePath,
      JSON.stringify({ name: 'Ancien', version: '1', settings: {} }, null, 2),
      'utf-8'
    );

    const relu = await service.readProject(projet.projectFilePath);

    expect(relu.meta.layouts).toEqual({});
    expect(relu.meta.name).toBe('Ancien');
  });

  it('n’efface pas les dispositions en changeant un réglage', async () => {
    const { service, projet } = await projetNeuf();
    const fichier = path.join(projet.rootPath, 'a.puml');

    const posee = await service.saveLayout(projet, fichier, { A: { x: 1, y: 2 } });
    const renomme = await service.updateProject(posee, { name: 'Autre nom' });

    expect(renomme.meta.layouts['a.puml']).toEqual({ A: { x: 1, y: 2 } });
  });
});

describe('Annulation d’un déplacement', () => {
  /** Le store est un module : chaque test repart d'une disposition vierge. */
  function neuf() {
    useEditorStore.getState().openDraft('@startuml\n@enduml');
    return useEditorStore.getState();
  }

  it('recule d’un geste et non d’un pixel', () => {
    neuf();
    const { beginMove, moveElement, undoLayout } = useEditorStore.getState();

    // Un seul glisser, mais des dizaines de positions intermédiaires.
    beginMove();
    for (let x = 1; x <= 30; x += 1) moveElement('A', { x, y: 0 });

    undoLayout();
    expect(useEditorStore.getState().layoutOffsets).toEqual({});
  });

  it('revient à l’état précédent, un cran à la fois', () => {
    neuf();
    const { beginMove, moveElement, undoLayout } = useEditorStore.getState();

    beginMove();
    moveElement('A', { x: 10, y: 0 });
    beginMove();
    moveElement('B', { x: 20, y: 0 });
    expect(Object.keys(useEditorStore.getState().layoutOffsets)).toEqual(['A', 'B']);

    undoLayout();
    expect(Object.keys(useEditorStore.getState().layoutOffsets)).toEqual(['A']);

    undoLayout();
    expect(useEditorStore.getState().layoutOffsets).toEqual({});
  });

  it('ne fait rien quand il n’y a plus rien à annuler', () => {
    neuf();
    useEditorStore.getState().undoLayout();

    expect(useEditorStore.getState().layoutOffsets).toEqual({});
    expect(useEditorStore.getState().layoutHistory).toEqual([]);
  });

  it('annule aussi une optimisation, qui déplace tout d’un coup', () => {
    neuf();
    const { beginMove, moveElement, applyLayout, undoLayout } = useEditorStore.getState();

    beginMove();
    moveElement('A', { x: 10, y: 0 });
    applyLayout({ A: { x: 99, y: 99 }, B: { x: 99, y: 99 } });
    undoLayout();

    // Un seul chemin d'annulation sert les déplacements comme l'optimisation.
    expect(useEditorStore.getState().layoutOffsets).toEqual({ A: { x: 10, y: 0 } });
  });

  it('remet un seul élément à sa place, sans toucher aux autres', () => {
    neuf();
    const { beginMove, moveElement, resetElement } = useEditorStore.getState();

    beginMove();
    moveElement('A', { x: 10, y: 0 });
    beginMove();
    moveElement('B', { x: 20, y: 0 });
    resetElement('A');

    expect(useEditorStore.getState().layoutOffsets).toEqual({ B: { x: 20, y: 0 } });
  });

  it('ignore la remise à plat d’un élément qui n’a pas bougé', () => {
    neuf();
    useEditorStore.getState().beginMove();
    useEditorStore.getState().moveElement('A', { x: 10, y: 0 });
    const avant = useEditorStore.getState().layoutHistory.length;

    useEditorStore.getState().resetElement('Inconnu');

    // Rien n'a changé : l'historique ne doit pas gagner un cran vide, qui
    // rendrait une annulation sans effet visible.
    expect(useEditorStore.getState().layoutHistory).toHaveLength(avant);
  });

  it('borne la profondeur de l’historique', () => {
    neuf();
    for (let rang = 0; rang < 80; rang += 1) {
      useEditorStore.getState().beginMove();
      useEditorStore.getState().moveElement('A', { x: rang, y: 0 });
    }

    expect(useEditorStore.getState().layoutHistory.length).toBeLessThanOrEqual(50);
  });

  it('repart à zéro en changeant de diagramme', () => {
    neuf();
    useEditorStore.getState().beginMove();
    useEditorStore.getState().moveElement('A', { x: 10, y: 0 });
    useEditorStore.getState().openFile('/projet/autre.puml', '@startuml\n@enduml');

    // L'historique appartient au diagramme affiché : annuler après un
    // changement de fichier ne doit pas ressusciter la disposition du précédent.
    expect(useEditorStore.getState().layoutHistory).toEqual([]);
    expect(useEditorStore.getState().layoutOffsets).toEqual({});
  });

  it('installe la disposition conservée à l’ouverture', () => {
    neuf();
    useEditorStore
      .getState()
      .openFile('/projet/a.puml', '@startuml\n@enduml', { Client: { x: 5, y: 6 } });

    expect(useEditorStore.getState().layoutOffsets).toEqual({ Client: { x: 5, y: 6 } });
  });
});
