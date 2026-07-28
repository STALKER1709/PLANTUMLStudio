import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EnvironmentService } from '../../src/main/services/EnvironmentService';
import { embeddedJavaPath, findInPath, platformKey } from '../../src/main/utils/paths';

let resourcesPath: string;

beforeEach(async () => {
  resourcesPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'puml-env-'));
});

afterEach(async () => {
  await fsp.rm(resourcesPath, { recursive: true, force: true });
});

describe('EnvironmentService', () => {
  it('signale un moteur PlantUML absent et bloque le démarrage', async () => {
    const status = await new EnvironmentService({ resourcesPath }).checkEnvironment();

    expect(status.plantumlJarAvailable).toBe(false);
    expect(status.plantumlJarPath).toBeNull();
    expect(status.ready).toBe(false);
    expect(status.diagnostics.some((message) => message.includes('plantuml.jar'))).toBe(true);
  });

  it('déclare l’environnement prêt quand Java et le JAR sont disponibles', async () => {
    await fsp.writeFile(path.join(resourcesPath, 'plantuml.jar'), 'faux jar');
    const service = new EnvironmentService({ resourcesPath });

    const status = await service.checkEnvironment();

    // Java système présent ou non selon la machine : le contrat testé est la
    // cohérence entre `ready` et ses deux prérequis.
    expect(status.ready).toBe(status.javaAvailable && status.plantumlJarAvailable);
    expect(status.plantumlJarAvailable).toBe(true);
  });

  it('retombe sur Smetana lorsque Graphviz est introuvable', async () => {
    const status = await new EnvironmentService({ resourcesPath }).checkEnvironment();

    if (findInPath('dot')) {
      // Machine équipée de Graphviz : le moteur natif doit être retenu.
      expect(status.layoutEngine).toBe('graphviz');
      return;
    }

    expect(status.graphvizAvailable).toBe(false);
    expect(status.layoutEngine).toBe('smetana');
    expect(status.diagnostics.some((message) => message.includes('Smetana'))).toBe(true);
  });

  it('retourne null pour un binaire java inexistant', async () => {
    const service = new EnvironmentService({ resourcesPath, probeTimeoutMs: 2000 });

    const version = await service.probeJavaVersion(path.join(resourcesPath, 'java-absent'));

    expect(version).toBeNull();
  });

  it('cherche le JRE embarqué à l’emplacement propre à la plateforme', () => {
    const windowsPath = embeddedJavaPath('/res', 'win32');
    const macPath = embeddedJavaPath('/res', 'darwin');
    const linuxPath = embeddedJavaPath('/res', 'linux');

    expect(windowsPath).toContain(path.join('jre', 'win'));
    expect(windowsPath.endsWith('java.exe')).toBe(true);
    // Les JRE macOS sont livrés sous Contents/Home.
    expect(macPath).toContain(path.join('mac', 'Contents', 'Home', 'bin'));
    expect(linuxPath).toContain(path.join('jre', 'linux', 'bin', 'java'));
    expect(platformKey('win32')).toBe('win');
  });
});
