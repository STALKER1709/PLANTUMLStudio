import type { AssistantSchema, SectionValues } from './model';
import { SCHEMAS_COMPORTEMENTAUX } from './schemasComportementaux';
import { SCHEMAS_PROJET } from './schemasProjet';
import { SCHEMAS_STRUCTURELS } from './schemasStructurels';

/**
 * Les diagrammes proposés, dans l'ordre des modèles livrés : les 14 de la
 * norme UML 2.5, puis le Gantt, qui n'en fait pas partie.
 */
export const SCHEMAS: ReadonlyArray<AssistantSchema> = [
  ...SCHEMAS_STRUCTURELS,
  ...SCHEMAS_COMPORTEMENTAUX,
  ...SCHEMAS_PROJET,
];

export function schemaById(id: string): AssistantSchema | undefined {
  return SCHEMAS.find((schema) => schema.id === id);
}

/**
 * Formulaire de départ : les lignes d'exemple du schéma, ou une ligne vide.
 *
 * Partir d'un formulaire vierge laisse l'utilisateur devant des colonnes dont
 * il ne devine pas le contenu attendu ; les exemples le montrent, et se
 * remplacent en écrivant par-dessus.
 */
export function initialValues(schema: AssistantSchema): SectionValues {
  const values: SectionValues = {};

  schema.sections.forEach((section) => {
    const lignes = section.sample ?? [];
    values[section.id] =
      lignes.length > 0
        ? lignes.map((ligne) => ({ ...ligne }))
        : [emptyRow(schema, section.id)];
  });

  return values;
}

/** Ligne vide d'une section, chaque champ à sa valeur par défaut. */
export function emptyRow(schema: AssistantSchema, sectionId: string): Record<string, string> {
  const section = schema.sections.find((candidat) => candidat.id === sectionId);
  const row: Record<string, string> = {};

  section?.fields.forEach((field) => {
    // Un choix sans valeur afficherait une liste vide : on prend la première.
    row[field.name] = field.kind === 'choice' ? (field.options?.[0]?.value ?? '') : '';
  });

  return row;
}

export type { AssistantSchema, SectionValues };
