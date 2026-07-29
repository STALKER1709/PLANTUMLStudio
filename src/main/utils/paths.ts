import fs from 'node:fs';
import path from 'node:path';

export type PlatformKey = 'win' | 'mac' | 'linux';

/** Nom de dossier utilisé dans `resources/` pour la plateforme courante. */
export function platformKey(platform: NodeJS.Platform = process.platform): PlatformKey {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return 'linux';
}

/**
 * Dossier `resources/`.
 * - en production : `process.resourcesPath` (rempli par electron-builder) ;
 * - en développement : le dossier `resources/` du dépôt.
 *
 * La fonction est volontairement pure (paramètres injectés) pour rester testable
 * sans Electron.
 */
export function resolveResourcesPath(options: {
  isPackaged: boolean;
  packagedResourcesPath?: string;
  projectRoot?: string;
}): string {
  const fromEnv = process.env.PLANTUML_STUDIO_RESOURCES;
  if (fromEnv) return fromEnv;

  if (options.isPackaged && options.packagedResourcesPath) {
    return path.join(options.packagedResourcesPath, 'resources');
  }
  return path.join(options.projectRoot ?? process.cwd(), 'resources');
}

/** Chemin du binaire `java` du JRE embarqué (existant ou non). */
export function embeddedJavaPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const key = platformKey(platform);
  const binary = platform === 'win32' ? 'java.exe' : 'java';
  // Sur macOS, les JRE Temurin sont livrés avec un préfixe Contents/Home.
  const segments =
    key === 'mac'
      ? [resourcesPath, 'jre', key, 'Contents', 'Home', 'bin', binary]
      : [resourcesPath, 'jre', key, 'bin', binary];
  return path.join(...segments);
}

/**
 * Chemin du binaire `java` désigné par `JAVA_HOME`, si la variable est définie.
 *
 * Sous Windows en particulier, Java est très souvent installé sans être ajouté
 * au PATH : `JAVA_HOME` est alors la seule piste exploitable.
 */
export function javaHomePath(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env
): string | null {
  const javaHome = environment.JAVA_HOME?.trim();
  if (!javaHome) return null;

  const binary = platform === 'win32' ? 'java.exe' : 'java';
  return path.join(javaHome.replace(/["']/g, ''), 'bin', binary);
}

/** Chemin du binaire `dot` de Graphviz embarqué (existant ou non). */
export function embeddedDotPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const binary = platform === 'win32' ? 'dot.exe' : 'dot';
  return path.join(resourcesPath, 'graphviz', platformKey(platform), 'bin', binary);
}

export function plantumlJarPath(resourcesPath: string): string {
  return path.join(resourcesPath, 'plantuml.jar');
}

/** Retourne le premier chemin existant, sinon `null`. */
export function firstExisting(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // chemin illisible : on passe au suivant
    }
  }
  return null;
}

/**
 * Recherche un exécutable dans le PATH système, sans dépendre de `which`
 * (absent sur Windows).
 */
export function findInPath(
  executable: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  const rawPath = process.env.PATH ?? '';
  const separator = platform === 'win32' ? ';' : ':';
  const extensions =
    platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];

  for (const directory of rawPath.split(separator).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${executable}${extension.toLowerCase()}`);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        // ignoré
      }
    }
  }
  return null;
}
