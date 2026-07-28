import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PROJECT_FILE_EXTENSION } from '../../src/shared/constants';
import { ProjectService } from '../../src/main/services/ProjectService';

let root: string;
let service: ProjectService;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'puml-projet-'));
  service = new ProjectService();
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('ProjectService', () => {
  it('crée un projet avec ses métadonnées et un premier diagramme', async () => {
    const project = await service.createProject(root, 'Modèle Métier');

    expect(project.meta.name).toBe('Modèle Métier');
    expect(path.basename(project.projectFilePath)).toBe(`modele-metier${PROJECT_FILE_EXTENSION}`);

    const entries = await fsp.readdir(root);
    expect(entries).toContain('01-premier-diagramme.puml');

    const raw = JSON.parse(await fsp.readFile(project.projectFilePath, 'utf-8'));
    expect(raw.settings.defaultFormat).toBe('svg');
  });

  it('refuse de créer un second projet dans le même dossier', async () => {
    await service.createProject(root);
    await expect(service.createProject(root)).rejects.toThrow(/déjà un projet/);
  });

  it('adopte un dossier sans fichier projet en en créant un', async () => {
    await fsp.writeFile(path.join(root, 'existant.puml'), '@startuml\n@enduml');

    const project = await service.openProject(root);

    expect(project.rootPath).toBe(root);
    expect(project.projectFilePath.endsWith(PROJECT_FILE_EXTENSION)).toBe(true);
    // Le dossier existant n'est pas modifié au-delà de l'ajout du fichier projet.
    expect(await fsp.readdir(root)).toContain('existant.puml');
  });

  it('complète les champs manquants d’un fichier projet partiel', async () => {
    const projectFile = path.join(root, `partiel${PROJECT_FILE_EXTENSION}`);
    await fsp.writeFile(projectFile, JSON.stringify({ name: 'Ancien projet' }), 'utf-8');

    const project = await service.readProject(projectFile);

    expect(project.meta.name).toBe('Ancien projet');
    expect(project.meta.settings.exportDirectory).toBe('exports');
    expect(project.meta.createdAt).toBeTruthy();
  });

  it('rejette un fichier projet illisible', async () => {
    const projectFile = path.join(root, `casse${PROJECT_FILE_EXTENSION}`);
    await fsp.writeFile(projectFile, '{ ceci n’est pas du JSON', 'utf-8');

    await expect(service.readProject(projectFile)).rejects.toThrow(/illisible/);
  });

  it('met à jour les réglages et l’horodatage', async () => {
    const project = await service.createProject(root);
    const before = project.meta.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await service.updateProject(project, {
      settings: { ...project.meta.settings, defaultFormat: 'pdf' },
    });

    expect(updated.meta.settings.defaultFormat).toBe('pdf');
    expect(updated.meta.updatedAt).not.toBe(before);

    const reread = await service.readProject(project.projectFilePath);
    expect(reread.meta.settings.defaultFormat).toBe('pdf');
  });
});
