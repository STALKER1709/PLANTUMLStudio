/**
 * Schémas de l'assistant : les 7 diagrammes comportementaux.
 *
 * Deux d'entre eux demandent un traitement particulier. Le diagramme de cas
 * d'utilisation reprend les recettes de disposition documentées — `left to
 * right direction`, `together`, `[norank]` — que l'assistant écrit à votre
 * place. Le diagramme d'activité est une suite ordonnée, et non un ensemble de
 * déclarations : ses sections sont donc des étapes numérotées.
 */

import {
  aliasesOf,
  filledRows,
  listOf,
  toAlias,
  joinLines,
  quoteLabel,
  wrap,
  type AssistantSchema,
  type Row,
} from './model';

/**
 * Ancêtres d'un acteur, du plus proche au plus lointain.
 *
 * La garde contre les cycles n'est pas théorique : rien n'empêche de saisir
 * « A hérite de B » et « B hérite de A » dans le formulaire.
 */
/**
 * Commentaire qui explique une flèche non écrite.
 *
 * Une flèche absente sans explication se relit comme un oubli, et se réécrit à
 * l'identique six mois plus tard. Le texte suit la langue de l'interface : il
 * s'adresse au lecteur, pas au moteur.
 */
function commentaireHeritage(
  acteur: string,
  ancetre: string,
  cas: string[],
  language: 'fr' | 'en'
): string {
  return language === 'en'
    ? `' ${acteur} inherits from ${ancetre}: ${cas.join(', ')} — already carried by the ancestor.`
    : `' ${acteur} hérite de ${ancetre} : ${cas.join(', ')} — déjà porté(s) par l'ancêtre.`;
}

function ancetres(acteur: string, parent: ReadonlyMap<string, string>): string[] {
  const chaine: string[] = [];
  const vus = new Set<string>([acteur]);
  let courant = parent.get(acteur);

  while (courant !== undefined && !vus.has(courant)) {
    chaine.push(courant);
    vus.add(courant);
    courant = parent.get(courant);
  }

  return chaine;
}

const casUtilisation: AssistantSchema = {
  id: '08-diagramme-cas-utilisation',
  label: "Diagramme de cas d'utilisation",
  category: 'comportemental',
  sections: [
    {
      id: 'systeme',
      label: 'Système',
      hint: 'Le cadre qui délimite le périmètre étudié.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Plateforme de réservation' },
      ],
      sample: [{ nom: 'Plateforme de réservation' }],
    },
    {
      id: 'acteurs',
      label: 'Acteurs et leurs cas d’utilisation',
      hint: "Un acteur par ligne, avec tout ce qu'il fait dans le système — un cas par ligne. Ce qu'il hérite n'a pas à être répété : la généralisation le lui donne déjà.",
      fields: [
        { name: 'nom', label: 'Acteur', kind: 'text', required: true, placeholder: 'Client inscrit' },
        {
          name: 'role',
          label: 'Rôle',
          kind: 'choice',
          options: [
            { value: 'principal', label: 'Principal' },
            { value: 'secondaire', label: 'Secondaire (service externe)' },
          ],
        },
        { name: 'herite', label: 'Hérite de', kind: 'reference', references: 'acteurs' },
        {
          name: 'cas',
          label: "Cas d'utilisation",
          kind: 'multiline',
          placeholder: 'Réserver une prestation\nAnnuler une réservation',
        },
      ],
      sample: [
        {
          nom: 'Visiteur',
          role: 'principal',
          herite: '',
          cas: 'Consulter le catalogue\nCréer un compte',
        },
        {
          nom: 'Client inscrit',
          role: 'principal',
          herite: 'Visiteur',
          cas: 'Réserver une prestation\nAnnuler une réservation',
        },
        {
          nom: 'Service de paiement',
          role: 'secondaire',
          herite: '',
          cas: 'Payer une réservation',
        },
      ],
    },
    {
      id: 'casInternes',
      label: 'Cas sans acteur direct',
      hint: "Ceux qu'aucun acteur ne déclenche lui-même : ils ne sont atteints que par « inclut » ou « étend ».",
      fields: [
        { name: 'nom', label: 'Libellé', kind: 'text', required: true, placeholder: "S'authentifier" },
      ],
      sample: [{ nom: "S'authentifier" }],
    },
    {
      id: 'relationsCas',
      label: 'Relations entre cas',
      fields: [
        {
          name: 'source',
          label: 'Cas',
          kind: 'reference',
          references: ['acteurs.cas', 'casInternes'],
          required: true,
        },
        {
          name: 'type',
          label: 'Relation',
          kind: 'choice',
          options: [
            { value: 'include', label: 'inclut (toujours)' },
            { value: 'extend', label: 'étend (parfois)' },
          ],
          required: true,
        },
        {
          name: 'cible',
          label: 'Cas',
          kind: 'reference',
          references: ['acteurs.cas', 'casInternes'],
          required: true,
        },
      ],
      sample: [
        { source: 'Réserver une prestation', type: 'include', cible: "S'authentifier" },
      ],
    },
  ],
  build(title, values, language = 'fr') {
    const acteurs = filledRows(this.sections[1], values);

    // Un cas cité par plusieurs acteurs reste UN cas : la table est indexée
    // par libellé, et l'ordre de première apparition fixe celui du diagramme.
    const pris = new Set<string>();
    const aliasActeurs = new Map<string, string>();
    acteurs.forEach((row) => {
      const nom = row.nom.trim();
      if (!aliasActeurs.has(nom)) aliasActeurs.set(nom, toAlias(nom, pris));
    });

    const aliasCas = new Map<string, string>();
    const declarerCas = (libelle: string) => {
      if (libelle !== '' && !aliasCas.has(libelle)) aliasCas.set(libelle, toAlias(libelle, pris));
    };
    acteurs.forEach((row) => listOf(row.cas).forEach(declarerCas));
    filledRows(this.sections[2], values).forEach((row) => declarerCas(row.nom.trim()));

    const parent = new Map<string, string>();
    acteurs.forEach((row) => {
      const herite = (row.herite ?? '').trim();
      if (herite !== '' && herite !== row.nom.trim() && aliasActeurs.has(herite)) {
        parent.set(row.nom.trim(), herite);
      }
    });

    /** Cas cités par un acteur, indexés par acteur. */
    const casParActeur = new Map<string, string[]>();
    acteurs.forEach((row) => {
      const nom = row.nom.trim();
      casParActeur.set(nom, [...(casParActeur.get(nom) ?? []), ...listOf(row.cas)]);
    });

    const principaux = acteurs.filter((row) => (row.role || 'principal') === 'principal');
    const secondaires = acteurs.filter((row) => row.role === 'secondaire');

    const declarer = (row: Row) =>
      `actor ${quoteLabel(row.nom)} as ${aliasActeurs.get(row.nom.trim())}`;
    // Un acteur secondaire est un système, pas une personne : la notation UML
    // le dessine en rectangle stéréotypé plutôt qu'en bonhomme filaire.
    const declarerSecondaire = (row: Row) =>
      `rectangle ${quoteLabel(row.nom)} as ${aliasActeurs.get(row.nom.trim())} <<actor>>`;

    // « together » maintient les acteurs principaux sur un même axe vertical ;
    // sans lui, ils se dispersent au gré de leurs liens.
    const blocPrincipaux =
      principaux.length > 1
        ? ['together {', ...principaux.map((row) => `  ${declarer(row)}`), '}']
        : principaux.map(declarer);

    const systeme = filledRows(this.sections[0], values)[0];
    const blocSysteme =
      aliasCas.size === 0
        ? []
        : [
            `rectangle ${quoteLabel(systeme?.nom ?? 'Système')} {`,
            ...Array.from(aliasCas.entries()).map(
              ([libelle, alias]) => `  usecase ${quoteLabel(libelle)} as ${alias}`
            ),
            '}',
          ];

    // Le sens d'écriture décide du côté : sous « left to right direction »,
    // Graphviz place la cible d'une association à droite de sa source.
    const secondaire = new Set(secondaires.map((row) => row.nom.trim()));
    const associations: string[] = [];
    const heritages: string[] = [];

    acteurs.forEach((row) => {
      const nom = row.nom.trim();
      const acteur = aliasActeurs.get(nom);
      if (!acteur) return;

      // Un cas déjà porté par un ancêtre ne se redessine pas : la
      // généralisation le donne à l'héritier, et une seconde flèche vers le
      // même cas serait une faute de notation.
      const portesParUnAncetre = new Set(
        ancetres(nom, parent).flatMap((ancetre) => casParActeur.get(ancetre) ?? [])
      );
      const herites: string[] = [];

      listOf(row.cas).forEach((libelle) => {
        const cible = aliasCas.get(libelle);
        if (!cible) return;
        if (portesParUnAncetre.has(libelle)) {
          herites.push(libelle);
          return;
        }
        associations.push(
          secondaire.has(nom) ? `${cible} -- ${acteur}` : `${acteur} -- ${cible}`
        );
      });

      if (herites.length > 0) {
        heritages.push(
          commentaireHeritage(nom, parent.get(nom) as string, herites, language)
        );
      }
    });

    const relations = filledRows(this.sections[3], values)
      .map((row) => {
        const de = aliasCas.get(row.source.trim());
        const vers = aliasCas.get(row.cible.trim());
        return de && vers ? `${de} ..> ${vers} : <<${row.type}>>` : '';
      })
      .filter((ligne) => ligne !== '');

    // « [norank] » dessine la généralisation sans lui laisser imposer un rang :
    // sans cela, l'acteur parent sort de la colonne.
    const generalisations = Array.from(parent.entries())
      .map(([enfant, ancetre]) => {
        const alias = aliasActeurs.get(enfant);
        const aliasParent = aliasActeurs.get(ancetre);
        return alias && aliasParent ? `${aliasParent} <|-[norank]- ${alias}` : '';
      })
      .filter((ligne) => ligne !== '');

    return wrap(
      title,
      joinLines(
        'left to right direction',
        blocPrincipaux,
        secondaires.map(declarerSecondaire),
        blocSysteme,
        associations,
        relations,
        generalisations,
        heritages
      )
    );
  },
};

const sequence: AssistantSchema = {
  id: '09-diagramme-sequence',
  label: 'Diagramme de séquence',
  category: 'comportemental',
  sections: [
    {
      id: 'participants',
      label: 'Participants',
      hint: 'L’ordre de déclaration fixe l’ordre des colonnes.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Interface web' },
        {
          name: 'nature',
          label: 'Nature',
          kind: 'choice',
          options: [
            { value: 'participant', label: 'Participant' },
            { value: 'actor', label: 'Acteur' },
            { value: 'boundary', label: 'Frontière' },
            { value: 'control', label: 'Contrôle' },
            { value: 'entity', label: 'Entité' },
            { value: 'database', label: 'Base de données' },
          ],
        },
      ],
      sample: [
        { nom: 'Client', nature: 'actor' },
        { nom: 'Interface web', nature: 'boundary' },
      ],
    },
    {
      id: 'messages',
      label: 'Messages',
      hint: 'Dans l’ordre chronologique, de haut en bas.',
      fields: [
        { name: 'de', label: 'De', kind: 'reference', references: 'participants', required: true },
        { name: 'vers', label: 'Vers', kind: 'reference', references: 'participants', required: true },
        { name: 'libelle', label: 'Message', kind: 'text', required: true, placeholder: 'réserver()' },
        {
          name: 'nature',
          label: 'Nature',
          kind: 'choice',
          options: [
            { value: '->', label: 'Synchrone' },
            { value: '->>', label: 'Asynchrone' },
            { value: '-->', label: 'Retour' },
          ],
        },
      ],
      sample: [
        { de: 'Client', vers: 'Interface web', libelle: 'réserver()', nature: '->' },
        { de: 'Interface web', vers: 'Client', libelle: 'confirmation', nature: '-->' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);

    const declarations = filledRows(this.sections[0], values).map(
      (row) => `${row.nature || 'participant'} ${quoteLabel(row.nom)} as ${alias.get(row.nom.trim())}`
    );

    const messages = filledRows(this.sections[1], values)
      .map((row) => {
        const de = alias.get(row.de.trim());
        const vers = alias.get(row.vers.trim());
        if (!de || !vers) return '';
        return `${de} ${row.nature || '->'} ${vers} : ${row.libelle.trim()}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, messages));
  },
};

const communication: AssistantSchema = {
  id: '10-diagramme-communication',
  label: 'Diagramme de communication',
  category: 'comportemental',
  sections: [
    {
      id: 'objets',
      label: 'Objets',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Interface web' },
      ],
      sample: [{ nom: 'Client' }, { nom: 'Interface web' }],
    },
    {
      id: 'messages',
      label: 'Messages',
      hint: 'Le numéro donne l’ordre : 1, 1.1, 2…',
      fields: [
        { name: 'numero', label: 'N°', kind: 'text', required: true, placeholder: '1' },
        { name: 'de', label: 'De', kind: 'reference', references: 'objets', required: true },
        { name: 'vers', label: 'Vers', kind: 'reference', references: 'objets', required: true },
        { name: 'libelle', label: 'Message', kind: 'text', required: true, placeholder: 'réserver()' },
      ],
      sample: [
        { numero: '1', de: 'Client', vers: 'Interface web', libelle: 'réserver()' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);

    const declarations = filledRows(this.sections[0], values).map(
      (row) => `object ${quoteLabel(row.nom)} as ${alias.get(row.nom.trim())}`
    );

    const messages = filledRows(this.sections[1], values)
      .map((row) => {
        const de = alias.get(row.de.trim());
        const vers = alias.get(row.vers.trim());
        if (!de || !vers) return '';
        return `${de} --> ${vers} : ${row.numero.trim()} : ${row.libelle.trim()}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, messages));
  },
};

const activite: AssistantSchema = {
  id: '11-diagramme-activite',
  label: "Diagramme d'activité",
  category: 'comportemental',
  sections: [
    {
      id: 'etapes',
      label: 'Étapes',
      hint: 'Dans l’ordre d’exécution. Une décision ouvre deux branches, décrites dans les deux dernières colonnes.',
      fields: [
        {
          name: 'nature',
          label: 'Nature',
          kind: 'choice',
          options: [
            { value: 'action', label: 'Action' },
            { value: 'decision', label: 'Décision' },
            { value: 'parallele', label: 'Actions parallèles' },
          ],
          required: true,
        },
        { name: 'libelle', label: 'Libellé', kind: 'text', required: true, placeholder: 'Vérifier la disponibilité' },
        { name: 'branche1', label: 'Si oui / branche 1', kind: 'text', placeholder: 'Confirmer' },
        { name: 'branche2', label: 'Si non / branche 2', kind: 'text', placeholder: 'Refuser' },
        { name: 'couloir', label: 'Couloir', kind: 'text', placeholder: 'Service commercial' },
      ],
      sample: [
        { nature: 'action', libelle: 'Recevoir la demande', branche1: '', branche2: '', couloir: '' },
        {
          nature: 'decision',
          libelle: 'Disponible ?',
          branche1: 'Confirmer la réservation',
          branche2: 'Proposer une alternative',
          couloir: '',
        },
      ],
    },
  ],
  build(title, values) {
    const lignes: string[] = ['start'];
    let couloirCourant = '';

    filledRows(this.sections[0], values).forEach((row) => {
      const couloir = (row.couloir ?? '').trim();
      // Une partition ouverte reste active jusqu'à ce qu'une autre la remplace.
      if (couloir !== couloirCourant) {
        if (couloirCourant !== '') lignes.push('}');
        if (couloir !== '') lignes.push(`partition ${quoteLabel(couloir)} {`);
        couloirCourant = couloir;
      }

      const marge = couloirCourant === '' ? '' : '  ';
      const libelle = row.libelle.trim();

      if (row.nature === 'decision') {
        lignes.push(
          `${marge}if (${libelle}) then (oui)`,
          `${marge}  :${(row.branche1 ?? '').trim() || 'poursuivre'};`,
          `${marge}else (non)`,
          `${marge}  :${(row.branche2 ?? '').trim() || 'abandonner'};`,
          `${marge}endif`
        );
        return;
      }

      if (row.nature === 'parallele') {
        lignes.push(
          `${marge}fork`,
          `${marge}  :${(row.branche1 ?? '').trim() || libelle};`,
          `${marge}fork again`,
          `${marge}  :${(row.branche2 ?? '').trim() || libelle};`,
          `${marge}end fork`
        );
        return;
      }

      lignes.push(`${marge}:${libelle};`);
    });

    if (couloirCourant !== '') lignes.push('}');
    lignes.push('stop');

    return wrap(title, lignes.join('\n'));
  },
};

const etats: AssistantSchema = {
  id: '12-diagramme-etats-transitions',
  label: 'Diagramme d’états-transitions',
  category: 'comportemental',
  sections: [
    {
      id: 'etats',
      label: 'États',
      hint: 'Le premier état déclaré est atteint depuis l’état initial.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'En attente' },
        {
          name: 'nature',
          label: 'Nature',
          kind: 'choice',
          options: [
            { value: 'normal', label: 'État' },
            { value: 'initial', label: 'Premier état' },
            { value: 'final', label: 'État final' },
          ],
        },
      ],
      sample: [
        { nom: 'En attente', nature: 'initial' },
        { nom: 'Confirmée', nature: 'normal' },
      ],
    },
    {
      id: 'transitions',
      label: 'Transitions',
      fields: [
        { name: 'source', label: 'De', kind: 'reference', references: 'etats', required: true },
        { name: 'cible', label: 'Vers', kind: 'reference', references: 'etats', required: true },
        { name: 'declencheur', label: 'Déclencheur', kind: 'text', placeholder: 'confirmer()' },
        { name: 'garde', label: 'Condition', kind: 'text', placeholder: 'paiement reçu' },
      ],
      sample: [
        { source: 'En attente', cible: 'Confirmée', declencheur: 'confirmer()', garde: '' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);
    const lignesEtats = filledRows(this.sections[0], values);

    const declarations = lignesEtats.map(
      (row) => `state ${quoteLabel(row.nom)} as ${alias.get(row.nom.trim())}`
    );

    const premier =
      lignesEtats.find((row) => row.nature === 'initial') ??
      lignesEtats.find((row) => row.nature !== 'final');
    const entree = premier ? [`[*] --> ${alias.get(premier.nom.trim())}`] : [];
    const sorties = lignesEtats
      .filter((row) => row.nature === 'final')
      .map((row) => `${alias.get(row.nom.trim())} --> [*]`);

    const transitions = filledRows(this.sections[1], values)
      .map((row) => {
        const de = alias.get(row.source.trim());
        const vers = alias.get(row.cible.trim());
        if (!de || !vers) return '';
        const declencheur = (row.declencheur ?? '').trim();
        const garde = (row.garde ?? '').trim();
        const etiquette = [declencheur, garde === '' ? '' : `[${garde}]`]
          .filter((partie) => partie !== '')
          .join(' ');
        return `${de} --> ${vers}${etiquette === '' ? '' : ` : ${etiquette}`}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, entree, transitions, sorties));
  },
};

const temps: AssistantSchema = {
  id: '13-diagramme-temps',
  label: 'Diagramme de temps',
  category: 'comportemental',
  sections: [
    {
      id: 'lignes',
      label: 'Lignes de vie',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Réservation' },
        {
          name: 'nature',
          label: 'Représentation',
          kind: 'choice',
          options: [
            { value: 'robust', label: 'États nommés' },
            { value: 'concise', label: 'Ligne compacte' },
          ],
        },
      ],
      sample: [{ nom: 'Réservation', nature: 'robust' }],
    },
    {
      id: 'moments',
      label: 'Changements d’état',
      hint: 'L’instant est un nombre : 0, 100, 200…',
      fields: [
        { name: 'ligne', label: 'Ligne de vie', kind: 'reference', references: 'lignes', required: true },
        { name: 'instant', label: 'Instant', kind: 'text', required: true, placeholder: '0' },
        { name: 'etat', label: 'État', kind: 'text', required: true, placeholder: 'En attente' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);

    const declarations = filledRows(this.sections[0], values).map(
      (row) => `${row.nature || 'robust'} ${quoteLabel(row.nom)} as ${alias.get(row.nom.trim())}`
    );

    // Les changements sont groupés par instant : PlantUML lit « @instant » puis
    // les états de chaque ligne de vie à cet instant.
    const parInstant = new Map<string, string[]>();
    filledRows(this.sections[1], values).forEach((row) => {
      const cible = alias.get(row.ligne.trim());
      if (!cible) return;
      const instant = row.instant.trim();
      parInstant.set(instant, [
        ...(parInstant.get(instant) ?? []),
        `${cible} is ${quoteLabel(row.etat)}`,
      ]);
    });

    const moments = Array.from(parInstant.entries())
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([instant, etats]) => [`@${instant}`, ...etats]);

    return wrap(title, joinLines(declarations, moments));
  },
};

const vueEnsemble: AssistantSchema = {
  id: '14-diagramme-vue-ensemble-interactions',
  label: "Vue d'ensemble des interactions",
  category: 'comportemental',
  sections: [
    {
      id: 'fragments',
      label: 'Fragments',
      hint: 'Chaque fragment renvoie à un diagramme de séquence existant.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Authentifier' },
      ],
      sample: [{ nom: 'Authentifier' }, { nom: 'Réserver' }],
    },
    {
      id: 'enchainement',
      label: 'Enchaînement',
      hint: 'Dans l’ordre. Une condition ouvre une alternative.',
      fields: [
        { name: 'fragment', label: 'Fragment', kind: 'reference', references: 'fragments', required: true },
        { name: 'condition', label: 'Condition', kind: 'text', placeholder: 'authentifié' },
      ],
    },
  ],
  build(title, values) {
    const lignes: string[] = ['start'];

    filledRows(this.sections[1], values).forEach((row) => {
      const condition = (row.condition ?? '').trim();
      const appel = `  :ref over ${quoteLabel(row.fragment.trim())};`;
      if (condition === '') {
        lignes.push(appel.trimStart());
        return;
      }
      lignes.push(`if (${condition}) then (oui)`, appel, 'endif');
    });

    lignes.push('stop');
    return wrap(title, lignes.join('\n'));
  },
};

export const SCHEMAS_COMPORTEMENTAUX: ReadonlyArray<AssistantSchema> = [
  casUtilisation,
  sequence,
  communication,
  activite,
  etats,
  temps,
  vueEnsemble,
];
