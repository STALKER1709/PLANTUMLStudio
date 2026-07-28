import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { DiagramFormat, PlantUMLError, RenderResult } from '../../shared/types';
import { logger } from '../utils/logger';
import { embeddedDotPath, embeddedJavaPath, findInPath, firstExisting, plantumlJarPath } from '../utils/paths';

/** Formats produits directement par plantuml.jar (le PDF passe par ExportService). */
export type EngineFormat = Extract<DiagramFormat, 'svg' | 'png'>;

export interface PlantUMLServiceOptions {
  /** Dossier `resources/` contenant plantuml.jar, jre/ et graphviz/. */
  resourcesPath?: string;
  /** Force le binaire java (sinon : JRE embarqué, puis java du PATH). */
  javaPath?: string;
  /** Force le chemin du JAR. */
  jarPath?: string;
  /** Force le binaire `dot`. `null` désactive Graphviz (repli Smetana). */
  dotPath?: string | null;
  /** Dossier temporaire pour les rendus fichier. */
  tmpDir?: string;
  /** Délai maximal d'un rendu, en millisecondes. */
  timeoutMs?: number;
  /** Dossier autorisé pour les `!include` (généralement la racine du projet). */
  includePath?: string | null;
}

interface BufferRenderOutcome {
  success: boolean;
  buffer?: Buffer;
  errors?: PlantUMLError[];
}

/** Résumé générique émis par PlantUML en fin de sortie d'erreur. */
const GENERIC_ERROR = /some diagram description contains errors/i;

/**
 * Traductions des messages d'erreur PlantUML les plus courants.
 * L'ordre compte : le premier motif qui correspond gagne.
 */
const ERROR_TRANSLATIONS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /syntax error/i, message: 'Erreur de syntaxe.' },
  {
    pattern: GENERIC_ERROR,
    message: 'La description du diagramme contient des erreurs.',
  },
  {
    pattern: /no @startuml|@startuml.*(not|non).*found|empty description/i,
    message: 'Aucun diagramme détecté : vérifiez la présence de @startuml et @enduml.',
  },
  {
    pattern: /(dot|graphviz).*(not|introuvable|does not exist|failed)/i,
    message:
      "Graphviz est introuvable ou inutilisable. L'application bascule normalement sur le moteur Smetana intégré.",
  },
  { pattern: /cannot find|unknown/i, message: 'Élément inconnu ou introuvable dans le diagramme.' },
  { pattern: /outofmemory/i, message: 'Mémoire insuffisante pour générer ce diagramme.' },
  {
    pattern: /assumed diagram type/i,
    message: "Type de diagramme non reconnu : PlantUML a utilisé un type par défaut.",
  },
];

export class PlantUMLService {
  private readonly resourcesPath: string;
  private readonly jarPath: string;
  private readonly explicitJavaPath?: string;
  private readonly explicitDotPath?: string | null;
  private readonly tmpDir: string;
  private readonly timeoutMs: number;
  private includePath: string | null;

  constructor(options: PlantUMLServiceOptions = {}) {
    this.resourcesPath =
      options.resourcesPath ??
      process.env.PLANTUML_STUDIO_RESOURCES ??
      path.join(process.cwd(), 'resources');
    this.jarPath = options.jarPath ?? plantumlJarPath(this.resourcesPath);
    this.explicitJavaPath = options.javaPath;
    this.explicitDotPath = options.dotPath;
    this.tmpDir = options.tmpDir ?? path.join(os.tmpdir(), 'plantuml-studio');
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.includePath = options.includePath ?? null;
  }

  /**
   * Autorise les `!include` relatifs au dossier du projet ouvert.
   * Passer `null` revient au mode SANDBOX (aucun accès disque).
   */
  setIncludePath(directory: string | null): void {
    this.includePath = directory;
  }

  /** Binaire java retenu : override → JRE embarqué → java du PATH → `java`. */
  getJavaPath(): string {
    if (this.explicitJavaPath) return this.explicitJavaPath;
    return (
      firstExisting([embeddedJavaPath(this.resourcesPath), findInPath('java')]) ?? 'java'
    );
  }

  /** Binaire `dot` retenu, ou `null` si aucun Graphviz n'est disponible. */
  getDotBinaryPath(): string | null {
    if (this.explicitDotPath !== undefined) return this.explicitDotPath;
    return firstExisting([embeddedDotPath(this.resourcesPath), findInPath('dot')]);
  }

  getJarPath(): string {
    return this.jarPath;
  }

  /** Moteur de mise en page effectif. */
  getLayoutEngine(): 'graphviz' | 'smetana' {
    return this.getDotBinaryPath() ? 'graphviz' : 'smetana';
  }

  /**
   * Rend un diagramme en mémoire (mode `-pipe`, aucun fichier temporaire).
   * C'est le chemin utilisé par la prévisualisation temps réel.
   */
  async render(source: string, format: EngineFormat = 'svg'): Promise<RenderResult> {
    const startedAt = Date.now();
    const outcome = await this.renderToBuffer(source, format);
    const durationMs = Date.now() - startedAt;

    if (!outcome.success || !outcome.buffer) {
      return { success: false, format, errors: outcome.errors, durationMs };
    }

    return {
      success: true,
      format,
      svgContent: format === 'svg' ? outcome.buffer.toString('utf-8') : undefined,
      durationMs,
    };
  }

  /** Rend un diagramme et l'écrit à l'emplacement demandé. */
  async renderToFile(
    source: string,
    format: EngineFormat,
    targetPath: string
  ): Promise<RenderResult> {
    const startedAt = Date.now();
    const outcome = await this.renderToBuffer(source, format);

    if (!outcome.success || !outcome.buffer) {
      return { success: false, format, errors: outcome.errors, durationMs: Date.now() - startedAt };
    }

    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, outcome.buffer);

    return {
      success: true,
      format,
      outputPath: targetPath,
      svgContent: format === 'svg' ? outcome.buffer.toString('utf-8') : undefined,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Exécute plantuml.jar et récupère la sortie binaire.
   * Public pour permettre à `ExportService` de convertir un SVG en PDF.
   */
  async renderToBuffer(source: string, format: EngineFormat): Promise<BufferRenderOutcome> {
    if (!fs.existsSync(this.jarPath)) {
      return {
        success: false,
        errors: [
          {
            message: `Moteur PlantUML introuvable (${this.jarPath}). Exécutez « npm run resources:plantuml » pour le télécharger.`,
            raw: 'plantuml.jar missing',
          },
        ],
      };
    }

    const javaPath = this.getJavaPath();
    const dotPath = this.getDotBinaryPath();
    const args = this.buildArgs(format, dotPath !== null);

    return new Promise<BufferRenderOutcome>((resolve) => {
      const env = { ...process.env };
      if (dotPath) env.GRAPHVIZ_DOT = dotPath;

      const child = spawn(javaPath, args, { env });

      const stdoutChunks: Buffer[] = [];
      let stderr = '';
      let settled = false;

      const finish = (outcome: BufferRenderOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(outcome);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({
          success: false,
          errors: [
            {
              message: `Le rendu a dépassé le délai maximal de ${Math.round(
                this.timeoutMs / 1000
              )} secondes.`,
              raw: 'timeout',
            },
          ],
        });
      }, this.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        const message =
          error.code === 'ENOENT'
            ? `Java est introuvable (${javaPath}). Installez un JRE ou exécutez « npm run resources:jre ».`
            : `Erreur d'exécution du moteur PlantUML : ${error.message}`;
        logger.error('Échec du lancement de plantuml.jar', error);
        finish({ success: false, errors: [{ message, raw: error.message }] });
      });

      child.on('close', (code) => {
        const buffer = Buffer.concat(stdoutChunks);

        if (code !== 0 || buffer.length === 0) {
          const errors = this.parseErrors(stderr, source);
          if (errors.length === 0) {
            errors.push({
              message: `Le moteur PlantUML s'est arrêté avec le code ${code ?? 'inconnu'}.`,
              raw: stderr.trim() || `exit code ${code}`,
            });
          }
          finish({ success: false, errors });
          return;
        }

        if (stderr.trim()) {
          logger.debug('Sortie stderr de PlantUML (rendu réussi)', stderr.trim());
        }
        finish({ success: true, buffer });
      });

      child.stdin.on('error', () => {
        // Le process a pu mourir avant la fin de l'écriture (EPIPE) :
        // l'erreur réelle est remontée par 'close'/'error'.
      });
      child.stdin.end(source, 'utf-8');
    });
  }

  /** Dossier temporaire de travail, créé à la demande. */
  async ensureTmpDir(): Promise<string> {
    await fsp.mkdir(this.tmpDir, { recursive: true });
    return this.tmpDir;
  }

  private buildArgs(format: EngineFormat, graphvizAvailable: boolean): string[] {
    const args = [
      '-Djava.awt.headless=true',
      ...this.buildSecurityArgs(),
      '-jar',
      this.jarPath,
      `-t${format}`,
      '-charset',
      'UTF-8',
      '-pipe',
      // Sans cette option, une erreur de syntaxe produit une image d'erreur
      // avec un code de sortie 0 : impossible de la distinguer d'un succès.
      '-failfast2',
    ];

    // Repli 100 % Java lorsqu'aucun Graphviz n'est disponible.
    if (!graphvizAvailable) args.push('-Playout=smetana');

    return args;
  }

  /**
   * Normalise la sortie d'erreur de PlantUML.
   * En mode `-pipe`, le moteur émet typiquement :
   *   ERROR
   *   <numéro de ligne>
   *   <message>
   *
   * Le numéro renvoyé est relatif au `@startuml` : il est converti en numéro
   * de ligne du fichier pour que le clic depuis le panneau d'erreurs tombe au
   * bon endroit dans l'éditeur.
   */
  parseErrors(stderr: string, source?: string): PlantUMLError[] {
    const lineOffset = source ? this.findDiagramStartLine(source) : 0;
    const lines = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const errors: PlantUMLError[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (/^error$/i.test(line)) {
        const maybeLineNumber = lines[index + 1];
        const hasLineNumber = maybeLineNumber !== undefined && /^\d+$/.test(maybeLineNumber);
        const detail = (hasLineNumber ? lines[index + 2] : lines[index + 1]) ?? line;
        errors.push({
          message: this.translate(detail),
          line: hasLineNumber ? Number(maybeLineNumber) + lineOffset : undefined,
          raw: detail,
        });
        index += hasLineNumber ? 2 : 1;
        continue;
      }

      const withLine = line.match(/error\s+line\s+(\d+)\s+in\s+file[:\s]*(.*)/i);
      if (withLine) {
        errors.push({
          message: this.translate(withLine[2] || line),
          line: Number(withLine[1]),
          raw: line,
        });
        continue;
      }

      if (/error|exception|syntax/i.test(line)) {
        errors.push({ message: this.translate(line), raw: line });
      }
    }

    // PlantUML termine par un résumé générique : inutile dès qu'une erreur
    // précise a été identifiée.
    const detailed = errors.filter((error) => !GENERIC_ERROR.test(error.raw));
    return detailed.length > 0 ? detailed : errors;
  }

  /** Numéro de ligne (1-based) du `@startuml` dans la source. */
  private findDiagramStartLine(source: string): number {
    const index = source.split('\n').findIndex((line) => /^\s*@start\w+/i.test(line));
    return index >= 0 ? index + 1 : 0;
  }

  private translate(rawMessage: string): string {
    const match = ERROR_TRANSLATIONS.find((entry) => entry.pattern.test(rawMessage));
    if (!match) return rawMessage.trim();
    // On conserve le message d'origine entre parenthèses : c'est souvent la
    // seule information exploitable pour les cas non couverts par la traduction.
    return `${match.message} (${rawMessage.trim()})`;
  }

  /**
   * Profil de sécurité du moteur.
   * - sans dossier d'inclusion : SANDBOX (aucun accès disque ni réseau) ;
   * - avec un projet ouvert : ALLOWLIST limité à ce dossier, ce qui autorise
   *   `!include ./fichier.puml` tout en continuant d'interdire le réseau.
   */
  private buildSecurityArgs(): string[] {
    if (!this.includePath) return ['-DPLANTUML_SECURITY_PROFILE=SANDBOX'];
    return [
      '-DPLANTUML_SECURITY_PROFILE=ALLOWLIST',
      `-Dplantuml.allowlist.path=${this.includePath}`,
      // Nom historique de la propriété, conservé pour les JAR plus anciens.
      `-Dplantuml.whitelist.path=${this.includePath}`,
      `-Dplantuml.include.path=${this.includePath}`,
    ];
  }
}
