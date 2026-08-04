/**
 * L'assistant ne vaut que si ce qu'il écrit se génère.
 *
 * Chaque schéma est donc éprouvé deux fois : sur la forme de la source, et sur
 * son rendu réel par `plantuml.jar` — le seul juge qui compte.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  aliasesOf,
  filledRows,
  listOf,
  quoteLabel,
  toAlias,
  wrap,
} from '../../src/renderer/assistant/model';
import { SCHEMAS, initialValues, schemaById } from '../../src/renderer/assistant/schemas';

const ROOT = path.resolve(__dirname, '../..');
const JAR = path.join(ROOT, 'resources/plantuml.jar');
const CONFIG = path.join(ROOT, 'templates/_formalisme.puml');

/** Génère la source et renvoie l'erreur de PlantUML, ou `null` si tout va bien. */
function erreurDeRendu(source: string): string | null {
  try {
    execFileSync(
      'java',
      ['-jar', JAR, '-tsvg', '-pipe', '-failfast2', '-charset', 'UTF-8', '-config', CONFIG],
      { input: source, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return null;
  } catch (error) {
    const detail = error as { stderr?: Buffer };
    return detail.stderr?.toString('utf-8') || 'échec sans message';
  }
}

describe('Identifiants dérivés des libellés', () => {
  it('remplace accents, espaces et ponctuation', () => {
    expect(toAlias('Client inscrit', new Set())).toBe('Client_inscrit');
    expect(toAlias('Réserver une prestation', new Set())).toBe('Reserver_une_prestation');
    expect(toAlias('total() : Decimal', new Set())).toBe('total_Decimal');
  });

  it('ne produit jamais un identifiant commençant par un chiffre', () => {
    // PlantUML lirait « 2 » comme un nombre, pas comme un nom.
    expect(toAlias('2e étape', new Set())).toMatch(/^[A-Za-z_]/);
  });

  it('reste défini pour un libellé sans aucune lettre', () => {
    expect(toAlias('!!! ???', new Set())).toBe('E');
  });

  it('distingue deux libellés identiques', () => {
    const pris = new Set<string>();
    expect(toAlias('Payer', pris)).toBe('Payer');
    expect(toAlias('Payer', pris)).toBe('Payer_2');
    expect(toAlias('Payer', pris)).toBe('Payer_3');
  });

  it('neutralise les guillemets, qui casseraient la chaîne', () => {
    expect(quoteLabel('un "gros" mot')).toBe('"un  gros  mot"');
    expect(quoteLabel('deux\nlignes')).toBe('"deux lignes"');
  });
});

describe('Assemblage des sources', () => {
  it('n’écrit le titre que s’il y en a un', () => {
    expect(wrap('', 'class A')).not.toContain('title');
    expect(wrap('Mon titre', 'class A')).toContain('title Mon titre');
    // Une ligne vide aère la source sans jamais s'accumuler.
    expect(wrap('', 'class A')).not.toMatch(/\n\n\n/);
  });

  it('découpe un champ multiligne en ignorant les lignes vides', () => {
    expect(listOf('  a\n\n b  \n')).toEqual(['a', 'b']);
    expect(listOf(undefined)).toEqual([]);
  });

  it('ignore les lignes dont un champ requis manque', () => {
    const schema = schemaById('01-diagramme-classes');
    if (!schema) throw new Error('schéma introuvable');

    const retenues = filledRows(schema.sections[0], {
      classes: [{ nom: 'Client' }, { nom: '   ' }, { nom: 'Commande' }],
    });

    expect(retenues.map((row) => row.nom)).toEqual(['Client', 'Commande']);
  });

  it('indexe les identifiants par le libellé saisi', () => {
    const schema = schemaById('08-diagramme-cas-utilisation');
    if (!schema) throw new Error('schéma introuvable');

    const table = aliasesOf(schema.sections[1], { acteurs: [{ nom: 'Client inscrit' }] }, new Set());

    expect(table.get('Client inscrit')).toBe('Client_inscrit');
  });
});

describe('Couverture des 14 diagrammes', () => {
  it('propose un schéma par modèle livré', () => {
    expect(SCHEMAS).toHaveLength(14);
    expect(SCHEMAS.filter((schema) => schema.category === 'structurel')).toHaveLength(7);
    expect(SCHEMAS.filter((schema) => schema.category === 'comportemental')).toHaveLength(7);
  });

  it('donne à chaque schéma des sections et des champs nommés', () => {
    SCHEMAS.forEach((schema) => {
      expect(schema.sections.length, schema.label).toBeGreaterThan(0);
      schema.sections.forEach((section) => {
        expect(section.fields.length, `${schema.label} / ${section.label}`).toBeGreaterThan(0);
        section.fields.forEach((field) => {
          // Un champ « reference » qui pointe une section inexistante
          // afficherait une liste vide, sans que rien ne le signale.
          if (field.kind !== 'reference') return;
          expect(
            schema.sections.some((candidat) => candidat.id === field.references),
            `${schema.label} / ${section.label} / ${field.label}`
          ).toBe(true);
        });
      });
    });
  });

  it('produit une source encadrée, même sans rien saisir', () => {
    SCHEMAS.forEach((schema) => {
      const vide: Record<string, Array<Record<string, string>>> = {};
      schema.sections.forEach((section) => (vide[section.id] = []));
      const source = schema.build('', vide);

      expect(source.startsWith('@startuml'), schema.label).toBe(true);
      expect(source.trimEnd().endsWith('@enduml'), schema.label).toBe(true);
    });
  });
});

describe.skipIf(!fs.existsSync(JAR))('Rendu réel des sources produites', () => {
  it.each(SCHEMAS.map((schema) => ({ label: schema.label, schema })))(
    '$label : la source d’exemple se génère sans erreur',
    ({ schema }) => {
      const source = schema.build(schema.label, initialValues(schema));
      const erreur = erreurDeRendu(source);

      expect(erreur, `source refusée :\n${source}\n${erreur}`).toBeNull();
    }
  );

  it('résiste aux libellés accentués, ponctués et homonymes', () => {
    const schema = schemaById('08-diagramme-cas-utilisation');
    if (!schema) throw new Error('schéma introuvable');

    const source = schema.build('Épreuve', {
      systeme: [{ nom: 'Système « central »' }],
      acteurs: [
        { nom: 'Client inscrit', role: 'principal' },
        { nom: 'Client inscrit', role: 'principal' },
        { nom: 'Service de paiement', role: 'secondaire' },
      ],
      cas: [{ nom: 'Régler (100 %)' }, { nom: 'Régler (100 %)' }],
      associations: [{ acteur: 'Client inscrit', cas: 'Régler (100 %)' }],
      relationsCas: [],
      generalisations: [],
    });

    expect(erreurDeRendu(source), source).toBeNull();
  });

  it('applique les recettes de disposition des cas d’utilisation', () => {
    const schema = schemaById('08-diagramme-cas-utilisation');
    if (!schema) throw new Error('schéma introuvable');

    const source = schema.build('Épreuve', {
      systeme: [{ nom: 'Plateforme' }],
      acteurs: [
        { nom: 'Visiteur', role: 'principal' },
        { nom: 'Client', role: 'principal' },
      ],
      cas: [{ nom: 'Consulter' }],
      associations: [{ acteur: 'Visiteur', cas: 'Consulter' }],
      relationsCas: [],
      generalisations: [{ enfant: 'Client', parent: 'Visiteur' }],
    });

    // Les trois leviers documentés sont écrits par l'assistant.
    expect(source).toContain('left to right direction');
    expect(source).toContain('together {');
    expect(source).toContain('<|-[norank]-');
    expect(erreurDeRendu(source), source).toBeNull();
  });
});
