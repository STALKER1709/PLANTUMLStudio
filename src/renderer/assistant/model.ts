/**
 * Modèle de l'assistant de création.
 *
 * L'assistant remplace la connaissance de la syntaxe PlantUML par des champs à
 * remplir. Chaque type de diagramme déclare ses **sections** — des listes de
 * lignes, comme « les acteurs », « les cas d'utilisation », « les relations » —
 * et une fonction qui transforme ces lignes en source.
 *
 * Tout est donné en données plutôt qu'en composants : une seule interface sait
 * afficher n'importe quel formulaire, et ajouter un type de diagramme revient à
 * décrire ses sections.
 */

/** Nature d'un champ, qui détermine la façon de le saisir. */
export type FieldKind =
  /** Une ligne de texte libre. */
  | 'text'
  /** Plusieurs lignes, une par élément (attributs, méthodes…). */
  | 'multiline'
  /** Un choix parmi des valeurs fixées. */
  | 'choice'
  /** Un élément déjà déclaré dans une autre section. */
  | 'reference';

export interface AssistantField {
  name: string;
  label: string;
  kind: FieldKind;
  /** Valeurs proposées, pour un champ `choice`. */
  options?: ReadonlyArray<{ value: string; label: string }>;
  /**
   * D'où viennent les valeurs proposées, pour un champ `reference`.
   *
   * Chaque entrée désigne une section (`"acteurs"`) ou un champ précis d'une
   * section (`"acteurs.cas"`). Un champ multiligne est éclaté en autant de
   * valeurs que de lignes : c'est ce qui permet de citer un cas d'utilisation
   * saisi dans la liste d'un acteur.
   */
  references?: string | readonly string[];
  placeholder?: string;
  /** Sans cette valeur, la ligne est ignorée à la génération. */
  required?: boolean;
}

export interface AssistantSection {
  id: string;
  label: string;
  /** Phrase d'aide affichée sous le titre de la section. */
  hint?: string;
  fields: ReadonlyArray<AssistantField>;
  /** Lignes proposées au premier affichage : elles montrent l'usage attendu. */
  sample?: ReadonlyArray<Record<string, string>>;
}

/** Une ligne de formulaire : la valeur de chaque champ, par nom. */
export type Row = Record<string, string>;

/** Contenu du formulaire : les lignes de chaque section, par identifiant. */
export type SectionValues = Record<string, Row[]>;

export interface AssistantSchema {
  /** Identifiant du modèle correspondant, pour retrouver la même famille. */
  id: string;
  label: string;
  category: 'structurel' | 'comportemental' | 'planification';
  sections: ReadonlyArray<AssistantSection>;
  /**
   * Produit la source PlantUML à partir du titre et des lignes saisies.
   *
   * `language` ne concerne que les schémas qui écrivent de la prose dans la
   * source — un commentaire d'explication, une directive de localisation. La
   * syntaxe PlantUML, elle, est anglaise quoi qu'il arrive.
   */
  build(title: string, values: SectionValues, language?: 'fr' | 'en'): string;
}

/**
 * Identifiant PlantUML dérivé d'un libellé.
 *
 * PlantUML accepte des libellés quelconques entre guillemets, mais les
 * *identifiants* qui servent à désigner un élément dans les relations doivent
 * être des mots simples. On les dérive donc du libellé : accents retirés,
 * espaces et ponctuation remplacés, et un suffixe si le nom est déjà pris —
 * deux cas d'utilisation peuvent légitimement s'appeler pareil.
 */
export function toAlias(label: string, taken: Set<string>): string {
  const sansAccents = label
    .normalize('NFD')
    // Marques diacritiques combinées : « é » se décompose en « e » + accent,
    // dont on ne garde que la lettre.
    .replace(/[\u0300-\u036f]/g, '');

  let base = sansAccents.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

  // Un identifiant commençant par un chiffre serait lu comme un nombre.
  if (base === '' || /^[0-9]/.test(base)) base = `E${base === '' ? '' : `_${base}`}`;

  let candidat = base;
  let suffixe = 2;
  while (taken.has(candidat)) {
    candidat = `${base}_${suffixe}`;
    suffixe += 1;
  }

  taken.add(candidat);
  return candidat;
}

/**
 * Libellé sûr entre guillemets : ni guillemet ni saut de ligne, qui
 * termineraient la chaîne au milieu et casseraient la source.
 */
export function quoteLabel(label: string): string {
  return `"${label.replace(/["\n\r]+/g, ' ').trim()}"`;
}

/** Lignes réellement remplies : celles dont tous les champs requis sont saisis. */
export function filledRows(section: AssistantSection, values: SectionValues): Row[] {
  const rows = values[section.id] ?? [];
  const requis = section.fields.filter((field) => field.required);

  return rows.filter((row) =>
    requis.every((field) => (row[field.name] ?? '').trim() !== '')
  );
}

/**
 * Table des identifiants d'une section : à chaque libellé, son alias.
 *
 * Les champs `reference` des autres sections désignent une ligne par la valeur
 * de son premier champ ; c'est donc par cette valeur que la table est indexée.
 */
export function aliasesOf(
  section: AssistantSection,
  values: SectionValues,
  taken: Set<string>
): Map<string, string> {
  const clef = section.fields[0]?.name ?? 'nom';
  const table = new Map<string, string>();

  filledRows(section, values).forEach((row) => {
    const libelle = (row[clef] ?? '').trim();
    if (libelle === '' || table.has(libelle)) return;
    table.set(libelle, toAlias(libelle, taken));
  });

  return table;
}

/**
 * Valeurs proposées par un champ lié.
 *
 * Les doublons sont écartés : deux acteurs peuvent citer le même cas, il n'y
 * a qu'un cas.
 */
export function referencedLabels(
  sections: ReadonlyArray<AssistantSection>,
  references: string | readonly string[] | undefined,
  values: SectionValues
): string[] {
  if (references === undefined) return [];
  const specs = typeof references === 'string' ? [references] : references;
  const libelles: string[] = [];

  specs.forEach((spec) => {
    const [sectionId, fieldName] = spec.split('.');
    const section = sections.find((candidat) => candidat.id === sectionId);
    if (!section) return;

    const champ = fieldName ?? section.fields[0]?.name ?? 'nom';
    const multiligne = section.fields.find((f) => f.name === champ)?.kind === 'multiline';

    filledRows(section, values).forEach((row) => {
      const brut = row[champ] ?? '';
      (multiligne ? listOf(brut) : [brut.trim()]).forEach((libelle) => {
        if (libelle !== '' && !libelles.includes(libelle)) libelles.push(libelle);
      });
    });
  });

  return libelles;
}

/** Assemble les lignes d'une source en ignorant les blocs vides. */
export function joinLines(...parts: Array<string | string[] | null | undefined>): string {
  const lignes: string[] = [];

  parts.forEach((part) => {
    if (part === null || part === undefined) return;
    const bloc = Array.isArray(part) ? part : [part];
    const utiles = bloc.filter((ligne) => ligne !== '');
    if (utiles.length === 0) return;
    // Une ligne vide sépare les blocs, sans en ouvrir la source.
    if (lignes.length > 0) lignes.push('');
    lignes.push(...utiles);
  });

  return lignes.join('\n');
}

/** Enveloppe une source dans `@startuml` / `@enduml`, titre compris. */
export function wrap(title: string, corps: string): string {
  const titre = title.trim();
  return ['@startuml', titre === '' ? '' : `title ${titre}`, '', corps, '', '@enduml']
    .filter((ligne, index, tout) => !(ligne === '' && tout[index - 1] === ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .concat('\n');
}

/** Découpe un champ multiligne en éléments non vides. */
export function listOf(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '');
}
