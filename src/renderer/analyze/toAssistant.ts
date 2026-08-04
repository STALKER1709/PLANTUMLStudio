/**
 * Passage de l'analyse textuelle au formulaire de l'assistant.
 *
 * L'analyse ne produit jamais de source PlantUML directement : elle remplit le
 * formulaire, que l'utilisateur corrige avant de générer. C'est ce détour qui
 * rend l'approximation acceptable — une extraction fausse se rattrape en un
 * clic, là où une source fausse se relit ligne à ligne.
 */

import { emptyRow, schemaById, type SectionValues } from '../assistant/schemas';
import type { TextAnalysis } from './analyzeText';

/** Identifiant du schéma d'assistant alimenté par l'analyse. */
export const SCHEMA_CAS_UTILISATION = '08-diagramme-cas-utilisation';

export interface AssistantPrefill {
  schemaId: string;
  titre: string;
  valeurs: SectionValues;
}

/**
 * Convertit une analyse en valeurs de formulaire.
 *
 * Les sections vides reçoivent une ligne vierge plutôt que rien : un formulaire
 * sans ligne n'offre aucun champ où écrire, et l'utilisateur devrait deviner
 * qu'il faut d'abord cliquer sur « ajouter ».
 */
export function toAssistantValues(analysis: TextAnalysis): AssistantPrefill {
  const schema = schemaById(SCHEMA_CAS_UTILISATION);
  if (!schema) throw new Error(`Schéma introuvable : ${SCHEMA_CAS_UTILISATION}`);

  const ligneOuVide = (lignes: Array<Record<string, string>>, sectionId: string) =>
    lignes.length > 0 ? lignes : [emptyRow(schema, sectionId)];

  const valeurs: SectionValues = {
    systeme: [{ nom: analysis.system }],
    acteurs: ligneOuVide(
      analysis.actors.map((acteur) => ({
        nom: acteur.name,
        role: acteur.role,
        herite: acteur.inherits,
        cas: acteur.useCases.join('\n'),
      })),
      'acteurs'
    ),
    casInternes: ligneOuVide(
      analysis.internalUseCases.map((nom) => ({ nom })),
      'casInternes'
    ),
    relationsCas: ligneOuVide(
      analysis.relations.map((relation) => ({
        source: relation.source,
        type: relation.type,
        cible: relation.target,
      })),
      'relationsCas'
    ),
  };

  return { schemaId: SCHEMA_CAS_UTILISATION, titre: analysis.system, valeurs };
}
