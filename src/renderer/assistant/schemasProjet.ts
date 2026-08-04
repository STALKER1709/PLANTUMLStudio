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
 * Couleurs des barres, attribuées dans l'ordre des phases.
 *
 * Une teinte par phase plutôt qu'une seule pour tout le planning : sur un
 * diagramme où les barres se chevauchent, la couleur est ce qui permet de
 * suivre une phase des yeux d'un bout à l'autre de l'axe.
 *
 * Chaque entrée donne le fond puis la bordure — la bordure est la même teinte
 * assombrie, pour que la barre reste lisible sur fond blanc sans que le libellé
 * écrit par-dessus devienne difficile à lire.
 *
 * La liste est parcourue en boucle : au-delà de huit phases, les couleurs se
 * répètent, ce qui reste préférable à des teintes calculées au hasard.
 */
const COULEURS: ReadonlyArray<{ fond: string; bordure: string }> = [
  { fond: '#CFE3FB', bordure: '#1E6FD9' },
  { fond: '#FBD5CF', bordure: '#D9542E' },
  { fond: '#CFF0D5', bordure: '#2E9E4F' },
  { fond: '#E0D2F2', bordure: '#7A4CC0' },
  { fond: '#F8D0EC', bordure: '#C43C9B' },
  { fond: '#D2E7EF', bordure: '#3A87A8' },
  { fond: '#F7EFC0', bordure: '#C9A227' },
  { fond: '#F9D7D7', bordure: '#D96A6A' },
];

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
  hint: "La date de début est facultative : laissée vide, elle est prise sur la phase la plus précoce.",
  fields: [
    { name: 'nom', label: 'Nom', kind: 'text', required: true, placeholder: 'Projet de fin d’études' },
    { name: 'debut', label: 'Début', kind: 'text', placeholder: 'AAAA-MM-JJ' },
    {
      name: 'echelle',
      label: 'Échelle',
      kind: 'choice',
      options: [
        { value: 'weekly', label: 'Semaines' },
        { value: 'daily', label: 'Jours' },
        { value: 'monthly', label: 'Mois' },
      ],
    },
  ],
  sample: [{ nom: 'Projet de fin d’études', debut: '', echelle: 'weekly' }],
};

/**
 * Phases du projet, déjà nommées : il ne reste que les périodes à saisir.
 *
 * Ce sont les étapes usuelles d'un projet de fin d'études, dans leur ordre
 * habituel. Les dates livrées ne sont qu'un exemple : on les remplace par les
 * siennes sans avoir à retaper les intitulés, ni à réfléchir à des durées et à
 * des enchaînements — on lit un début et une fin sur son calendrier, on les
 * recopie.
 */
const SECTION_TACHES: AssistantSection = {
  id: 'taches',
  label: 'Phases',
  hint: 'Les phases sont déjà là : renseignez leur période, au format AAAA-MM-JJ. Deux phases peuvent se chevaucher — la rédaction du rapport court souvent en parallèle.',
  fields: [
    { name: 'nom', label: 'Phase', kind: 'text', required: true, placeholder: 'Analyse du projet' },
    { name: 'debut', label: 'Début', kind: 'text', required: true, placeholder: '2023-08-10' },
    { name: 'fin', label: 'Fin', kind: 'text', required: true, placeholder: '2023-08-25' },
    { name: 'avancement', label: 'Avancement (%)', kind: 'text', placeholder: '0' },
  ],
  sample: [
    { nom: "Phase d'insertion", debut: '2023-07-03', fin: '2023-07-20', avancement: '' },
    { nom: "Étude de l'existant", debut: '2023-07-21', fin: '2023-07-31', avancement: '' },
    { nom: 'Rédaction du cahier des charges', debut: '2023-08-01', fin: '2023-08-09', avancement: '' },
    { nom: 'Analyse du projet', debut: '2023-08-10', fin: '2023-08-25', avancement: '' },
    { nom: 'Conception du projet', debut: '2023-08-28', fin: '2023-09-05', avancement: '' },
    { nom: 'Réalisation et déploiement', debut: '2023-09-06', fin: '2023-09-21', avancement: '' },
    { nom: 'Tests et fonctionnalités', debut: '2023-09-22', fin: '2023-09-28', avancement: '' },
    { nom: 'Rédaction du rapport', debut: '2023-08-29', fin: '2023-09-29', avancement: '' },
  ],
};

const SECTION_JALONS: AssistantSection = {
  id: 'jalons',
  label: 'Jalons',
  hint: "Un point de contrôle sans durée : il se pose à la fin d'une phase.",
  fields: [
    { name: 'nom', label: 'Jalon', kind: 'text', required: true, placeholder: 'Soutenance' },
    { name: 'apres', label: 'À la fin de', kind: 'reference', references: 'taches', required: true },
  ],
};

/**
 * Jours fermés — vide par défaut.
 *
 * Une période bornée par deux dates n'est pas déformée par un jour fermé : la
 * barre est seulement coupée d'une zone grisée, son étendue reste la même.
 * C'est donc un choix de lecture, pas de calcul, et la présentation la plus
 * proche d'un planning classique est celle où les barres restent d'un seul
 * tenant. On les ajoute si l'on veut voir les week-ends.
 */
const SECTION_FERMETURES: AssistantSection = {
  id: 'fermetures',
  label: 'Jours non travaillés',
  hint: 'Facultatif : un jour de la semaine — samedi, dimanche — ou une date précise. Les barres sont alors coupées d’une zone grisée, sans changer de période.',
  fields: [
    { name: 'jour', label: 'Jour', kind: 'text', required: true, placeholder: 'samedi' },
  ],
};

/**
 * Écrit la source du Gantt.
 *
 * `wrap()` n'est pas utilisable ici : il encadre par `@startuml`, alors qu'un
 * Gantt se déclare par `@startgantt`. C'est le seul schéma dans ce cas.
 */
function construireGantt(title: string, values: SectionValues, language: 'fr' | 'en' = 'fr'): string {
  const projet = filledRows(SECTION_PROJET, values)[0];

  // Une phase n'est retenue que si sa période est complète et bien formée :
  // PlantUML refuse une date approximative, et mieux vaut omettre la ligne que
  // faire échouer tout le diagramme sur une saisie en cours.
  const phases = filledRows(SECTION_TACHES, values)
    .map((phase) => ({
      nom: nomDeTache(phase.nom ?? ''),
      debut: (phase.debut ?? '').trim(),
      fin: (phase.fin ?? '').trim(),
      avancement: Math.min(100, Math.max(0, nombre(phase.avancement, 0))),
    }))
    .filter((phase) => phase.nom !== '' && DATE_ISO.test(phase.debut) && DATE_ISO.test(phase.fin))
    // Deux dates inversées se lisent sans peine, et PlantUML les refuserait :
    // on les remet dans l'ordre plutôt que de perdre la ligne.
    .map((phase) =>
      phase.fin < phase.debut ? { ...phase, debut: phase.fin, fin: phase.debut } : phase
    );

  // « language » ne francise que les mois et les jours portés par l'axe ; les
  // mots-clefs de la syntaxe Gantt restent anglais dans tous les cas.
  const entete: string[] = [`language ${language}`];

  const titre = title.trim() || (projet?.nom ?? '').trim();
  if (titre !== '') entete.push(`title ${titre}`);

  // `Project starts` n'est pas décoratif : sans lui, PlantUML refuse toute
  // tâche datée (« No starting date for the project »). Quand l'utilisateur ne
  // le renseigne pas, la phase la plus précoce fait office d'origine.
  const debutSaisi = (projet?.debut ?? '').trim();
  const debutProjet = DATE_ISO.test(debutSaisi)
    ? debutSaisi
    : phases.map((phase) => phase.debut).sort()[0];
  if (debutProjet !== undefined) entete.push(`Project starts ${debutProjet}`);

  const echelle = (projet?.echelle ?? '').trim();
  if (echelle !== '') entete.push(`projectscale ${echelle}`);

  const corps: string[] = [];

  phases.forEach((phase, rang) => {
    const couleur = COULEURS[rang % COULEURS.length];
    corps.push(`[${phase.nom}] starts ${phase.debut} and ends ${phase.fin}`);
    corps.push(`[${phase.nom}] is colored in ${couleur.fond}/${couleur.bordure}`);
    if (phase.avancement > 0) corps.push(`[${phase.nom}] is ${phase.avancement}% completed`);
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
