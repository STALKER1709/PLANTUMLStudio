#!/usr/bin/env node
/**
 * Télécharge plantuml.jar dans `resources/`.
 *
 * Ce script est un outil de build : c'est le seul endroit du dépôt, avec
 * `download-jre.js`, où un accès réseau est attendu. L'application packagée
 * n'en dépend plus une fois le JAR embarqué.
 *
 * Usage :
 *   node scripts/download-plantuml.js [version]
 *   PLANTUML_JAR_URL=... node scripts/download-plantuml.js
 *   PLANTUML_JAR_FILE=/chemin/local/plantuml.jar node scripts/download-plantuml.js
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const DEFAULT_VERSION = process.argv[2] || process.env.PLANTUML_VERSION || '1.2025.4';
const RESOURCES = path.resolve(__dirname, '..', 'resources');
const TARGET = path.join(RESOURCES, 'plantuml.jar');

const url =
  process.env.PLANTUML_JAR_URL ||
  `https://github.com/plantuml/plantuml/releases/download/v${DEFAULT_VERSION}/plantuml-${DEFAULT_VERSION}.jar`;

function download(fromUrl, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(fromUrl, { headers: { 'User-Agent': 'plantuml-studio-build' } }, (response) => {
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
          reject(new Error(`HTTP ${statusCode} pour ${fromUrl}`));
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

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function main() {
  fs.mkdirSync(RESOURCES, { recursive: true });

  if (process.env.PLANTUML_JAR_FILE) {
    // Installation hors ligne : le JAR est fourni par un partage local ou une clé USB.
    fs.copyFileSync(process.env.PLANTUML_JAR_FILE, TARGET);
    console.log(`✔ plantuml.jar copié depuis ${process.env.PLANTUML_JAR_FILE}`);
  } else {
    console.log(`Téléchargement de ${url}…`);
    await download(url, TARGET);
    console.log(`✔ plantuml.jar écrit dans ${TARGET}`);
  }

  const size = fs.statSync(TARGET).size;
  if (size < 1_000_000) {
    throw new Error(
      `Le fichier obtenu ne fait que ${size} octets : ce n'est probablement pas plantuml.jar.`
    );
  }

  console.log(`  Taille  : ${(size / 1024 / 1024).toFixed(1)} Mo`);
  console.log(`  SHA-256 : ${sha256(TARGET)}`);
  console.log('  Conservez cette empreinte pour vérifier une réinstallation hors ligne.');
}

main().catch((error) => {
  console.error(`✘ Échec du téléchargement : ${error.message}`);
  console.error(
    "  Repli hors ligne : placez manuellement plantuml.jar dans resources/, ou utilisez PLANTUML_JAR_FILE."
  );
  process.exit(1);
});
