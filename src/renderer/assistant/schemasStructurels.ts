/**
 * Schémas de l'assistant : les 7 diagrammes structurels.
 *
 * Chaque schéma décrit les sections à remplir puis assemble la source. Aucun
 * `skinparam` n'y figure : le formalisme commun est appliqué au rendu par
 * l'option `-config`, et l'alourdir ici le ferait apparaître deux fois.
 */

import {
  aliasesOf,
  filledRows,
  joinLines,
  listOf,
  quoteLabel,
  wrap,
  type AssistantSchema,
  type AssistantSection,
} from './model';

/** Relations de classe, dans la notation de PlantUML. */
const LIENS_CLASSE = [
  { value: '-->', label: 'Association' },
  { value: '<|--', label: 'Héritage (la cible hérite de la source)' },
  { value: '*--', label: 'Composition' },
  { value: 'o--', label: 'Agrégation' },
  { value: '..>', label: 'Dépendance' },
  { value: '..|>', label: 'Réalisation' },
] as const;

function sectionRelations(
  sectionCible: string,
  options: ReadonlyArray<{ value: string; label: string }> = LIENS_CLASSE,
  extras: AssistantSection['fields'] = []
): AssistantSection {
  return {
    id: 'relations',
    label: 'Relations',
    hint: 'Chaque ligne relie deux éléments déclarés au-dessus.',
    fields: [
      { name: 'source', label: 'De', kind: 'reference', references: sectionCible, required: true },
      { name: 'type', label: 'Type', kind: 'choice', options, required: true },
      { name: 'cible', label: 'Vers', kind: 'reference', references: sectionCible, required: true },
      ...extras,
    ],
  };
}

/** Corps d'une classe : attributs puis méthodes, séparés d'un trait. */
function corpsDeClasse(attributs: string[], methodes: string[]): string[] {
  if (attributs.length === 0 && methodes.length === 0) return [];
  return [
    ...attributs.map((ligne) => `  ${ligne}`),
    ...(attributs.length > 0 && methodes.length > 0 ? ['  --'] : []),
    ...methodes.map((ligne) => `  ${ligne}`),
  ];
}

const classes: AssistantSchema = {
  id: '01-diagramme-classes',
  label: 'Diagramme de classes',
  category: 'structurel',
  sections: [
    {
      id: 'classes',
      label: 'Classes',
      hint: 'Une par ligne. Préfixez les membres de + - # pour la visibilité.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Commande' },
        {
          name: 'nature',
          label: 'Nature',
          kind: 'choice',
          options: [
            { value: 'class', label: 'Classe' },
            { value: 'abstract class', label: 'Classe abstraite' },
            { value: 'interface', label: 'Interface' },
            { value: 'enum', label: 'Énumération' },
          ],
        },
        {
          name: 'attributs',
          label: 'Attributs',
          kind: 'multiline',
          placeholder: '-numero : String\n-date : LocalDate',
        },
        {
          name: 'methodes',
          label: 'Méthodes',
          kind: 'multiline',
          placeholder: '+total() : Decimal',
        },
      ],
      sample: [
        { nom: 'Client', nature: 'class', attributs: '-nom : String', methodes: '' },
        { nom: 'Commande', nature: 'class', attributs: '-numero : String', methodes: '+total() : Decimal' },
      ],
    },
    {
      ...sectionRelations('classes', LIENS_CLASSE, [
        { name: 'cardinaliteSource', label: 'Cardinalité de départ', kind: 'text', placeholder: '1' },
        { name: 'cardinaliteCible', label: "Cardinalité d'arrivée", kind: 'text', placeholder: '0..*' },
        { name: 'libelle', label: 'Libellé', kind: 'text', placeholder: 'passe' },
      ]),
      sample: [
        {
          source: 'Client',
          type: '-->',
          cible: 'Commande',
          cardinaliteSource: '1',
          cardinaliteCible: '0..*',
          libelle: 'passe',
        },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);

    const declarations = filledRows(this.sections[0], values).map((row) => {
      const nature = row.nature || 'class';
      const corps = corpsDeClasse(listOf(row.attributs), listOf(row.methodes));
      const entete = `${nature} ${quoteLabel(row.nom)} as ${alias.get(row.nom.trim())}`;
      return corps.length === 0 ? entete : [entete, ' {', '\n', corps.join('\n'), '\n}'].join('');
    });

    const liens = filledRows(this.sections[1], values)
      .map((row) => {
        const de = alias.get(row.source.trim());
        const vers = alias.get(row.cible.trim());
        if (!de || !vers) return '';
        const gauche = row.cardinaliteSource?.trim() ? ` ${quoteLabel(row.cardinaliteSource)}` : '';
        const droite = row.cardinaliteCible?.trim() ? ` ${quoteLabel(row.cardinaliteCible)}` : '';
        const texte = row.libelle?.trim() ? ` : ${row.libelle.trim()}` : '';
        return `${de}${gauche} ${row.type} ${droite}${vers}${texte}`.replace(/\s+/g, ' ');
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, liens));
  },
};

const objets: AssistantSchema = {
  id: '02-diagramme-objets',
  label: "Diagramme d'objets",
  category: 'structurel',
  sections: [
    {
      id: 'objets',
      label: 'Objets',
      hint: "Une instance nommée, sa classe, et la valeur de ses attributs.",
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'commande12' },
        { name: 'classe', label: 'Classe', kind: 'text', placeholder: 'Commande' },
        {
          name: 'valeurs',
          label: 'Valeurs',
          kind: 'multiline',
          placeholder: 'numero = "C-12"\ndate = 2025-04-02',
        },
      ],
      sample: [{ nom: 'client1', classe: 'Client', valeurs: 'nom = "Dupont"' }],
    },
    {
      id: 'liens',
      label: 'Liens',
      fields: [
        { name: 'source', label: 'De', kind: 'reference', references: 'objets', required: true },
        { name: 'cible', label: 'Vers', kind: 'reference', references: 'objets', required: true },
        { name: 'libelle', label: 'Libellé', kind: 'text' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);

    const declarations = filledRows(this.sections[0], values).map((row) => {
      const etiquette = row.classe?.trim() ? `${row.nom} : ${row.classe.trim()}` : row.nom;
      const entete = `object ${quoteLabel(etiquette)} as ${alias.get(row.nom.trim())}`;
      const valeurs = listOf(row.valeurs).map((ligne) => `  ${ligne}`);
      return valeurs.length === 0 ? entete : `${entete} {\n${valeurs.join('\n')}\n}`;
    });

    const liens = filledRows(this.sections[1], values)
      .map((row) => {
        const de = alias.get(row.source.trim());
        const vers = alias.get(row.cible.trim());
        if (!de || !vers) return '';
        return `${de} -- ${vers}${row.libelle?.trim() ? ` : ${row.libelle.trim()}` : ''}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, liens));
  },
};

const composants: AssistantSchema = {
  id: '03-diagramme-composants',
  label: 'Diagramme de composants',
  category: 'structurel',
  sections: [
    {
      id: 'composants',
      label: 'Composants',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Facturation' },
      ],
      sample: [{ nom: 'Interface web' }, { nom: 'Service de commande' }],
    },
    {
      id: 'interfaces',
      label: 'Interfaces',
      hint: 'Le service offert par un composant, que les autres consomment.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'API commande' },
        { name: 'fournie', label: 'Fournie par', kind: 'reference', references: 'composants' },
      ],
    },
    {
      id: 'relations',
      label: 'Utilisations',
      fields: [
        { name: 'source', label: 'Composant', kind: 'reference', references: 'composants', required: true },
        { name: 'cible', label: 'Utilise', kind: 'reference', references: 'interfaces', required: true },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const aliasComposants = aliasesOf(this.sections[0], values, pris);
    const aliasInterfaces = aliasesOf(this.sections[1], values, pris);

    const declarations = filledRows(this.sections[0], values).map(
      (row) => `component ${quoteLabel(row.nom)} as ${aliasComposants.get(row.nom.trim())}`
    );

    const interfaces = filledRows(this.sections[1], values).map(
      (row) => `interface ${quoteLabel(row.nom)} as ${aliasInterfaces.get(row.nom.trim())}`
    );

    const expositions = filledRows(this.sections[1], values)
      .map((row) => {
        const porteur = aliasComposants.get((row.fournie ?? '').trim());
        const cible = aliasInterfaces.get(row.nom.trim());
        return porteur && cible ? `${porteur} -up- ${cible}` : '';
      })
      .filter((ligne) => ligne !== '');

    const usages = filledRows(this.sections[2], values)
      .map((row) => {
        const de = aliasComposants.get(row.source.trim());
        const vers = aliasInterfaces.get(row.cible.trim());
        return de && vers ? `${de} ..> ${vers} : utilise` : '';
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, interfaces, expositions, usages));
  },
};

const deploiement: AssistantSchema = {
  id: '04-diagramme-deploiement',
  label: 'Diagramme de déploiement',
  category: 'structurel',
  sections: [
    {
      id: 'noeuds',
      label: 'Nœuds',
      hint: 'Les machines et environnements d’exécution.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Serveur applicatif' },
        {
          name: 'nature',
          label: 'Nature',
          kind: 'choice',
          options: [
            { value: 'node', label: 'Nœud' },
            { value: 'database', label: 'Base de données' },
            { value: 'cloud', label: 'Cloud' },
          ],
        },
      ],
      sample: [
        { nom: 'Poste client', nature: 'node' },
        { nom: 'Serveur applicatif', nature: 'node' },
      ],
    },
    {
      id: 'artefacts',
      label: 'Artefacts',
      hint: 'Ce qui est déployé : exécutables, archives, bases.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'application.jar' },
        { name: 'noeud', label: 'Déployé sur', kind: 'reference', references: 'noeuds', required: true },
      ],
    },
    {
      id: 'relations',
      label: 'Connexions',
      fields: [
        { name: 'source', label: 'De', kind: 'reference', references: 'noeuds', required: true },
        { name: 'cible', label: 'Vers', kind: 'reference', references: 'noeuds', required: true },
        { name: 'protocole', label: 'Protocole', kind: 'text', placeholder: 'HTTPS' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const aliasNoeuds = aliasesOf(this.sections[0], values, pris);
    const aliasArtefacts = aliasesOf(this.sections[1], values, pris);

    const artefactsParNoeud = new Map<string, string[]>();
    filledRows(this.sections[1], values).forEach((row) => {
      const porteur = (row.noeud ?? '').trim();
      const ligne = `  artifact ${quoteLabel(row.nom)} as ${aliasArtefacts.get(row.nom.trim())}`;
      artefactsParNoeud.set(porteur, [...(artefactsParNoeud.get(porteur) ?? []), ligne]);
    });

    const declarations = filledRows(this.sections[0], values).map((row) => {
      const nature = row.nature || 'node';
      const entete = `${nature} ${quoteLabel(row.nom)} as ${aliasNoeuds.get(row.nom.trim())}`;
      const contenu = artefactsParNoeud.get(row.nom.trim()) ?? [];
      return contenu.length === 0 ? entete : `${entete} {\n${contenu.join('\n')}\n}`;
    });

    const connexions = filledRows(this.sections[2], values)
      .map((row) => {
        const de = aliasNoeuds.get(row.source.trim());
        const vers = aliasNoeuds.get(row.cible.trim());
        if (!de || !vers) return '';
        return `${de} -- ${vers}${row.protocole?.trim() ? ` : ${row.protocole.trim()}` : ''}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(declarations, connexions));
  },
};

const paquetages: AssistantSchema = {
  id: '05-diagramme-paquetages',
  label: 'Diagramme de paquetages',
  category: 'structurel',
  sections: [
    {
      id: 'paquetages',
      label: 'Paquetages',
      hint: 'Laissez « Contenu dans » vide pour un paquetage de premier niveau.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'metier' },
        { name: 'parent', label: 'Contenu dans', kind: 'reference', references: 'paquetages' },
      ],
      sample: [{ nom: 'presentation', parent: '' }, { nom: 'metier', parent: '' }],
    },
    {
      id: 'relations',
      label: 'Dépendances',
      fields: [
        { name: 'source', label: 'De', kind: 'reference', references: 'paquetages', required: true },
        { name: 'cible', label: 'Dépend de', kind: 'reference', references: 'paquetages', required: true },
        { name: 'libelle', label: 'Libellé', kind: 'text' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const alias = aliasesOf(this.sections[0], values, pris);
    const lignes = filledRows(this.sections[0], values);

    // Un paquetage contenu s'écrit à l'intérieur des accolades de son parent :
    // on ne descend que d'un niveau, ce qui couvre l'usage courant sans
    // imposer un arbre à saisir.
    const enfants = new Map<string, string[]>();
    lignes.forEach((row) => {
      const parent = (row.parent ?? '').trim();
      if (parent === '' || parent === row.nom.trim()) return;
      enfants.set(parent, [...(enfants.get(parent) ?? []), row.nom.trim()]);
    });

    const declaration = (nom: string, indentation: string): string[] => {
      const entete = `${indentation}package ${quoteLabel(nom)} as ${alias.get(nom)} {`;
      const contenu = enfants.get(nom) ?? [];
      return [
        entete,
        ...contenu.flatMap((fils) => declaration(fils, `${indentation}  `)),
        `${indentation}}`,
      ];
    };

    const racines = lignes
      .filter((row) => {
        const parent = (row.parent ?? '').trim();
        return parent === '' || !alias.has(parent) || parent === row.nom.trim();
      })
      .flatMap((row) => declaration(row.nom.trim(), ''));

    const dependances = filledRows(this.sections[1], values)
      .map((row) => {
        const de = alias.get(row.source.trim());
        const vers = alias.get(row.cible.trim());
        if (!de || !vers) return '';
        return `${de} ..> ${vers}${row.libelle?.trim() ? ` : ${row.libelle.trim()}` : ''}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(racines, dependances));
  },
};

const structureComposite: AssistantSchema = {
  id: '06-diagramme-structure-composite',
  label: 'Diagramme de structure composite',
  category: 'structurel',
  sections: [
    {
      id: 'ensemble',
      label: 'Classe englobante',
      hint: 'Une seule ligne : la structure dont on détaille l’intérieur.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Commande' },
      ],
      sample: [{ nom: 'Commande' }],
    },
    {
      id: 'parties',
      label: 'Parties',
      hint: 'Les composants internes, avec leur rôle.',
      fields: [
        { name: 'nom', label: 'Rôle', kind: 'text', required: true, placeholder: 'lignes' },
        { name: 'type', label: 'Type', kind: 'text', placeholder: 'LigneCommande' },
      ],
    },
    {
      id: 'relations',
      label: 'Connecteurs',
      fields: [
        { name: 'source', label: 'De', kind: 'reference', references: 'parties', required: true },
        { name: 'cible', label: 'Vers', kind: 'reference', references: 'parties', required: true },
        { name: 'libelle', label: 'Libellé', kind: 'text' },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const aliasEnsemble = aliasesOf(this.sections[0], values, pris);
    const aliasParties = aliasesOf(this.sections[1], values, pris);

    const parties = filledRows(this.sections[1], values).map((row) => {
      const etiquette = row.type?.trim() ? `${row.nom} : ${row.type.trim()}` : row.nom;
      return `  component ${quoteLabel(etiquette)} as ${aliasParties.get(row.nom.trim())}`;
    });

    const englobante = filledRows(this.sections[0], values).map((row) => {
      const entete = `component ${quoteLabel(row.nom)} as ${aliasEnsemble.get(row.nom.trim())}`;
      return parties.length === 0 ? entete : `${entete} {\n${parties.join('\n')}\n}`;
    });

    const connecteurs = filledRows(this.sections[2], values)
      .map((row) => {
        const de = aliasParties.get(row.source.trim());
        const vers = aliasParties.get(row.cible.trim());
        if (!de || !vers) return '';
        return `${de} -- ${vers}${row.libelle?.trim() ? ` : ${row.libelle.trim()}` : ''}`;
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(englobante, connecteurs));
  },
};

const profil: AssistantSchema = {
  id: '07-diagramme-profil',
  label: 'Diagramme de profil',
  category: 'structurel',
  sections: [
    {
      id: 'stereotypes',
      label: 'Stéréotypes',
      hint: 'Les extensions du métamodèle, et ce qu’elles étendent.',
      fields: [
        { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Service' },
        {
          name: 'etend',
          label: 'Étend',
          kind: 'choice',
          options: [
            { value: 'Class', label: 'Class' },
            { value: 'Component', label: 'Component' },
            { value: 'Package', label: 'Package' },
            { value: 'Interface', label: 'Interface' },
          ],
        },
        {
          name: 'proprietes',
          label: 'Propriétés',
          kind: 'multiline',
          placeholder: 'version : String',
        },
      ],
      sample: [{ nom: 'Service', etend: 'Class', proprietes: '' }],
    },
    {
      id: 'applications',
      label: 'Applications',
      hint: 'Les éléments qui portent un stéréotype.',
      fields: [
        { name: 'nom', label: 'Élément', kind: 'text', required: true, placeholder: 'Facturation' },
        {
          name: 'stereotype',
          label: 'Stéréotype',
          kind: 'reference',
          references: 'stereotypes',
          required: true,
        },
      ],
    },
  ],
  build(title, values) {
    const pris = new Set<string>();
    const aliasStereotypes = aliasesOf(this.sections[0], values, pris);
    const metaclasses = new Set<string>();

    const declarations = filledRows(this.sections[0], values).flatMap((row) => {
      const alias = aliasStereotypes.get(row.nom.trim());
      const proprietes = listOf(row.proprietes).map((ligne) => `  ${ligne}`);
      const entete = `class ${quoteLabel(row.nom)} as ${alias} <<stereotype>>`;
      const bloc = proprietes.length === 0 ? entete : `${entete} {\n${proprietes.join('\n')}\n}`;

      // Les métaclasses portent des noms déjà simples (Class, Component…) :
      // leur alias se déduit directement, sans passer par la table.
      const etend = row.etend || 'Class';
      metaclasses.add(etend);
      return [bloc, `meta_${etend} <|-- ${alias}`];
    });

    // Les métaclasses étendues sont déclarées une fois, avant leurs extensions.
    const enTete = Array.from(metaclasses).map(
      (nom) => `class ${quoteLabel(nom)} as meta_${nom} <<metaclass>>`
    );

    const applications = filledRows(this.sections[1], values)
      .map((row) => {
        const stereotype = row.stereotype.trim();
        return aliasStereotypes.has(stereotype)
          ? `class ${quoteLabel(row.nom)} <<${stereotype}>>`
          : '';
      })
      .filter((ligne) => ligne !== '');

    return wrap(title, joinLines(enTete, declarations, applications));
  },
};

export const SCHEMAS_STRUCTURELS: ReadonlyArray<AssistantSchema> = [
  classes,
  objets,
  composants,
  deploiement,
  paquetages,
  structureComposite,
  profil,
];
