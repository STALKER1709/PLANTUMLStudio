import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EnvironmentService } from '../../src/main/services/EnvironmentService';
import { embeddedJavaPath, findInPath, javaHomePath, platformKey } from '../../src/main/utils/paths';

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

  it('déduit le binaire java de JAVA_HOME', () => {
    // Cas fréquent sous Windows : Java installé, mais absent du PATH.
    expect(javaHomePath('win32', { JAVA_HOME: 'C:\\Program Files\\Java\\jdk-21' })).toBe(
      path.join('C:\\Program Files\\Java\\jdk-21', 'bin', 'java.exe')
    );
    expect(javaHomePath('linux', { JAVA_HOME: '/opt/java' })).toBe(
      path.join('/opt/java', 'bin', 'java')
    );
    // Les guillemets sont courants dans une variable saisie à la main.
    expect(javaHomePath('win32', { JAVA_HOME: '"C:\\Java\\jdk"' })).toBe(
      path.join('C:\\Java\\jdk', 'bin', 'java.exe')
    );
    expect(javaHomePath('linux', {})).toBeNull();
    expect(javaHomePath('linux', { JAVA_HOME: '   ' })).toBeNull();
  });

  it('retient le java de JAVA_HOME quand le PATH n’en contient aucun', async () => {
    // Faux JRE : un script exécutable qui répond comme `java -version`.
    const javaHome = path.join(resourcesPath, 'faux-jdk');
    await fsp.mkdir(path.join(javaHome, 'bin'), { recursive: true });
    const binary = path.join(javaHome, 'bin', 'java');
    await fsp.writeFile(binary, '#!/bin/sh\necho \'openjdk version "21.0.1"\' >&2\n');
    await fsp.chmod(binary, 0o755);

    const previous = process.env.JAVA_HOME;
    process.env.JAVA_HOME = javaHome;
    try {
      const status = await new EnvironmentService({ resourcesPath }).checkEnvironment();
      expect(status.javaAvailable).toBe(true);
      expect(status.javaPath).toBe(binary);
      expect(status.javaVersion).toBe('21.0.1');
      expect(status.javaIsEmbedded).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.JAVA_HOME;
      else process.env.JAVA_HOME = previous;
    }
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
