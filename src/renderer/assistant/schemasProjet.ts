/**
 * Schéma de l'assistant : le diagramme de Gantt.
 *
 * Le Gantt **n'appartient pas à UML** — il n'est pas dans les quatorze
 * diagrammes de la norme 2.5. PlantUML sait le produire, avec une syntaxe qui
 * lui est propre (`@startgantt`, des dates, des durées), et c'est à ce titre
 * qu'il est proposé ici : comme diagramme de planification, dans sa propre
 * famille, sans être présenté comme un diagramme UML.
 *
 * La syntaxe de PlantUML est anglaise (`lasts`, `starts at`, `are closed`).
 * Le formulaire reste en français et la traduction se fait à la génération :
 * on saisit « samedi », la source porte `saturday are closed`.
 */

import {
  filledRows,
  type AssistantSchema,
  type AssistantSection,
  type SectionValues,
} from './model';

/** Jours de la semaine, du français vers le mot-clef attendu par PlantUML. */
const JOURS = new Map<string, string>([
  ['lundi', 'monday'],
  ['mardi', 'tuesday'],
  ['mercredi', 'wednesday'],
  ['jeudi', 'thursday'],
  ['vendredi', 'friday'],
  ['samedi', 'saturday'],
  ['dimanche', 'sunday'],
]);

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nom utilisable entre crochets.
 *
 * Un crochet dans un nom de tâche fermerait la référence au milieu et casserait
 * toutes les lignes qui la citent.
 */
function nomDeTache(brut: string): string {
  return brut.replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Premier nombre trouvé dans une saisie libre, ou la valeur de repli. */
function nombre(brut: string | undefined, defaut: number): number {
  const trouve = (brut ?? '').match(/\d+/);
  return trouve ? Number(trouve[0]) : defaut;
}

const SECTION_PROJET: AssistantSection = {
  id: 'projet',
  label: 'Projet',
  hint: 'La date de début ancre tout le calendrier ; elle s’écrit au format AAAA-MM-JJ.',
  fields: [
    { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Refonte du portail' },
    { name: 'debut', label: 'Début', kind: 'text', required: true, placeholder: '2026-09-01' },
    {
      name: 'echelle',
      label: 'Échelle',
      kind: 'choice',
      options: [
        { value: 'daily', label: 'Jours' },
        { value: 'weekly', label: 'Semaines' },
        { value: 'monthly', label: 'Mois' },
      ],
    },
  ],
  sample: [{ nom: 'Refonte du portail', debut: '2026-09-01', echelle: 'weekly' }],
};

const SECTION_TACHES: AssistantSection = {
  id: 'taches',
  label: 'Tâches',
  hint: "Une tâche par ligne, dans l'ordre. « Commence après » l'enchaîne à la fin d'une autre ; laissé vide, elle démarre au début du projet.",
  fields: [
    { name: 'nom', label: 'Tâche', kind: 'text', required: true, placeholder: 'Cadrage' },
    { name: 'phase', label: 'Phase', kind: 'text', placeholder: 'Étude' },
    { name: 'duree', label: 'Durée (jours)', kind: 'text', required: true, placeholder: '10' },
    { name: 'apres', label: 'Commence après', kind: 'reference', references: 'taches' },
    { name: 'avancement', label: 'Avancement (%)', kind: 'text', placeholder: '0' },
  ],
  sample: [
    { nom: 'Cadrage', phase: 'Étude', duree: '10', apres: '', avancement: '100' },
    { nom: 'Conception', phase: 'Étude', duree: '15', apres: 'Cadrage', avancement: '40' },
    { nom: 'Réalisation', phase: 'Construction', duree: '30', apres: 'Conception', avancement: '' },
    { nom: 'Recette', phase: 'Construction', duree: '10', apres: 'Réalisation', avancement: '' },
  ],
};

const SECTION_JALONS: AssistantSection = {
  id: 'jalons',
  label: 'Jalons',
  hint: "Un point de contrôle sans durée : il se pose à la fin d'une tâche.",
  fields: [
    { name: 'nom', label: 'Jalon', kind: 'text', required: true, placeholder: 'Mise en production' },
    { name: 'apres', label: 'À la fin de', kind: 'reference', references: 'taches', required: true },
  ],
  sample: [{ nom: 'Mise en production', apres: 'Recette' }],
};

const SECTION_FERMETURES: AssistantSection = {
  id: 'fermetures',
  label: 'Jours non travaillés',
  hint: 'Un jour de la semaine — samedi, dimanche — ou une date précise au format AAAA-MM-JJ.',
  fields: [
    { name: 'jour', label: 'Jour', kind: 'text', required: true, placeholder: 'samedi' },
  ],
  sample: [{ jour: 'samedi' }, { jour: 'dimanche' }],
};

/**
 * Écrit la source du Gantt.
 *
 * `wrap()` n'est pas utilisable ici : il encadre par `@startuml`, alors qu'un
 * Gantt se déclare par `@startgantt`. C'est le seul schéma dans ce cas.
 */
function construireGantt(title: string, values: SectionValues): string {
  const projet = filledRows(SECTION_PROJET, values)[0];
  const entete: string[] = ['language fr'];

  const titre = title.trim() || (projet?.nom ?? '').trim();
  if (titre !== '') entete.push(`title ${titre}`);

  const debut = (projet?.debut ?? '').trim();
  if (debut !== '') entete.push(`Project starts ${debut}`);

  const echelle = (projet?.echelle ?? '').trim();
  if (echelle !== '') entete.push(`projectscale ${echelle}`);

  const taches = filledRows(SECTION_TACHES, values);
  const corps: string[] = [];
  let phaseCourante = '';

  taches.forEach((tache) => {
    const nom = nomDeTache(tache.nom ?? '');
    if (nom === '') return;

    // Une phase ouvre un intertitre, et seulement quand elle change : répéter
    // le séparateur à chaque tâche découperait le diagramme en tranches d'une
    // ligne.
    const phase = (tache.phase ?? '').trim();
    if (phase !== '' && phase !== phaseCourante) {
      corps.push('', `-- ${phase} --`);
      phaseCourante = phase;
    }

    corps.push(`[${nom}] lasts ${nombre(tache.duree, 1)} days`);

    const apres = nomDeTache(tache.apres ?? '');
    // Une tâche ne peut pas commencer après elle-même : la référence est
    // sélectionnée dans une liste qui la contient aussi.
    if (apres !== '' && apres !== nom) corps.push(`[${nom}] starts at [${apres}]'s end`);

    const avancement = Math.min(100, Math.max(0, nombre(tache.avancement, 0)));
    if (avancement > 0) corps.push(`[${nom}] is ${avancement}% completed`);
  });

  const jalons = filledRows(SECTION_JALONS, values)
    .map((jalon) => ({ nom: nomDeTache(jalon.nom ?? ''), apres: nomDeTache(jalon.apres ?? '') }))
    .filter((jalon) => jalon.nom !== '' && jalon.apres !== '')
    .map((jalon) => `[${jalon.nom}] happens at [${jalon.apres}]'s end`);

  const fermetures = filledRows(SECTION_FERMETURES, values)
    .map((ligne) => (ligne.jour ?? '').trim().toLowerCase())
    .map((jour) => {
      const anglais = JOURS.get(jour);
      if (anglais) return `${anglais} are closed`;
      // Une date précise ferme un jour donné : un pont, une fermeture annuelle.
      if (DATE_ISO.test(jour)) return `${jour} is closed`;
      return '';
    })
    .filter((ligne) => ligne !== '');

  const blocs = [entete, corps, jalons, fermetures]
    .map((bloc) => bloc.filter((ligne, index) => !(ligne === '' && index === 0)).join('\n'))
    .filter((bloc) => bloc.trim() !== '');

  return `@startgantt\n${blocs.join('\n\n')}\n@endgantt\n`;
}

const gantt: AssistantSchema = {
  id: '15-diagramme-gantt',
  label: 'Diagramme de Gantt',
  category: 'planification',
  sections: [SECTION_PROJET, SECTION_TACHES, SECTION_JALONS, SECTION_FERMETURES],
  build: construireGantt,
};

export const SCHEMAS_PROJET: ReadonlyArray<AssistantSchema> = [gantt];
