/**
 * Dérivation d'autres diagrammes à partir d'un diagramme de cas d'utilisation.
 *
 * **Ce qui se dérive, et pourquoi.** Un diagramme de cas d'utilisation dit
 * *qui* fait *quoi*, et quels cas s'appellent entre eux. Il ne dit rien du
 * *comment*, ni des données manipulées. Seules les dérivations qui n'ont besoin
 * que du « qui fait quoi » sont donc légitimes ; les autres reviendraient à
 * inventer de l'information.
 *
 * Les diagrammes produits suivent le **modèle d'analyse** de Jacobson, où
 * chaque cas d'utilisation se réalise par trois sortes d'objets : une
 * *frontière* — ce que l'acteur manipule —, un *contrôle* — la logique du cas —
 * et des *entités* — les données. Frontières et contrôles se déduisent
 * directement du diagramme ; les entités, non, et c'est ce qui reste à votre
 * charge.
 *
 * Rien de ce qui est produit ici n'est un diagramme fini : c'est une ossature
 * juste, à compléter.
 */

import { toAlias } from '../assistant/model';

import {
  actorsOf,
  labelOf,
  type UseCaseModel,
} from './parseUseCase';

export interface Derivation {
  /** Identifiant stable, qui sert aussi de nom de fichier. */
  id: string;
  label: string;
  /** Ce que la dérivation apporte, et ce qu'elle laisse à faire. */
  note: string;
  source: string;
}

/** Nom de fichier sûr, dérivé d'un libellé. */
function fileName(prefixe: string, libelle: string): string {
  const base = toAlias(libelle, new Set()).toLowerCase().replace(/_+/g, '-');
  return `${prefixe}-${base}`;
}

function entete(title: string, corps: string[]): string {
  return ['@startuml', `title ${title}`, '', ...corps, '', '@enduml', ''].join('\n');
}

/**
 * Un diagramme de séquence par cas d'utilisation.
 *
 * Les participants se déduisent : les acteurs associés au cas, une frontière
 * par laquelle ils passent, et un contrôle qui porte le cas. Les cas inclus
 * deviennent des `ref`, ce qui préserve la structure d'appel sans la dupliquer.
 */
function sequences(model: UseCaseModel): Derivation[] {
  return model.useCases.map((useCase) => {
    const libelle = useCase.label;
    const acteurs = actorsOf(model, useCase.id);
    const pris = new Set<string>();

    const aliasActeurs = acteurs.map((id) => ({
      id,
      label: labelOf(model, id),
      alias: toAlias(labelOf(model, id), pris),
    }));
    const frontiere = toAlias(`IHM ${libelle}`, pris);
    const controle = toAlias(`Gestion ${libelle}`, pris);

    const declarations = [
      ...aliasActeurs.map((acteur) => `actor "${acteur.label}" as ${acteur.alias}`),
      `boundary "Interface ${libelle}" as ${frontiere}`,
      `control "Gestion ${libelle}" as ${controle}`,
    ];

    const premier = aliasActeurs[0]?.alias;
    const echanges = premier
      ? [
          `${premier} -> ${frontiere} : ${libelle}`,
          `${frontiere} -> ${controle} : traiter()`,
          // Les cas inclus sont exécutés à coup sûr : ils apparaissent en
          // référence, à l'endroit où le contrôle les appelle.
          ...model.includes
            .filter((inclusion) => inclusion.from === useCase.id)
            .map((inclusion) => `ref over ${controle} : ${labelOf(model, inclusion.to)}`),
          `${controle} --> ${frontiere} : résultat`,
          `${frontiere} --> ${premier} : confirmation`,
        ]
      : [];

    const extensions = model.extensions
      .filter((extension) => extension.to === useCase.id)
      .map((extension) => `note over ${controle} : Extension possible : ${labelOf(model, extension.from)}`);

    return {
      id: fileName('sequence', libelle),
      label: `Séquence — ${libelle}`,
      note: "Ossature frontière / contrôle : les échanges avec les entités restent à écrire.",
      source: entete(`${libelle} — séquence`, [...declarations, '', ...echanges, ...extensions]),
    };
  });
}

/** Le même contenu que la séquence, dans la notation de la communication. */
function communications(model: UseCaseModel): Derivation[] {
  return model.useCases.map((useCase) => {
    const libelle = useCase.label;
    const acteurs = actorsOf(model, useCase.id);
    const pris = new Set<string>();

    const aliasActeurs = acteurs.map((id) => ({
      label: labelOf(model, id),
      alias: toAlias(labelOf(model, id), pris),
    }));
    const frontiere = toAlias(`IHM ${libelle}`, pris);
    const controle = toAlias(`Gestion ${libelle}`, pris);

    const declarations = [
      ...aliasActeurs.map((acteur) => `object "${acteur.label}" as ${acteur.alias}`),
      `object "Interface ${libelle}" as ${frontiere}`,
      `object "Gestion ${libelle}" as ${controle}`,
    ];

    const premier = aliasActeurs[0]?.alias;
    const messages = premier
      ? [
          `${premier} --> ${frontiere} : 1 : ${libelle}`,
          `${frontiere} --> ${controle} : 2 : traiter()`,
          ...model.includes
            .filter((inclusion) => inclusion.from === useCase.id)
            .map(
              (inclusion, rang) =>
                `${controle} --> ${controle} : 2.${rang + 1} : ${labelOf(model, inclusion.to)}`
            ),
        ]
      : [];

    return {
      id: fileName('communication', libelle),
      label: `Communication — ${libelle}`,
      note: 'Mêmes échanges que la séquence, vus par les liens entre objets.',
      source: entete(`${libelle} — communication`, [...declarations, '', ...messages]),
    };
  });
}

/**
 * Le diagramme de classes d'analyse.
 *
 * Une frontière par acteur, un contrôle par cas : c'est tout ce que le
 * diagramme de cas d'utilisation contient. Les classes *entité* — celles qui
 * portent les données — n'y figurent nulle part et ne peuvent donc pas être
 * déduites ; le diagramme produit le dit en toutes lettres.
 */
function analysisClasses(model: UseCaseModel): Derivation[] {
  if (model.useCases.length === 0) return [];

  const pris = new Set<string>();
  const aliasActeurs = new Map(
    model.actors.map((acteur) => [acteur.id, toAlias(`IHM ${acteur.label}`, pris)])
  );
  const aliasControles = new Map(
    model.useCases.map((useCase) => [useCase.id, toAlias(`Gestion ${useCase.label}`, pris)])
  );

  const frontieres = model.actors.map(
    (acteur) => `class "Interface ${acteur.label}" as ${aliasActeurs.get(acteur.id)} <<boundary>>`
  );
  const controles = model.useCases.map(
    (useCase) => `class "Gestion ${useCase.label}" as ${aliasControles.get(useCase.id)} <<control>>`
  );

  // Chaque acteur atteint les contrôles des cas auxquels il participe.
  const acces = model.useCases.flatMap((useCase) =>
    actorsOf(model, useCase.id)
      .map((acteurId) => {
        const frontiere = aliasActeurs.get(acteurId);
        const controle = aliasControles.get(useCase.id);
        return frontiere && controle ? `${frontiere} --> ${controle}` : '';
      })
      .filter((ligne) => ligne !== '')
  );

  // Un cas inclus est appelé par le contrôle du cas incluant.
  const appels = model.includes
    .map((inclusion) => {
      const de = aliasControles.get(inclusion.from);
      const vers = aliasControles.get(inclusion.to);
      return de && vers ? `${de} ..> ${vers} : <<include>>` : '';
    })
    .filter((ligne) => ligne !== '');

  const rappel = [
    'note as EntitesAFaire',
    '  Les classes « entité » — celles qui portent les données —',
    '  ne se déduisent pas des cas d\'utilisation : elles viennent',
    '  du domaine. À ajouter ici.',
    'end note',
  ];

  return [
    {
      id: 'classes-analyse',
      label: "Classes d'analyse",
      note: "Frontières et contrôles déduits ; les classes entité restent à identifier.",
      source: entete(`${model.system || 'Système'} — classes d'analyse`, [
        ...frontieres,
        ...controles,
        '',
        ...acces,
        ...appels,
        '',
        ...rappel,
      ]),
    },
  ];
}

/**
 * La vue d'ensemble des interactions.
 *
 * Elle se déduit sans rien inventer : chaque cas devient un fragment, et les
 * relations `<<include>>` et `<<extend>>` en donnent l'enchaînement — les
 * premières inconditionnelles, les secondes sous condition.
 */
function interactionOverview(model: UseCaseModel): Derivation[] {
  if (model.useCases.length === 0) return [];

  // Un cas inclus par un autre est appelé depuis lui : seuls les cas que
  // personne n'inclut ouvrent un enchaînement.
  const inclus = new Set(model.includes.map((inclusion) => inclusion.to));
  const racines = model.useCases.filter((useCase) => !inclus.has(useCase.id));

  const corps = racines.flatMap((useCase) => {
    const inclusions = model.includes
      .filter((inclusion) => inclusion.from === useCase.id)
      .map((inclusion) => `  :ref over "${labelOf(model, inclusion.to)}";`);
    const extensions = model.extensions
      .filter((extension) => extension.to === useCase.id)
      .flatMap((extension) => [
        `  if (${labelOf(model, extension.from)} ?) then (oui)`,
        `    :ref over "${labelOf(model, extension.from)}";`,
        '  endif',
      ]);

    return [`:ref over "${useCase.label}";`, ...inclusions, ...extensions];
  });

  return [
    {
      id: 'vue-ensemble-interactions',
      label: "Vue d'ensemble des interactions",
      note: 'Enchaînement déduit des relations « include » et « extend ».',
      source: entete(`${model.system || 'Système'} — vue d'ensemble`, [
        'start',
        ...corps,
        'stop',
      ]),
    },
  ];
}

/** Toutes les dérivations possibles depuis un diagramme de cas d'utilisation. */
export function deriveAll(model: UseCaseModel): Derivation[] {
  return [
    ...analysisClasses(model),
    ...interactionOverview(model),
    ...sequences(model),
    ...communications(model),
  ];
}

/**
 * Diagrammes qui ne se dérivent pas, et la raison.
 *
 * Les afficher vaut mieux que de les omettre : sans cela, l'absence passerait
 * pour un manque de l'outil, alors qu'elle tient à ce que le diagramme de
 * départ ne contient pas.
 */
export const NON_DERIVABLES: ReadonlyArray<{ label: string; raison: string }> = [
  {
    label: 'Diagramme de classes (conception)',
    raison:
      "les attributs, les méthodes et les associations viennent du domaine, pas des cas d'utilisation.",
  },
  {
    label: 'Diagramme d’états-transitions',
    raison: "il décrit le cycle de vie d'un objet, absent du diagramme de cas d'utilisation.",
  },
  {
    label: 'Diagramme d’activité',
    raison:
      'il détaille le déroulement interne d’un cas ; les cas n’en donnent que le nom.',
  },
  {
    label: 'Composants, déploiement, objets, temps, structure composite, profil',
    raison:
      'ils relèvent de l’architecture ou de l’exécution, sans lien déductible avec les cas d’utilisation.',
  },
];
