import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { PlantUMLService } from '../../src/main/services/PlantUMLService';
import { TemplateService } from '../../src/main/services/TemplateService';

const REPO_TEMPLATES = path.resolve(__dirname, '../../templates');
const JAR = path.resolve(__dirname, '../../resources/plantuml.jar');

/** Les 14 diagrammes de la norme UML 2.5. */
const UML_DIAGRAMS = [
  { id: '01-diagramme-classes', category: 'structurel' },
  { id: '02-diagramme-objets', category: 'structurel' },
  { id: '03-diagramme-composants', category: 'structurel' },
  { id: '04-diagramme-deploiement', category: 'structurel' },
  { id: '05-diagramme-paquetages', category: 'structurel' },
  { id: '06-diagramme-structure-composite', category: 'structurel' },
  { id: '07-diagramme-profil', category: 'structurel' },
  { id: '08-diagramme-cas-utilisation', category: 'comportemental' },
  { id: '09-diagramme-sequence', category: 'comportemental' },
  { id: '10-diagramme-communication', category: 'comportemental' },
  { id: '11-diagramme-activite', category: 'comportemental' },
  { id: '12-diagramme-etats-transitions', category: 'comportemental' },
  { id: '13-diagramme-temps', category: 'comportemental' },
  { id: '14-diagramme-vue-ensemble-interactions', category: 'comportemental' },
] as const;

describe('TemplateService', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'puml-modeles-'));
  });

  afterEach(async () => {
    await fsp.rm(directory, { recursive: true, force: true });
  });

  it('lit le libellé et la famille déclarés en tête de modèle', async () => {
    await fsp.writeFile(
      path.join(directory, '01-essai.puml'),
      "' Diagramme de classes — structure statique du système\n' @categorie structurel\n@startuml\n@enduml"
    );
    await fsp.writeFile(
      path.join(directory, '02-autre.puml'),
      "' Diagramme de séquence — échanges chronologiques\n' @categorie comportemental\n@startuml\n@enduml"
    );

    const templates = await new TemplateService(directory).listTemplates();

    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({
      id: '01-essai',
      label: 'Diagramme de classes',
      category: 'structurel',
    });
    expect(templates[1].category).toBe('comportemental');
  });

  it('ignore les fichiers de support préfixés par « _ »', async () => {
    await fsp.writeFile(path.join(directory, '_formalisme.puml'), "' Formalisme commun\n");
    await fsp.writeFile(path.join(directory, '01-reel.puml'), "' Un modèle\n' @categorie structurel\n");

    const templates = await new TemplateService(directory).listTemplates();

    expect(templates.map((template) => template.id)).toEqual(['01-reel']);
  });

  it('retombe sur le nom de fichier quand l’en-tête est absent', async () => {
    await fsp.writeFile(path.join(directory, '03-diagramme-de-flux.puml'), '@startuml\n@enduml');

    const [template] = await new TemplateService(directory).listTemplates();

    expect(template.label).toBe('Diagramme de flux');
    expect(template.category).toBe('structurel');
  });

  it('refuse de lire un modèle hors du dossier des modèles', async () => {
    await fsp.writeFile(path.join(directory, 'ok.puml'), '@startuml\n@enduml');
    const service = new TemplateService(directory);

    // `path.basename` neutralise la remontée de dossier.
    await expect(service.readTemplate('../../../etc/passwd')).rejects.toThrow();
  });

  it('retourne une liste vide si le dossier n’existe pas', async () => {
    const templates = await new TemplateService(path.join(directory, 'absent')).listTemplates();
    expect(templates).toEqual([]);
  });
});

describe('Modèles livrés', () => {
  it('couvre les 14 diagrammes UML, correctement classés', async () => {
    const templates = await new TemplateService(REPO_TEMPLATES).listTemplates();

    expect(templates.map((template) => template.id)).toEqual(UML_DIAGRAMS.map((d) => d.id));

    for (const expected of UML_DIAGRAMS) {
      const template = templates.find((candidate) => candidate.id === expected.id);
      expect(template?.category, expected.id).toBe(expected.category);
      expect(template?.label, expected.id).toMatch(/\S/);
    }
  });

  it('applique le formalisme documenté dans chaque modèle', async () => {
    for (const { id } of UML_DIAGRAMS) {
      const source = await fsp.readFile(path.join(REPO_TEMPLATES, `${id}.puml`), 'utf-8');

      // En-tête de métadonnées, police commune et absence d'ombres portées :
      // c'est le socle visuel partagé par les 14 modèles.
      expect(source, id).toContain('@categorie');
      expect(source, id).toContain('<style>');
      expect(source, id).toContain('FontName "Segoe UI"');
      // Teinte directrice du formalisme : bordures et flèches bleues.
      expect(source, id).toContain('LineColor #1E90FF');
      expect(source, id).toContain('skinparam shadowing false');
      expect(source, id).toMatch(/@start\w+/);
      expect(source, id).toMatch(/@end\w+/);
    }
  });
});

// Le rendu réel exige Java et plantuml.jar : la suite reste exécutable sans eux.
describe.skipIf(!fs.existsSync(JAR))('Rendu des modèles livrés', () => {
  it(
    'génère les 14 diagrammes sans erreur',
    { timeout: 180_000 },
    async () => {
      const service = new PlantUMLService({
        resourcesPath: path.resolve(__dirname, '../../resources'),
      });

      for (const { id } of UML_DIAGRAMS) {
        const source = await fsp.readFile(path.join(REPO_TEMPLATES, `${id}.puml`), 'utf-8');
        const result = await service.render(source, 'svg');

        expect(result.success, `${id} : ${JSON.stringify(result.errors)}`).toBe(true);
        expect(result.svgContent, id).toContain('<svg');
      }
    }
  );
});
