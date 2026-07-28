#!/usr/bin/env node
/**
 * Télécharge un JRE Eclipse Temurin par plateforme dans `resources/jre/<plateforme>`.
 *
 * Comme `download-plantuml.js`, c'est un outil de build : l'application
 * packagée n'accède jamais au réseau.
 *
 * Usage :
 *   node scripts/download-jre.js            # plateforme courante
 *   node scripts/download-jre.js win mac linux
 *   JRE_VERSION=21 node scripts/download-jre.js
 *
 * Licence : Temurin est distribué sous GPLv2 with Classpath Exception.
 * Vérifiez les conditions de redistribution avant toute diffusion commerciale.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const JRE_VERSION = process.env.JRE_VERSION || '21';
const RESOURCES = path.resolve(__dirname, '..', 'resources');

const PLATFORMS = {
  win: { os: 'windows', arch: 'x64', archive: 'zip' },
  mac: { os: 'mac', arch: process.arch === 'arm64' ? 'aarch64' : 'x64', archive: 'tar.gz' },
  linux: { os: 'linux', arch: 'x64', archive: 'tar.gz' },
};

function currentPlatformKey() {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function apiUrl(platform) {
  const { os: osName, arch } = PLATFORMS[platform];
  return (
    `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`
  );
}

function download(url, destination, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'plantuml-studio-build' } }, (response) => {
        const { statusCode, headers } = response;

        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          if (redirectsLeft === 0) {
            reject(new Error('Trop de redirections.'));
            return;
          }
          resolve(download(headers.location, destination, redirectsLeft - 1));
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} pour ${url}`));
          return;
        }

        const file = fs.createWriteStream(destination);
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve(destination)));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

/** Extrait l'archive puis remonte le contenu du dossier racine du JRE. */
function extract(archivePath, targetDirectory, archiveType) {
  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.mkdirSync(targetDirectory, { recursive: true });

  if (archiveType === 'zip') {
    if (process.platform === 'win32') {
      execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${targetDirectory}" -Force`,
      ]);
    } else {
      execFileSync('unzip', ['-q', archivePath, '-d', targetDirectory]);
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', targetDirectory]);
  }

  // Les archives Temurin contiennent un dossier racine « jdk-21.0.x+y-jre ».
  const entries = fs.readdirSync(targetDirectory, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nested = path.join(targetDirectory, entries[0].name);
    for (const entry of fs.readdirSync(nested)) {
      fs.renameSync(path.join(nested, entry), path.join(targetDirectory, entry));
    }
    fs.rmdirSync(nested);
  }
}

async function installFor(platform) {
  if (!PLATFORMS[platform]) {
    throw new Error(`Plateforme inconnue : ${platform} (attendu : win, mac ou linux)`);
  }

  const { archive } = PLATFORMS[platform];
  const target = path.join(RESOURCES, 'jre', platform);
  const archivePath = path.join(os.tmpdir(), `temurin-${platform}.${archive}`);

  console.log(`Téléchargement du JRE ${JRE_VERSION} pour ${platform}…`);
  await download(apiUrl(platform), archivePath);

  console.log(`Extraction vers ${target}…`);
  extract(archivePath, target, archive);
  fs.rmSync(archivePath, { force: true });

  const javaBinary =
    platform === 'win'
      ? path.join(target, 'bin', 'java.exe')
      : platform === 'mac'
        ? path.join(target, 'Contents', 'Home', 'bin', 'java')
        : path.join(target, 'bin', 'java');

  if (!fs.existsSync(javaBinary)) {
    throw new Error(`Le binaire java est introuvable après extraction : ${javaBinary}`);
  }

  console.log(`✔ JRE ${platform} installé (${javaBinary})`);
}

async function main() {
  const platforms = process.argv.slice(2);
  const targets = platforms.length > 0 ? platforms : [currentPlatformKey()];

  for (const platform of targets) {
    await installFor(platform);
  }
}

main().catch((error) => {
  console.error(`✘ Échec de l'installation du JRE : ${error.message}`);
  console.error(
    "  L'application fonctionne aussi avec un Java système : le JRE embarqué reste optionnel."
  );
  process.exit(1);
});
