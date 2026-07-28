#!/usr/bin/env node
/**
 * Vérification « 100 % hors ligne ».
 *
 * Analyse statique des sources applicatives à la recherche d'API réseau.
 * Le script sort en code 1 si une occurrence est trouvée : il est destiné à
 * être branché sur la CI, avant le packaging.
 *
 * Les tests et les scripts de build sont exclus : eux ont le droit d'aller
 * chercher plantuml.jar ou un JRE sur le réseau.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRECTORIES = ['src'];
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html']);

/** Motifs interdits dans le code applicatif. */
const FORBIDDEN_PATTERNS = [
  { name: 'fetch()', pattern: /(^|[^.\w])fetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /new\s+WebSocket\b/ },
  { name: 'EventSource', pattern: /new\s+EventSource\b/ },
  { name: 'navigator.sendBeacon', pattern: /navigator\s*\.\s*sendBeacon\b/ },
  { name: 'axios', pattern: /\brequire\(['"]axios['"]\)|from\s+['"]axios['"]/ },
  {
    name: 'module réseau Node',
    pattern: /(require\(|from\s+)['"](node:)?(http|https|net|tls|dgram|dns)['"]/,
  },
  { name: 'import distant', pattern: /(src|href)\s*=\s*['"]https?:\/\/(?!localhost|127\.0\.0\.1)/ },
];

/** Une ligne portant ce marqueur est ignorée (exception documentée). */
const ALLOW_MARKER = 'offline-allow';

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(fullPath, files);
      continue;
    }
    if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function scan() {
  const violations = [];

  for (const directory of SCANNED_DIRECTORIES) {
    const absolute = path.join(ROOT, directory);
    if (!fs.existsSync(absolute)) continue;

    for (const file of walk(absolute)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');

      lines.forEach((line, index) => {
        if (line.includes(ALLOW_MARKER)) return;

        for (const { name, pattern } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: path.relative(ROOT, file),
              line: index + 1,
              name,
              content: line.trim(),
            });
          }
        }
      });
    }
  }

  return violations;
}

const violations = scan();

if (violations.length === 0) {
  console.log('✔ Aucun appel réseau détecté dans les sources applicatives.');
  process.exit(0);
}

console.error(`✘ ${violations.length} appel(s) réseau potentiel(s) détecté(s) :\n`);
for (const violation of violations) {
  console.error(`  ${violation.file}:${violation.line} — ${violation.name}`);
  console.error(`    ${violation.content}`);
}
console.error(
  `\nSi une occurrence est légitime, ajoutez le marqueur « ${ALLOW_MARKER} » en commentaire sur la ligne concernée.`
);
process.exit(1);
