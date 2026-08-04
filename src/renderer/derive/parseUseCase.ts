/**
 * Lecture d'un diagramme de cas d'utilisation écrit en PlantUML.
 *
 * Le but n'est pas d'implémenter la grammaire de PlantUML — elle est vaste et
 * mouvante — mais de reconnaître les formes par lesquelles s'écrit un diagramme
 * de cas d'utilisation : déclarations d'acteurs et de cas, associations,
 * `<<include>>`, `<<extend>>`, généralisations. Ce qui n'est pas reconnu est
 * ignoré sans bruit : mieux vaut dériver depuis ce qu'on a compris que refuser
 * un fichier pour une ligne exotique.
 */

export interface UseCaseActor {
  /** Libellé affiché. */
  label: string;
  /** Identifiant utilisé dans les relations. */
  id: string;
  /**
   * Côté du diagramme, pour les acteurs.
   *
   * Le formalisme place les acteurs **principaux** à gauche et les
   * **secondaires** — services externes, systèmes tiers — à droite. Une source
   * ne le déclare pas ; cela se lit dans la façon dont l'association est
   * écrite : `acteur -- cas` place l'acteur à gauche, `cas -- acteur` à droite.
   */
  side?: 'primary' | 'secondary';
}

export interface UseCaseModel {
  /** Nom du système, tiré du `rectangle` englobant ou du titre. */
  system: string;
  actors: UseCaseActor[];
  useCases: UseCaseActor[];
  /** Associations acteur ↔ cas, avec la ligne où elles sont écrites. */
  associations: Array<{ actor: string; useCase: string; line?: number }>;
  /** `A ..> B : <<include>>` — A appelle toujours B. */
  includes: Array<{ from: string; to: string }>;
  /** `A ..> B : <<extend>>` — A complète parfois B. */
  extensions: Array<{ from: string; to: string }>;
  /** Généralisations entre acteurs : l'enfant hérite des cas du parent. */
  generalizations: Array<{ child: string; parent: string }>;
}

/** Vide, mais exploitable : aucune dérivation ne plante sur un modèle sans rien. */
export function emptyModel(): UseCaseModel {
  return {
    system: '',
    actors: [],
    useCases: [],
    associations: [],
    includes: [],
    extensions: [],
    generalizations: [],
  };
}

/**
 * Retire les commentaires et les directives qui ne portent pas de structure,
 * en conservant le numéro de ligne d'origine — c'est lui qui rend le
 * signalement d'une redondance cliquable dans l'éditeur.
 */
function significantLines(source: string): Array<{ texte: string; numero: number }> {
  return source
    .split(/\r?\n/)
    .map((ligne, index) => ({ texte: ligne.trim(), numero: index + 1 }))
    .filter(
      ({ texte }) => texte !== '' && !texte.startsWith("'") && !texte.startsWith('/')
    );
}

/**
 * Déclaration d'élément. PlantUML en accepte plusieurs écritures :
 * `actor "Libellé" as Alias`, `actor Alias`, `:Libellé:`, `(Libellé)`.
 */
function declarationOf(ligne: string): { kind: 'actor' | 'usecase'; label: string; id: string } | null {
  const mot = ligne.split(/\s+/)[0]?.toLowerCase();
  if (mot !== 'actor' && mot !== 'usecase') {
    // `:Nom:` déclare un acteur, `(Nom)` un cas d'utilisation.
    const acteurCourt = ligne.match(/^:([^:]+):\s*(?:as\s+([A-Za-z_][\w.]*))?$/);
    if (acteurCourt) {
      return {
        kind: 'actor',
        label: acteurCourt[1].trim(),
        id: acteurCourt[2] ?? acteurCourt[1].trim(),
      };
    }
    const casCourt = ligne.match(/^\(([^)]+)\)\s*(?:as\s+([A-Za-z_][\w.]*))?$/);
    if (casCourt) {
      return {
        kind: 'usecase',
        label: casCourt[1].trim(),
        id: casCourt[2] ?? casCourt[1].trim(),
      };
    }
    return null;
  }

  const reste = ligne.slice(mot.length).trim();
  const avecLibelle = reste.match(/^(?:"([^"]+)"|\(([^)]+)\)|([A-Za-z_][\w.]*))\s*(?:as\s+([A-Za-z_][\w.]*))?/);
  if (!avecLibelle) return null;

  const label = (avecLibelle[1] ?? avecLibelle[2] ?? avecLibelle[3] ?? '').trim();
  if (label === '') return null;

  return { kind: mot, label, id: (avecLibelle[4] ?? label).trim() };
}

/** Trait de relation : `--`, `..>`, `<|--`, `-->`, avec longueur et options. */
const RELATION =
  /^(.+?)\s*(<\|)?([-.]{1,2})(?:\[[^\]]*\])?(?:left|right|up|down|l|r|u|d)?([-.]{0,2})(\|>)?(>)?\s*(.+?)\s*(?::\s*(.*))?$/;

/** Nettoie une extrémité de relation : guillemets, parenthèses, cardinalités. */
function endpointOf(brut: string): string {
  let texte = brut.trim();
  // Une cardinalité entre guillemets précède ou suit l'élément.
  texte = texte.replace(/^"[^"]*"\s+/, '').replace(/\s+"[^"]*"$/, '');
  const entreGuillemets = texte.match(/^"([^"]+)"$/);
  if (entreGuillemets) return entreGuillemets[1].trim();
  const entreParentheses = texte.match(/^\(([^)]+)\)$/);
  if (entreParentheses) return entreParentheses[1].trim();
  const entreDeuxPoints = texte.match(/^:([^:]+):$/);
  if (entreDeuxPoints) return entreDeuxPoints[1].trim();
  return texte;
}

export function parseUseCaseDiagram(source: string): UseCaseModel {
  const model = emptyModel();
  /** Du libellé ou de l'alias vers l'entrée canonique. */
  const parNom = new Map<string, UseCaseActor & { kind: 'actor' | 'usecase' }>();

  const enregistrer = (
    kind: 'actor' | 'usecase',
    label: string,
    id: string,
    side?: 'primary' | 'secondary'
  ) => {
    if (parNom.has(id) || parNom.has(label)) return;
    const entree = { kind, label, id };
    parNom.set(id, entree);
    parNom.set(label, entree);
    if (kind === 'actor') model.actors.push({ label, id, side: side ?? 'primary' });
    else model.useCases.push({ label, id });
  };

  /** Un acteur écrit à droite du trait est un acteur secondaire. */
  const marquerSecondaire = (id: string) => {
    const acteur = model.actors.find((candidat) => candidat.id === id);
    // Une déclaration explicite en rectangle « actor » l'emporte : elle ne se
    // laisse pas contredire par une association écrite dans l'autre sens.
    if (acteur && acteur.side !== 'secondary') acteur.side = 'secondary';
  };

  significantLines(source).forEach(({ texte: ligne, numero }) => {
    if (/^@(start|end)uml/i.test(ligne)) return;

    const titre = ligne.match(/^title\s+(.+)$/i);
    if (titre && model.system === '') {
      model.system = titre[1].trim();
      return;
    }

    // Un rectangle stéréotypé « actor » désigne un acteur non humain — service
    // externe, système tiers — et non le cadre du système.
    const acteurRectangle = ligne.match(
      /^rectangle\s+(?:"([^"]+)"|([A-Za-z_][\w.]*))\s*(?:as\s+([A-Za-z_][\w.]*))?\s*<<\s*actor\s*>>/i
    );
    if (acteurRectangle) {
      const label = (acteurRectangle[1] ?? acteurRectangle[2] ?? '').trim();
      if (label !== '') {
        enregistrer('actor', label, (acteurRectangle[3] ?? label).trim(), 'secondary');
      }
      return;
    }

    // Le cadre du système : `rectangle "Nom" {`.
    const cadre = ligne.match(/^(?:rectangle|package|frame|folder)\s+(?:"([^"]+)"|([A-Za-z_][\w.]*))/i);
    if (cadre) {
      model.system = (cadre[1] ?? cadre[2] ?? model.system).trim();
      return;
    }

    if (/^(together|})/.test(ligne) || /^(left|top)\s+to\s+(right|bottom)\s+direction$/i.test(ligne)) {
      return;
    }

    const declaration = declarationOf(ligne);
    if (declaration) {
      enregistrer(declaration.kind, declaration.label, declaration.id);
      return;
    }

    const relation = ligne.match(RELATION);
    if (!relation) return;

    const [, gaucheBrut, flecheGauche, trait1, trait2, flecheDroite, , droiteBrut, etiquette] =
      relation;
    const gauche = endpointOf(gaucheBrut);
    const droite = endpointOf(droiteBrut);
    if (gauche === '' || droite === '') return;

    const deGauche = parNom.get(gauche);
    const deDroite = parNom.get(droite);
    if (!deGauche || !deDroite) return;

    const pointille = `${trait1}${trait2}`.includes('.');
    const stereotype = (etiquette ?? '').toLowerCase();

    // Généralisation : la pointe creuse désigne le parent.
    if (flecheGauche || flecheDroite) {
      const parent = flecheGauche ? deGauche : deDroite;
      const enfant = flecheGauche ? deDroite : deGauche;
      if (parent.kind === 'actor' && enfant.kind === 'actor') {
        model.generalizations.push({ child: enfant.id, parent: parent.id });
      }
      return;
    }

    if (pointille && deGauche.kind === 'usecase' && deDroite.kind === 'usecase') {
      const lien = { from: deGauche.id, to: deDroite.id };
      // Sans stéréotype, une dépendance entre cas se lit comme une inclusion.
      if (stereotype.includes('extend')) model.extensions.push(lien);
      else model.includes.push(lien);
      return;
    }

    // Association acteur ↔ cas. Le sens d'écriture porte le côté : à gauche du
    // trait l'acteur est principal, à droite il est secondaire.
    if (deGauche.kind === 'actor' && deDroite.kind === 'usecase') {
      model.associations.push({ actor: deGauche.id, useCase: deDroite.id, line: numero });
    } else if (deGauche.kind === 'usecase' && deDroite.kind === 'actor') {
      model.associations.push({ actor: deDroite.id, useCase: deGauche.id, line: numero });
      marquerSecondaire(deDroite.id);
    }
    // Une pointe simple entre deux cas sans stéréotype n'a pas de sens UML
    // arrêté : on ne l'interprète pas plutôt que de deviner.
  });

  return model;
}

/** `true` si la source ressemble assez à un diagramme de cas d'utilisation. */
export function looksLikeUseCase(model: UseCaseModel): boolean {
  return model.useCases.length > 0 && model.actors.length > 0;
}

/** Libellé d'un élément à partir de son identifiant. */
export function labelOf(model: UseCaseModel, id: string): string {
  const trouve = [...model.actors, ...model.useCases].find((element) => element.id === id);
  return trouve?.label ?? id;
}

/**
 * Acteurs rattachés à un cas, héritage compris.
 *
 * Un acteur qui en généralise un autre participe aussi à ses cas : c'est
 * précisément le sens de la généralisation, et l'ignorer produirait des
 * diagrammes de séquence sans acteur.
 */
export function actorsOf(model: UseCaseModel, useCaseId: string): string[] {
  const directs = model.associations
    .filter((association) => association.useCase === useCaseId)
    .map((association) => association.actor);

  const tous = new Set(directs);
  // Les descendants d'un acteur associé le sont aussi, transitivement.
  let ajout = true;
  while (ajout) {
    ajout = false;
    model.generalizations.forEach(({ child, parent }) => {
      if (tous.has(parent) && !tous.has(child)) {
        tous.add(child);
        ajout = true;
      }
    });
  }

  return Array.from(tous);
}

/**
 * Associations rendues redondantes par une généralisation.
 *
 * Un acteur hérite des cas de celui dont il descend : lui redessiner une
 * flèche vers un cas déjà porté par un ancêtre ajoute un trait qui ne dit
 * rien, et fait recevoir au cas deux flèches là où une suffit. C'est une
 * faute de notation, pas une question de goût.
 *
 * La chaîne d'ascendance est parcourue en entier — un cas hérité du
 * grand-parent est aussi redondant — avec une garde contre les cycles, qu'une
 * source écrite à la main peut parfaitement contenir.
 */
export function redundantAssociations(
  model: UseCaseModel
): Array<{ actor: string; ancestor: string; useCase: string; line?: number }> {
  const parents = new Map<string, string[]>();
  model.generalizations.forEach(({ child, parent }) => {
    parents.set(child, [...(parents.get(child) ?? []), parent]);
  });

  /** Tous les ascendants d'un acteur, héritage multiple compris. */
  const ascendance = (acteur: string): string[] => {
    const trouves: string[] = [];
    const vus = new Set<string>([acteur]);
    const aVoir = [...(parents.get(acteur) ?? [])];

    while (aVoir.length > 0) {
      const courant = aVoir.shift() as string;
      if (vus.has(courant)) continue;
      vus.add(courant);
      trouves.push(courant);
      aVoir.push(...(parents.get(courant) ?? []));
    }

    return trouves;
  };

  const casDe = new Map<string, Set<string>>();
  model.associations.forEach(({ actor, useCase }) => {
    casDe.set(actor, (casDe.get(actor) ?? new Set()).add(useCase));
  });

  const redondances: Array<{ actor: string; ancestor: string; useCase: string; line?: number }> = [];
  model.associations.forEach(({ actor, useCase, line }) => {
    const ancetre = ascendance(actor).find((candidat) => casDe.get(candidat)?.has(useCase));
    if (ancetre !== undefined) redondances.push({ actor, ancestor: ancetre, useCase, line });
  });

  return redondances;
}
