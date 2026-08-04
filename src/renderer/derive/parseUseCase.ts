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
}

export interface UseCaseModel {
  /** Nom du système, tiré du `rectangle` englobant ou du titre. */
  system: string;
  actors: UseCaseActor[];
  useCases: UseCaseActor[];
  /** Associations acteur ↔ cas. */
  associations: Array<{ actor: string; useCase: string }>;
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

/** Retire les commentaires et les directives qui ne portent pas de structure. */
function significantLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith("'") && !ligne.startsWith('/'));
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

  const enregistrer = (kind: 'actor' | 'usecase', label: string, id: string) => {
    if (parNom.has(id) || parNom.has(label)) return;
    const entree = { kind, label, id };
    parNom.set(id, entree);
    parNom.set(label, entree);
    (kind === 'actor' ? model.actors : model.useCases).push({ label, id });
  };

  significantLines(source).forEach((ligne) => {
    if (/^@(start|end)uml/i.test(ligne)) return;

    const titre = ligne.match(/^title\s+(.+)$/i);
    if (titre && model.system === '') {
      model.system = titre[1].trim();
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

    // Association acteur ↔ cas, dans un sens ou dans l'autre.
    if (deGauche.kind === 'actor' && deDroite.kind === 'usecase') {
      model.associations.push({ actor: deGauche.id, useCase: deDroite.id });
    } else if (deGauche.kind === 'usecase' && deDroite.kind === 'actor') {
      model.associations.push({ actor: deDroite.id, useCase: deGauche.id });
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
