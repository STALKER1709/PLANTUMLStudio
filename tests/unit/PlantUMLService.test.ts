import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

// plantuml.jar n'est pas versionné : les tests pilotent un faux processus Java
// pour rester reproductibles sur n'importe quelle machine.
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const { PlantUMLService } = await import('../../src/main/services/PlantUMLService');

const SVG_SAMPLE = '<?xml version="1.0"?><svg width="120" height="60"><g/></svg>';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  kill = vi.fn();
}

interface FakeRun {
  stdout?: string | Buffer;
  stderr?: string;
  exitCode?: number;
  /** Ne jamais terminer : utilisé pour le test de délai maximal. */
  hang?: boolean;
}

function mockJavaRun(run: FakeRun): void {
  spawnMock.mockImplementation(() => {
    const child = new FakeChildProcess();

    if (!run.hang) {
      setTimeout(() => {
        if (run.stdout) child.stdout.emit('data', Buffer.from(run.stdout));
        if (run.stderr) child.stderr.emit('data', Buffer.from(run.stderr));
        child.emit('close', run.exitCode ?? 0);
      }, 0);
    }

    return child;
  });
}

let resourcesPath: string;

beforeEach(() => {
  resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'puml-studio-test-'));
  fs.writeFileSync(path.join(resourcesPath, 'plantuml.jar'), 'faux jar');
  spawnMock.mockReset();
});

afterEach(() => {
  fs.rmSync(resourcesPath, { recursive: true, force: true });
});

function createService(overrides = {}) {
  return new PlantUMLService({
    resourcesPath,
    javaPath: '/usr/bin/java',
    dotPath: null,
    ...overrides,
  });
}

describe('PlantUMLService', () => {
  it('génère un SVG pour un diagramme de classes simple', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });

    const result = await createService().render('@startuml\nclass A\n@enduml', 'svg');

    expect(result.success).toBe(true);
    expect(result.svgContent).toContain('<svg');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('transmet la source sur stdin et demande le mode -pipe', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });
    const source = '@startuml\nAlice -> Bob : Bonjour\n@enduml';

    await createService().render(source, 'svg');

    const [javaPath, args] = spawnMock.mock.calls[0];
    expect(javaPath).toBe('/usr/bin/java');
    expect(args).toContain('-pipe');
    expect(args).toContain('-tsvg');
    // Sans Graphviz, le moteur Java « smetana » prend le relais.
    expect(args).toContain('-Playout=smetana');
    expect(args).toContain('-failfast2');
  });

  it('traduit une erreur de syntaxe et remonte le numéro de ligne', async () => {
    // Sortie réelle de plantuml.jar en mode -pipe, code de sortie 200.
    mockJavaRun({
      stderr: 'ERROR\n1\nSyntax Error? (Assumed diagram type: sequence)\nSome diagram description contains errors\n',
      exitCode: 200,
    });

    const result = await createService().render('@startuml\nclass A {{{\n@enduml', 'svg');

    expect(result.success).toBe(false);
    // Le résumé générique est écarté au profit de l'erreur précise.
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toContain('Erreur de syntaxe');
    // PlantUML compte à partir du @startuml : la ligne fautive est la 2e du fichier.
    expect(result.errors?.[0].line).toBe(2);
  });

  it('décale les numéros de ligne quand la source commence par des commentaires', async () => {
    mockJavaRun({ stderr: 'ERROR\n7\nSyntax Error?\n', exitCode: 200 });

    const source = ["' un commentaire", '@startuml', 'title Essai', '', 'a -> b', '', 'c -> d', '', 'ligne fautive', '@enduml'].join('\n');
    const result = await createService().render(source, 'svg');

    expect(result.errors?.[0].line).toBe(9);
  });

  it('écrit le rendu PNG à l’emplacement demandé', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockJavaRun({ stdout: png });

    const targetPath = path.join(resourcesPath, 'sortie', 'diagramme.png');
    const result = await createService().renderToFile('@startuml\nclass A\n@enduml', 'png', targetPath);

    expect(result.success).toBe(true);
    expect(result.outputPath).toMatch(/\.png$/);
    expect(fs.readFileSync(targetPath)).toEqual(png);
    // Le PNG est binaire : aucun contenu SVG ne doit être renvoyé.
    expect(result.svgContent).toBeUndefined();
  });

  it('renvoie une erreur explicite si le JAR est introuvable', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });
    const service = createService({ jarPath: '/chemin/inexistant/plantuml.jar' });

    const result = await service.render('@startuml\nclass A\n@enduml', 'svg');

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain('plantuml.jar');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('signale Java manquant lorsque le processus ne démarre pas', async () => {
    spawnMock.mockImplementation(() => {
      const child = new FakeChildProcess();
      const error = Object.assign(new Error('spawn java ENOENT'), { code: 'ENOENT' });
      setTimeout(() => child.emit('error', error), 0);
      return child;
    });

    const result = await createService().render('@startuml\nclass A\n@enduml', 'svg');

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain('Java');
  });

  it('interrompt un rendu qui dépasse le délai maximal', async () => {
    mockJavaRun({ hang: true });

    const result = await createService({ timeoutMs: 30 }).render('@startuml\nclass A\n@enduml', 'svg');

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toContain('délai maximal');
  });

  it('utilise Graphviz quand un binaire dot est fourni', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });
    const dotPath = path.join(resourcesPath, 'dot');
    fs.writeFileSync(dotPath, '');

    const service = createService({ dotPath });
    await service.render('@startuml\nclass A\n@enduml', 'svg');

    const [, args, options] = spawnMock.mock.calls[0];
    expect(args).not.toContain('-Playout=smetana');
    expect(options.env.GRAPHVIZ_DOT).toBe(dotPath);
    expect(service.getLayoutEngine()).toBe('graphviz');
  });

  it('applique le formalisme commun à une source qui n’en déclare pas', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });
    const configPath = path.join(resourcesPath, '_formalisme.puml');
    fs.writeFileSync(configPath, 'skinparam shadowing false');
    const service = createService({ formalismConfigPath: configPath });

    await service.render('@startuml\nclass A\n@enduml', 'svg');
    const [, withFormalism] = spawnMock.mock.calls[0];
    expect(withFormalism).toContain('-config');
    expect(withFormalism).toContain(configPath);

    // Le formalisme se désactive à la demande : la source est alors rendue
    // avec les réglages par défaut de PlantUML.
    await service.render('@startuml\nclass A\n@enduml', 'svg', { applyFormalism: false });
    const [, without] = spawnMock.mock.calls[1];
    expect(without).not.toContain('-config');
  });

  it('ignore un fichier de formalisme absent plutôt que d’échouer', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });
    const service = createService({ formalismConfigPath: '/chemin/inexistant.puml' });

    const result = await service.render('@startuml\nclass A\n@enduml', 'svg');

    expect(result.success).toBe(true);
    expect(spawnMock.mock.calls[0][1]).not.toContain('-config');
  });

  it('limite les accès disque au dossier du projet ouvert', async () => {
    mockJavaRun({ stdout: SVG_SAMPLE });
    const service = createService();

    await service.render('@startuml\nclass A\n@enduml', 'svg');
    const [, sandboxArgs] = spawnMock.mock.calls[0];
    expect(sandboxArgs).toContain('-DPLANTUML_SECURITY_PROFILE=SANDBOX');

    service.setIncludePath('/projets/mon-projet');
    await service.render('@startuml\nclass A\n@enduml', 'svg');
    const [, allowlistArgs] = spawnMock.mock.calls[1];
    expect(allowlistArgs).toContain('-DPLANTUML_SECURITY_PROFILE=ALLOWLIST');
    expect(allowlistArgs).toContain('-Dplantuml.allowlist.path=/projets/mon-projet');
  });
});
