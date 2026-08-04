/**
 * Analyse d'une description textuelle vers un modèle de cas d'utilisation.
 *
 * Le résultat est une **proposition**, jamais une conclusion : chaque élément
 * trouvé garde la phrase qui l'a produit et son numéro de ligne, et l'interface
 * fait valider l'ensemble avant qu'une seule ligne de PlantUML soit écrite.
 *
 * Ce que l'analyse ne sait pas faire est tout aussi important : elle ne résout
 * pas les pronoms, ne comprend ni la négation ni le conditionnel, et n'invente
 * aucun acteur qui ne serait pas nommé. Les phrases dont rien n'est tiré sont
 * rendues telles quelles dans `ignored`, pour qu'on voie ce qui a été laissé.
 */

import {
  LANGUAGE_RULES,
  detectLanguage,
  type AnalysisLanguage,
  type Emission,
  type LanguageRules,
} from './rules';

export type { AnalysisLanguage } from './rules';

export type FindingKind =
  | 'system'
  | 'actor'
  | 'useCase'
  | 'internalUseCase'
  | 'inheritance'
  | 'include'
  | 'extend';

/** Un élément retenu, avec de quoi remonter à son origine. */
export interface Finding {
  kind: FindingKind;
  /** Ce qui a été retenu, prêt à afficher. */
  label: string;
  /** Ligne du texte saisi, à partir de 1. */
  line: number;
  sentence: string;
  /** Identifiant du motif reconnu. */
  pattern: string;
}

export interface AnalyzedActor {
  name: string;
  role: 'principal' | 'secondaire';
  /** Nom de l'acteur dont il hérite, ou chaîne vide. */
  inherits: string;
  useCases: string[];
}

export interface AnalyzedRelation {
  source: string;
  type: 'include' | 'extend';
  target: string;
}

export interface TextAnalysis {
  language: AnalysisLanguage;
  system: string;
  actors: AnalyzedActor[];
  /** Cas qu'aucun acteur ne déclenche : atteints seulement par inclut / étend. */
  internalUseCases: string[];
  relations: AnalyzedRelation[];
  findings: Finding[];
  /** Phrases dont rien n'a été tiré, pour que l'oubli soit visible. */
  ignored: Array<{ sentence: string; line: number }>;
}

interface Sentence {
  text: string;
  line: number;
}

/** Longueurs au-delà desquelles un fragment n'est plus un nom mais une phrase. */
const MAX_ACTEUR = 40;
const MAX_CAS = 70;
const MAX_MOTS_ACTEUR = 6;

/**
 * Découpe le texte en phrases, chacune sachant sa ligne.
 *
 * Les puces sont retirées : une liste à puces est la façon la plus courante
 * d'écrire un besoin, et « - le client peut réserver » doit se lire comme
 * « le client peut réserver ».
 */
export function sentencesOf(text: string): Sentence[] {
  const phrases: Sentence[] = [];

  text.split(/\r?\n/).forEach((ligneBrute, index) => {
    const ligne = ligneBrute.replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, '').trim();
    if (ligne === '') return;

    ligne
      .split(/(?<=[.;!?])\s+/)
      .map((morceau) => morceau.trim())
      .filter((morceau) => morceau !== '')
      .forEach((morceau) => phrases.push({ text: morceau, line: index + 1 }));
  });

  return phrases;
}

/** Clef de comparaison : ni casse ni accents, pour rapprocher deux graphies. */
function key(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Découpe une énumération en éléments.
 *
 * Un fragment qui ne commence pas un nouvel élément — pas de verbe pour un cas,
 * une préposition pour un acteur — est recollé au précédent avec le mot qui les
 * reliait : « annuler une commande ou une réservation » reste un seul cas.
 */
function splitList(
  raw: string,
  rules: LanguageRules,
  commenceUnElement: (fragment: string) => boolean
): string[] {
  const morceaux = raw.split(new RegExp(rules.enumeration.source, 'gi'));
  const elements: string[] = [];

  for (let index = 0; index < morceaux.length; index += 2) {
    const fragment = (morceaux[index] ?? '').trim();
    const separateur = (morceaux[index - 1] ?? '').trim();
    if (fragment === '') continue;

    if (elements.length > 0 && !commenceUnElement(fragment)) {
      const lien = separateur === ',' || separateur === ';' ? `${separateur} ` : ` ${separateur} `;
      elements[elements.length - 1] += `${lien}${fragment}`;
      continue;
    }

    elements.push(fragment);
  }

  return elements;
}

/** Nettoie un nom d'acteur, ou rend `null` si ce n'en est pas un. */
function cleanActor(raw: string, rules: LanguageRules): string | null {
  // Ni une circonstancielle ni un groupe prépositionnel — « De son côté, le
  // passager… » — ne nomment celui qui agit.
  if (rules.amorceCirconstancielle.test(raw.trim())) return null;
  if (rules.preposition.test(raw.trim())) return null;

  let nom = raw
    .replace(/\([^)]*\)/g, ' ')
    .split(rules.subordonnee)[0]
    // Un nom d'acteur ne contient pas de virgule : ce qui suit est une
    // apposition — « le passager, de son côté, … ».
    .split(',')[0]
    .replace(/[.,;:!?]+$/, '')
    .replace(rules.articles, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Une qualification collée au nom ne fait pas partie du nom.
  nom = nom.replace(rules.acteurSecondaire, '').replace(/\s+/g, ' ').trim();
  nom = nom.replace(/[,;:]+$/, '').trim();

  if (nom === '' || nom.length > MAX_ACTEUR) return null;
  if (nom.split(/\s+/).length > MAX_MOTS_ACTEUR) return null;
  if (rules.nonActeurs.test(nom)) return null;

  return capitalize(nom);
}

/** Nettoie un cas d'utilisation, ou rend `null` si le fragment est inexploitable. */
function cleanUseCase(raw: string, rules: LanguageRules): string | null {
  const cas = raw
    .replace(rules.queueParticipiale, '')
    .replace(rules.queues, '')
    .replace(/[.,;:!?]+$/, '')
    .replace(/^(?:pouvoir|to)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cas === '' || cas.length > MAX_CAS) return null;

  // Un cas d'utilisation se nomme à l'infinitif. Le verbe conjugué qui ouvre le
  // fragment est ramené à sa forme de base — y compris pour le deuxième élément
  // d'une énumération, que la règle de reconnaissance n'a pas vu passer.
  const mots = cas.split(' ');
  const infinitif = rules.infinitifs.get(mots[0].toLowerCase());
  if (infinitif) mots[0] = infinitif;

  return capitalize(mots.join(' '));
}

/** Table des acteurs, indexée par clef insensible à la casse et aux accents. */
class ActorTable {
  private readonly parLaClef = new Map<string, AnalyzedActor>();

  ensure(nom: string): AnalyzedActor {
    const clef = key(nom);
    const existant = this.parLaClef.get(clef);
    if (existant) return existant;

    const acteur: AnalyzedActor = { name: nom, role: 'principal', inherits: '', useCases: [] };
    this.parLaClef.set(clef, acteur);
    return acteur;
  }

  find(nom: string): AnalyzedActor | undefined {
    return this.parLaClef.get(key(nom));
  }

  all(): AnalyzedActor[] {
    return [...this.parLaClef.values()];
  }
}

/**
 * Ancêtres d'un acteur, du plus proche au plus lointain.
 *
 * Même garde contre les cycles que dans l'assistant : « A hérite de B » et
 * « B hérite de A » se saisissent sans difficulté, et ne doivent pas boucler.
 */
function ancestors(acteur: AnalyzedActor, table: ActorTable): AnalyzedActor[] {
  const chaine: AnalyzedActor[] = [];
  const vus = new Set<string>([key(acteur.name)]);
  let courant = acteur.inherits === '' ? undefined : table.find(acteur.inherits);

  while (courant !== undefined && !vus.has(key(courant.name))) {
    chaine.push(courant);
    vus.add(key(courant.name));
    courant = courant.inherits === '' ? undefined : table.find(courant.inherits);
  }

  return chaine;
}

/**
 * Analyse une description textuelle.
 *
 * @param text        La description, telle que saisie.
 * @param forced      Langue imposée ; sinon elle est devinée.
 */
export function analyzeText(text: string, forced?: AnalysisLanguage): TextAnalysis {
  const language = forced ?? detectLanguage(text);
  const rules = LANGUAGE_RULES[language];
  const phrases = sentencesOf(text);

  const table = new ActorTable();
  const findings: Finding[] = [];
  const ignored: Array<{ sentence: string; line: number }> = [];
  const internes: string[] = [];
  const relations: AnalyzedRelation[] = [];
  let systeme = '';

  const ajouterInterne = (cas: string) => {
    if (!internes.some((existant) => key(existant) === key(cas))) internes.push(cas);
  };

  phrases.forEach((phrase, rang) => {
    const regle = rules.rules.find((candidate) => candidate.regex.test(phrase.text));

    if (!regle) {
      // La première ligne sans verbe ni ponctuation finale sert de titre : c'est
      // ainsi qu'on commence spontanément une description.
      if (rang === 0 && systeme === '' && phrase.text.length <= 60 && !/[.!?]$/.test(phrase.text)) {
        systeme = phrase.text.trim();
        findings.push({
          kind: 'system',
          label: systeme,
          line: phrase.line,
          sentence: phrase.text,
          pattern: 'titre-implicite',
        });
        return;
      }

      ignored.push({ sentence: phrase.text, line: phrase.line });
      return;
    }

    const groupes = (phrase.text.match(regle.regex) ?? []).slice(1).map((g) => g ?? '');
    const emissions = regle.emit(groupes);
    const secondaire = rules.acteurSecondaire.test(phrase.text);
    let retenu = false;

    const noter = (kind: FindingKind, label: string) => {
      retenu = true;
      findings.push({ kind, label, line: phrase.line, sentence: phrase.text, pattern: regle.id });
    };

    emissions.forEach((emission) => appliquer(emission));

    function appliquer(emission: Emission): void {
      if (emission.kind === 'system') {
        const nom = emission.name.replace(/[.;:]+$/, '').trim();
        if (nom === '') return;
        systeme = nom;
        noter('system', nom);
        return;
      }

      if (emission.kind === 'include' || emission.kind === 'extend') {
        const source = cleanUseCase(emission.source, rules);
        const cible = cleanUseCase(emission.target, rules);
        if (!source || !cible) return;
        relations.push({ source, type: emission.kind, target: cible });
        ajouterInterne(cible);
        noter(emission.kind, `${source} → ${cible}`);
        return;
      }

      if (emission.kind === 'inheritance') {
        const enfant = cleanActor(emission.actor, rules);
        const parent = cleanActor(emission.parent, rules);
        if (!enfant || !parent || key(enfant) === key(parent)) return;
        // « X est un service externe » qualifie le rôle, il n'y a pas de parent.
        if (rules.acteurSecondaire.test(emission.parent)) {
          table.ensure(enfant).role = 'secondaire';
          noter('actor', enfant);
          return;
        }
        table.ensure(parent);
        table.ensure(enfant).inherits = parent;
        noter('inheritance', `${enfant} → ${parent}`);
        return;
      }

      const nomsBruts = splitList(
        emission.actor,
        rules,
        (fragment) => !rules.preposition.test(fragment)
      );

      const acteurs = nomsBruts
        .map((brut) => ({ brut, propre: cleanActor(brut, rules) }))
        .filter((candidat): candidat is { brut: string; propre: string } => candidat.propre !== null);

      if (emission.kind === 'actor') {
        acteurs.forEach(({ brut, propre }) => {
          const acteur = table.ensure(propre);
          if (secondaire || rules.acteurSecondaire.test(brut)) acteur.role = 'secondaire';
          noter('actor', propre);
        });
        return;
      }

      const cas = splitList(emission.useCase, rules, (fragment) =>
        rules.commenceParUnVerbe(fragment)
      )
        .map((fragment) => cleanUseCase(fragment, rules))
        .filter((valeur): valeur is string => valeur !== null);

      if (cas.length === 0) return;

      // Aucun sujet exploitable — un pronom, un connecteur — : la phrase est
      // laissée telle quelle. Inventer un cas sans savoir qui le déclenche
      // serait pire que de ne rien proposer.
      if (acteurs.length === 0) return;

      // Une exigence portée par le système lui-même n'a pas d'acteur : c'est un
      // cas interne, atteint depuis un autre cas et non déclenché directement.
      const surLeSysteme = acteurs.every(({ propre }) => rules.designeLeSysteme.test(key(propre)));

      if (surLeSysteme) {
        cas.forEach((libelle) => {
          ajouterInterne(libelle);
          noter('internalUseCase', libelle);
        });
        return;
      }

      acteurs.forEach(({ brut, propre }) => {
        if (rules.designeLeSysteme.test(key(propre))) return;
        const acteur = table.ensure(propre);
        if (secondaire || rules.acteurSecondaire.test(brut)) acteur.role = 'secondaire';

        cas.forEach((libelle) => {
          if (!acteur.useCases.some((existant) => key(existant) === key(libelle))) {
            acteur.useCases.push(libelle);
          }
          noter('useCase', `${propre} : ${libelle}`);
        });
      });
    }

    if (!retenu) ignored.push({ sentence: phrase.text, line: phrase.line });
  });

  const acteurs = table.all();

  // La règle d'héritage, appliquée dès l'analyse : un cas déjà porté par un
  // ancêtre n'est pas repris chez l'héritier, sinon il recevrait deux flèches.
  acteurs.forEach((acteur) => {
    const portesPlusHaut = new Set(
      ancestors(acteur, table).flatMap((ancetre) => ancetre.useCases.map((cas) => key(cas)))
    );
    acteur.useCases = acteur.useCases.filter((cas) => !portesPlusHaut.has(key(cas)));
  });

  // Un cas d'utilisation attribué à un acteur n'est pas un cas interne.
  const portes = new Set(acteurs.flatMap((acteur) => acteur.useCases.map((cas) => key(cas))));

  return {
    language,
    system: systeme,
    actors: acteurs,
    internalUseCases: internes.filter((cas) => !portes.has(key(cas))),
    relations,
    findings,
    ignored,
  };
}
