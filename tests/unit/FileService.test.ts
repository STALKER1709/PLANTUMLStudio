import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileService } from '../../src/main/services/FileService';

let root: string;
let service: FileService;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'puml-files-'));
  service = new FileService();
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('FileService', () => {
  it('écrit puis relit un fichier .puml sans perte d’encodage', async () => {
    const filePath = path.join(root, 'diagramme.puml');
    const content = '@startuml\nclass Élève\nnote right : accentué\n@enduml\n';

    await service.writePumlFile(filePath, content);

    expect(await service.readPumlFile(filePath)).toBe(content);
    // L'écriture passe par un fichier temporaire qui doit avoir disparu.
    expect(fs.readdirSync(root)).toEqual(['diagramme.puml']);
  });

  it('construit une arborescence triée et filtrée', async () => {
    await fsp.mkdir(path.join(root, 'sous-dossier'));
    await fsp.mkdir(path.join(root, 'node_modules'));
    await fsp.writeFile(path.join(root, 'node_modules', 'ignore.puml'), '');
    await fsp.writeFile(path.join(root, 'b.puml'), '');
    await fsp.writeFile(path.join(root, 'a.puml'), '');
    await fsp.writeFile(path.join(root, 'notes.txt'), '');
    await fsp.writeFile(path.join(root, 'sous-dossier', 'c.plantuml'), '');

    const tree = await service.buildFileTree(root);
    const names = tree.children?.map((child) => child.name);

    // Dossiers d'abord, puis fichiers PlantUML par ordre alphabétique.
    expect(names).toEqual(['sous-dossier', 'a.puml', 'b.puml']);
    expect(names).not.toContain('notes.txt');
    expect(names).not.toContain('node_modules');
  });

  it('crée un fichier en ajoutant l’extension et refuse d’écraser', async () => {
    const created = await service.createFile(root, 'mon-diagramme', '@startuml\n@enduml');

    expect(created).toBe(path.join(root, 'mon-diagramme.puml'));
    await expect(service.createFile(root, 'mon-diagramme')).rejects.toThrow();
  });

  it('renomme un fichier et refuse une collision', async () => {
    const original = await service.createFile(root, 'ancien');
    await service.createFile(root, 'occupe');

    const renamed = await service.renameFile(original, 'nouveau');
    expect(path.basename(renamed)).toBe('nouveau.puml');
    expect(fs.existsSync(original)).toBe(false);

    await expect(service.renameFile(renamed, 'occupe')).rejects.toThrow(/existe déjà/);
  });

  it('détecte les chemins sortant de la racine du projet', () => {
    expect(service.isWithin(root, path.join(root, 'a', 'b.puml'))).toBe(true);
    expect(service.isWithin(root, root)).toBe(true);
    expect(service.isWithin(root, path.join(root, '..', 'ailleurs.puml'))).toBe(false);
    expect(service.isWithin(root, '/etc/passwd')).toBe(false);
  });

  it('liste récursivement les sources PlantUML', async () => {
    await fsp.mkdir(path.join(root, 'modules'));
    await fsp.writeFile(path.join(root, 'racine.puml'), '');
    await fsp.writeFile(path.join(root, 'modules', 'module.puml'), '');
    await fsp.writeFile(path.join(root, 'modules', 'lisezmoi.md'), '');

    const files = await service.listPumlFiles(root);

    expect(files).toHaveLength(2);
    expect(files.every((file) => file.endsWith('.puml'))).toBe(true);
  });
});
