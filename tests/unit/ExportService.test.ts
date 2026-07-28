import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportService } from '../../src/main/services/ExportService';
import type { PlantUMLService } from '../../src/main/services/PlantUMLService';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#eee"/></svg>';

let root: string;

/** Faux moteur : les tests d'export ne doivent pas dépendre de Java. */
function fakePlantUML(overrides: Partial<PlantUMLService> = {}): PlantUMLService {
  const service = {
    renderToBuffer: vi.fn(async (_source: string, format: 'svg' | 'png') => ({
      success: true,
      buffer: format === 'svg' ? Buffer.from(SVG) : Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    })),
    renderToFile: vi.fn(async (_source: string, format: 'svg' | 'png', targetPath: string) => {
      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      await fsp.writeFile(targetPath, format === 'svg' ? SVG : 'png');
      return { success: true, format, outputPath: targetPath, durationMs: 1 };
    }),
    ...overrides,
  };
  return service as unknown as PlantUMLService;
}

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'puml-export-'));
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('ExportService', () => {
  it('exporte un diagramme SVG vers le chemin demandé', async () => {
    const service = new ExportService(fakePlantUML());
    const targetPath = path.join(root, 'sortie', 'diagramme.svg');

    const result = await service.exportDiagram({ source: '@startuml\n@enduml', format: 'svg', targetPath });

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(targetPath);
    expect(await fsp.readFile(targetPath, 'utf-8')).toContain('<svg');
  });

  it('convertit un SVG en PDF vectoriel', async () => {
    const service = new ExportService(fakePlantUML());
    const targetPath = path.join(root, 'diagramme.pdf');

    const result = await service.exportDiagram({ source: '@startuml\n@enduml', format: 'pdf', targetPath });

    expect(result.success).toBe(true);
    const pdf = await fsp.readFile(targetPath);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('remonte les erreurs du moteur au lieu d’écrire un fichier vide', async () => {
    const service = new ExportService(
      fakePlantUML({
        renderToBuffer: vi.fn(async () => ({
          success: false,
          errors: [{ message: 'Erreur de syntaxe.', raw: 'Syntax Error' }],
        })) as unknown as PlantUMLService['renderToBuffer'],
      })
    );

    const result = await service.exportDiagram({
      source: 'invalide',
      format: 'pdf',
      targetPath: path.join(root, 'jamais-ecrit.pdf'),
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain('Erreur de syntaxe');
    await expect(fsp.access(path.join(root, 'jamais-ecrit.pdf'))).rejects.toThrow();
  });

  it('archive plusieurs diagrammes dans un ZIP', async () => {
    const first = path.join(root, 'un.puml');
    const second = path.join(root, 'deux.puml');
    await fsp.writeFile(first, '@startuml\nclass A\n@enduml');
    await fsp.writeFile(second, '@startuml\nclass B\n@enduml');

    const service = new ExportService(fakePlantUML());
    const targetPath = path.join(root, 'projet.zip');

    const result = await service.exportProject({ files: [first, second], format: 'svg', targetPath });

    expect(result.success).toBe(true);
    const entries = new AdmZip(targetPath).getEntries().map((entry) => entry.entryName);
    expect(entries.sort()).toEqual(['deux.svg', 'un.svg']);
  });

  it('poursuit l’archive malgré un fichier en échec et le signale', async () => {
    const valide = path.join(root, 'valide.puml');
    await fsp.writeFile(valide, '@startuml\nclass A\n@enduml');
    const manquant = path.join(root, 'absent.puml');

    const service = new ExportService(fakePlantUML());
    const targetPath = path.join(root, 'partiel.zip');

    const result = await service.exportProject({
      files: [valide, manquant],
      format: 'svg',
      targetPath,
    });

    expect(result.success).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures?.[0].file).toBe(manquant);
    expect(new AdmZip(targetPath).getEntries()).toHaveLength(1);
  });

  it('échoue explicitement si aucun diagramme n’a pu être exporté', async () => {
    const service = new ExportService(fakePlantUML());

    const result = await service.exportProject({
      files: [path.join(root, 'inexistant.puml')],
      format: 'png',
      targetPath: path.join(root, 'vide.zip'),
    });

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain("Aucun diagramme");
    await expect(fsp.access(path.join(root, 'vide.zip'))).rejects.toThrow();
  });
});
