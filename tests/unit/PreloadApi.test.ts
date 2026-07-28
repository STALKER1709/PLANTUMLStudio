import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../../src/shared/constants';

/**
 * Le preload est exécuté dans un renderer sandboxé : il ne peut pas importer
 * `src/shared/constants.ts` et recopie donc les noms de canaux. Ce test garde
 * les deux listes synchronisées — une divergence casserait l'IPC en silence.
 */
const preloadSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/preload/preload.ts'),
  'utf-8'
);

describe('API du preload', () => {
  it('déclare exactement les canaux définis dans shared/constants', () => {
    for (const [name, channel] of Object.entries(IPC_CHANNELS)) {
      expect(preloadSource, `canal ${name} absent du preload`).toContain(`${name}: '${channel}'`);
    }
  });

  it('n’importe aucun module relatif en dehors des types', () => {
    const valueImports = preloadSource
      .split('\n')
      .filter((line) => /^import\s+(?!type)/.test(line.trim()));

    // Seul `electron` est requérable depuis un preload sandboxé.
    expect(valueImports).toHaveLength(1);
    expect(valueImports[0]).toContain("from 'electron'");
  });

  it('expose l’API sous le nom attendu par le renderer', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('electronAPI'");
  });
});
