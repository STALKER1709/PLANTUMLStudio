import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { EnvironmentStatus } from '../../shared/types';
import { logger } from '../utils/logger';
import {
  embeddedDotPath,
  embeddedJavaPath,
  findInPath,
  firstExisting,
  javaHomePath,
  plantumlJarPath,
} from '../utils/paths';

const execFileAsync = promisify(execFile);

export interface EnvironmentServiceOptions {
  resourcesPath?: string;
  /** Délai maximal d'une sonde (`java -version`, `dot -V`). */
  probeTimeoutMs?: number;
}

/**
 * Détecte l'environnement d'exécution au démarrage : Java (embarqué ou
 * système), plantuml.jar et Graphviz. Le résultat alimente l'écran de
 * diagnostic du renderer.
 */
export class EnvironmentService {
  private readonly resourcesPath: string;
  private readonly probeTimeoutMs: number;

  constructor(options: EnvironmentServiceOptions = {}) {
    this.resourcesPath =
      options.resourcesPath ??
      process.env.PLANTUML_STUDIO_RESOURCES ??
      path.join(process.cwd(), 'resources');
    this.probeTimeoutMs = options.probeTimeoutMs ?? 8_000;
  }

  async checkEnvironment(): Promise<EnvironmentStatus> {
    const diagnostics: string[] = [];

    const embeddedJava = embeddedJavaPath(this.resourcesPath);
    const declaredJava = javaHomePath();
    const systemJava = findInPath('java');
    // `java` sans chemin reste le dernier recours : il dépend du PATH du shell
    // qui a lancé l'application, lequel diffère parfois de celui de l'utilisateur.
    const javaCandidates = [embeddedJava, declaredJava, systemJava, 'java'].filter(
      (candidate): candidate is string => candidate !== null
    );

    let javaPath: string | null = null;
    let javaVersion: string | null = null;
    let javaIsEmbedded = false;

    for (const candidate of javaCandidates) {
      // `java` (sans chemin) n'est tenté qu'en dernier recours : il dépend du PATH.
      if (candidate !== 'java' && !fs.existsSync(candidate)) continue;

      const version = await this.probeJavaVersion(candidate);
      if (version) {
        javaPath = candidate;
        javaVersion = version;
        javaIsEmbedded = candidate === embeddedJava;
        break;
      }

      if (candidate === embeddedJava) {
        diagnostics.push(
          "Le JRE embarqué est présent mais ne démarre pas (architecture incompatible ?). Bascule sur le Java du système."
        );
      }
    }

    if (!javaPath) {
      diagnostics.push(
        "Java est introuvable : ni JRE embarqué (resources/jre/), ni JAVA_HOME, ni « java » dans le PATH."
      );
      diagnostics.push(
        "Deux solutions : exécuter « npm run resources:jre » pour embarquer un JRE dans l'application, ou installer Java 11 ou supérieur (Eclipse Temurin) puis rouvrir l'application."
      );
      if (process.env.JAVA_HOME) {
        diagnostics.push(
          `JAVA_HOME est défini (${process.env.JAVA_HOME}) mais aucun binaire java exploitable ne s'y trouve : vérifiez que le chemin pointe bien sur la racine d'un JDK ou JRE.`
        );
      }
    } else if (javaIsEmbedded) {
      logger.info(`JRE embarqué utilisé : ${javaPath} (${javaVersion})`);
    } else {
      logger.info(`Java système utilisé : ${javaPath} (${javaVersion})`);
      diagnostics.push(
        `Aucun JRE embarqué : l'application utilise le Java du système (${javaVersion}).`
      );
    }

    const jarPath = plantumlJarPath(this.resourcesPath);
    const plantumlJarAvailable = fs.existsSync(jarPath);
    if (!plantumlJarAvailable) {
      diagnostics.push(
        `Le moteur plantuml.jar est absent de ${jarPath}. Exécutez « npm run resources:plantuml ».`
      );
    }

    const graphvizPath = firstExisting([embeddedDotPath(this.resourcesPath), findInPath('dot')]);
    const graphvizAvailable = graphvizPath !== null && (await this.probeGraphviz(graphvizPath));
    if (!graphvizAvailable) {
      diagnostics.push(
        "Graphviz est absent : le moteur Smetana intégré prend le relais. Les diagrammes restent générables, avec une mise en page légèrement différente."
      );
    }

    const ready = Boolean(javaPath) && plantumlJarAvailable;

    return {
      javaAvailable: Boolean(javaPath),
      javaPath,
      javaVersion,
      javaIsEmbedded,
      plantumlJarAvailable,
      plantumlJarPath: plantumlJarAvailable ? jarPath : null,
      graphvizAvailable,
      graphvizPath: graphvizAvailable ? graphvizPath : null,
      layoutEngine: graphvizAvailable ? 'graphviz' : 'smetana',
      diagnostics,
      ready,
    };
  }

  /** Retourne la version de Java, ou `null` si le binaire ne répond pas. */
  async probeJavaVersion(javaPath: string): Promise<string | null> {
    try {
      // `java -version` écrit sur stderr, y compris en cas de succès.
      const { stdout, stderr } = await execFileAsync(javaPath, ['-version'], {
        timeout: this.probeTimeoutMs,
      });
      const output = `${stderr}${stdout}`;
      const match = output.match(/version "?([\d._]+)"?/i);
      return match ? match[1] : output.split('\n')[0]?.trim() || null;
    } catch (error) {
      logger.debug(`Sonde Java échouée pour ${javaPath}`, error);
      return null;
    }
  }

  private async probeGraphviz(dotPath: string): Promise<boolean> {
    try {
      await execFileAsync(dotPath, ['-V'], { timeout: this.probeTimeoutMs });
      return true;
    } catch (error) {
      logger.debug(`Sonde Graphviz échouée pour ${dotPath}`, error);
      return false;
    }
  }
}
