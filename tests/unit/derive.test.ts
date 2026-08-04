/**
 * Éprouve la dérivation de bout en bout : lecture d'un diagramme de cas
 * d'utilisation, puis génération réelle de tout ce qui en est tiré.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { schemaById } from '../../src/renderer/assistant/schemas';
import { deriveAll, NON_DERIVABLES } from '../../src/renderer/derive/derivations';
import {
  actorsOf,
  labelOf,
  looksLikeUseCase,
  parseUseCaseDiagram,
  redundantAssociations,
} from '../../src/renderer/derive/parseUseCase';

const ROOT = path.resolve(__dirname, '../..');
const JAR = path.join(ROOT, 'resources/plantuml.jar');
const CONFIG = path.join(ROOT, 'templates/_formalisme.puml');

function erreurDeRendu(source: string): string | null {
  try {
    execFileSync(
      'java',
      ['-jar', JAR, '-tsvg', '-pipe', '-failfast2', '-charset', 'UTF-8', '-config', CONFIG],
      { input: source, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return null;
  } catch (error) {
    return (error as { stderr?: Buffer }).stderr?.toString('utf-8') || 'échec sans message';
  }
}

/** Diagramme écrit à la main, dans les formes usuelles de PlantUML. */
const ECRIT_A_LA_MAIN = `
@startuml
title Plateforme de freelance
left to right direction
actor "Client" as C
actor "Prestataire" as P
actor Administrateur
rectangle "Plateforme" {
  usecase "Publier une mission" as UC1
  usecase "Postuler" as UC2
  usecase "Payer" as UC3
  usecase "S'authentifier" as UC4
  (Modérer les annonces) as UC5
}
C -- UC1
C -- UC3
P -- UC2
Administrateur -- UC5
UC1 ..> UC4 : <<include>>
UC2 ..> UC4 : <<include>>
UC3 ..> UC1 : <<extend>>
@enduml
`;

describe('Lecture d’un diagramme de cas d’utilisation', () => {
  const model = parseUseCaseDiagram(ECRIT_A_LA_MAIN);

  it('reconnaît acteurs et cas, quelle que soit l’écriture', () => {
    expect(model.actors.map((acteur) => acteur.label).sort()).toEqual([
      'Administrateur',
      'Client',
      'Prestataire',
    ]);
    // « (Modérer les annonces) as UC5 » est une déclaration de cas, elle aussi.
    expect(model.useCases).toHaveLength(5);
    expect(labelOf(model, 'UC5')).toBe('Modérer les annonces');
  });

  it('retient le nom du système plutôt que le titre', () => {
    expect(model.system).toBe('Plateforme');
  });

  it('classe les relations selon leur stéréotype', () => {
    expect(model.associations).toHaveLength(4);
    expect(model.includes).toEqual([
      { from: 'UC1', to: 'UC4' },
      { from: 'UC2', to: 'UC4' },
    ]);
    expect(model.extensions).toEqual([{ from: 'UC3', to: 'UC1' }]);
  });

  it('ignore une ligne qu’il ne comprend pas, sans rien casser', () => {
    const bancal = parseUseCaseDiagram(`
@startuml
actor A
usecase "Faire" as U
A -- U
!definelong TRUC(x)
x sur plusieurs lignes
!enddefinelong
skinparam monochrome true
@enduml
`);
    expect(looksLikeUseCase(bancal)).toBe(true);
    expect(bancal.associations).toHaveLength(1);
  });

  it('distingue acteurs principaux et secondaires', () => {
    const avecSecondaire = parseUseCaseDiagram(`
@startuml
actor "Client" as C
rectangle "API de paiement" as API <<actor>>
actor "Chatbot" as BOT
usecase "Payer" as UC1
usecase "Discuter" as UC2
C -- UC1
UC1 -- API
UC2 -- BOT
@enduml
`);

    const cote = (id: string) =>
      avecSecondaire.actors.find((acteur) => acteur.id === id)?.side;

    // Déclaré en rectangle stéréotypé : secondaire sans ambiguïté.
    expect(cote('API')).toBe('secondary');
    // Écrit à droite du trait : secondaire aussi, sans déclaration spéciale.
    expect(cote('BOT')).toBe('secondary');
    // Écrit à gauche : principal.
    expect(cote('C')).toBe('primary');
    // Le rectangle « actor » ne doit pas être pris pour le cadre du système.
    expect(avecSecondaire.system).not.toBe('API de paiement');
  });

  it('ne voit pas un diagramme de cas dans autre chose', () => {
    expect(looksLikeUseCase(parseUseCaseDiagram('@startuml\nclass A\nclass B\nA --> B\n@enduml'))).toBe(
      false
    );
  });
});

describe('Héritage entre acteurs', () => {
  const model = parseUseCaseDiagram(`
@startuml
actor "Visiteur" as V
actor "Client" as C
usecase "Consulter" as UC
V -- UC
C <|-- V
@enduml
`);

  it('rattache au cas les acteurs qui héritent de celui qui y participe', () => {
    // « C <|-- V » : V hérite de C. Le cas est associé à V.
    expect(model.generalizations).toEqual([{ child: 'V', parent: 'C' }]);
    // C participe indirectement, puisque V en hérite… non : c'est l'inverse.
    expect(actorsOf(model, 'UC')).toEqual(['V']);
  });

  it('propage vers les descendants de l’acteur associé', () => {
    const autre = parseUseCaseDiagram(`
@startuml
actor "Visiteur" as V
actor "Client" as C
usecase "Consulter" as UC
V -- UC
V <|-- C
@enduml
`);
    // C hérite de V, donc C participe aussi à « Consulter ».
    expect(actorsOf(autre, 'UC').sort()).toEqual(['C', 'V']);
  });
});

describe('Dérivations', () => {
  const model = parseUseCaseDiagram(ECRIT_A_LA_MAIN);
  const derivations = deriveAll(model);

  it('produit une séquence et une communication par cas, plus deux vues d’ensemble', () => {
    // 5 cas × 2 + classes d'analyse + vue d'ensemble.
    expect(derivations).toHaveLength(12);
    expect(derivations.filter((d) => d.id.startsWith('sequence-'))).toHaveLength(5);
    expect(derivations.filter((d) => d.id.startsWith('communication-'))).toHaveLength(5);
    expect(derivations.some((d) => d.id === 'classes-analyse')).toBe(true);
    expect(derivations.some((d) => d.id === 'vue-ensemble-interactions')).toBe(true);
  });

  it('donne à chaque dérivation un identifiant de fichier utilisable', () => {
    derivations.forEach((derivation) => {
      expect(derivation.id, derivation.label).toMatch(/^[a-z0-9-]+$/);
    });
    expect(new Set(derivations.map((d) => d.id)).size).toBe(derivations.length);
  });

  it('fait figurer l’acteur du cas dans sa séquence', () => {
    const postuler = derivations.find((d) => d.label === 'Séquence — Postuler');
    expect(postuler?.source).toContain('actor "Prestataire"');
    // Et l'inclusion apparaît en référence, non recopiée.
    expect(postuler?.source).toContain("ref over");
    expect(postuler?.source).toContain("S'authentifier");
  });

  it('dit explicitement ce qui reste à faire dans les classes d’analyse', () => {
    const classes = derivations.find((d) => d.id === 'classes-analyse');
    expect(classes?.source).toContain('<<boundary>>');
    expect(classes?.source).toContain('<<control>>');
    // Les entités ne se déduisent pas : le diagramme le dit.
    expect(classes?.source).toContain('entité');
  });

  it('n’enchaîne pas un cas qui est inclus par un autre', () => {
    const vue = derivations.find((d) => d.id === 'vue-ensemble-interactions');
    // « S'authentifier » est inclus : il n'ouvre pas d'enchaînement à lui seul.
    const ouvertures = (vue?.source.match(/^:ref over/gm) ?? []).length;
    expect(ouvertures).toBe(4);
  });

  it('énonce ce qui ne se dérive pas, et pourquoi', () => {
    expect(NON_DERIVABLES.length).toBeGreaterThan(0);
    NON_DERIVABLES.forEach((entree) => {
      expect(entree.raison.length, entree.label).toBeGreaterThan(20);
    });
  });

  it('ne produit rien à partir d’un diagramme vide', () => {
    expect(deriveAll(parseUseCaseDiagram('@startuml\n@enduml'))).toHaveLength(0);
  });
});

describe.skipIf(!fs.existsSync(JAR))('Rendu réel des dérivations', () => {
  const model = parseUseCaseDiagram(ECRIT_A_LA_MAIN);

  it.each(deriveAll(model).map((derivation) => ({ label: derivation.label, derivation })))(
    '$label se génère sans erreur',
    ({ derivation }) => {
      expect(erreurDeRendu(derivation.source), derivation.source).toBeNull();
    }
  );

  it('dérive aussi ce que produit l’assistant', () => {
    const schema = schemaById('08-diagramme-cas-utilisation');
    if (!schema) throw new Error('schéma introuvable');

    // La sortie de l'assistant doit être relue sans perte : les deux moitiés
    // de la chaîne doivent s'emboîter.
    const source = schema.build('Réservation', {
      systeme: [{ nom: 'Plateforme de réservation' }],
      acteurs: [
        {
          nom: 'Visiteur',
          role: 'principal',
          herite: '',
          cas: 'Consulter le catalogue',
        },
        {
          nom: 'Client inscrit',
          role: 'principal',
          herite: 'Visiteur',
          cas: 'Réserver une prestation',
        },
      ],
      casInternes: [],
      relationsCas: [
        { source: 'Réserver une prestation', type: 'include', cible: 'Consulter le catalogue' },
      ],
    });

    const relu = parseUseCaseDiagram(source);
    expect(relu.actors).toHaveLength(2);
    expect(relu.useCases).toHaveLength(2);
    expect(relu.associations).toHaveLength(2);
    expect(relu.includes).toHaveLength(1);
    expect(relu.generalizations).toHaveLength(1);

    deriveAll(relu).forEach((derivation) => {
      expect(erreurDeRendu(derivation.source), `${derivation.label}\n${derivation.source}`).toBeNull();
    });
  });
});

describe('Flèches rendues redondantes par un héritage', () => {
  it('repère la flèche que la généralisation donne déjà', () => {
    const model = parseUseCaseDiagram(`
@startuml
actor "Visiteur" as V
actor "Client" as C
usecase "Consulter" as UC
V -- UC
C -- UC
V <|-- C
@enduml
`);

    const redondances = redundantAssociations(model);

    expect(redondances).toHaveLength(1);
    expect(redondances[0].actor).toBe('C');
    expect(redondances[0].ancestor).toBe('V');
    expect(redondances[0].useCase).toBe('UC');
    // La ligne est celle de la flèche fautive — « C -- UC », septième ligne
    // de la source ci-dessus — pour la rendre cliquable dans l'éditeur.
    expect(redondances[0].line).toBe(7);
  });

  it('remonte au-delà du parent direct', () => {
    const model = parseUseCaseDiagram(`
@startuml
actor V
actor C
actor P
usecase "Consulter" as UC
V -- UC
P -- UC
V <|-- C
C <|-- P
@enduml
`);

    // P hérite de C qui hérite de V : la flèche de P est redondante.
    expect(redundantAssociations(model)).toHaveLength(1);
    expect(redundantAssociations(model)[0].ancestor).toBe('V');
  });

  it('ne signale rien entre acteurs sans lien d’héritage', () => {
    const model = parseUseCaseDiagram(`
@startuml
actor Client
actor Agent
usecase "Consulter" as UC
Client -- UC
Agent -- UC
@enduml
`);

    // Deux acteurs indépendants peuvent partager un cas : c'est licite.
    expect(redundantAssociations(model)).toEqual([]);
  });

  it('ne boucle pas sur un héritage circulaire', () => {
    const model = parseUseCaseDiagram(`
@startuml
actor A
actor B
usecase "Faire" as UC
A -- UC
B -- UC
A <|-- B
B <|-- A
@enduml
`);

    // La source est incohérente ; la détection doit rendre la main.
    expect(redundantAssociations(model).length).toBeGreaterThan(0);
  });

  it('ne signale rien sur ce que l’assistant produit', () => {
    const schema = schemaById('08-diagramme-cas-utilisation');
    if (!schema) throw new Error('schéma introuvable');

    // L'utilisateur répète le cas hérité ; l'assistant doit l'avoir retiré,
    // donc la relecture ne doit plus rien trouver.
    const source = schema.build('Épreuve', {
      systeme: [{ nom: 'Plateforme' }],
      acteurs: [
        { nom: 'Visiteur', role: 'principal', herite: '', cas: 'Consulter' },
        { nom: 'Client', role: 'principal', herite: 'Visiteur', cas: 'Consulter\nRéserver' },
      ],
      casInternes: [],
      relationsCas: [],
    });

    expect(redundantAssociations(parseUseCaseDiagram(source))).toEqual([]);
  });
});
