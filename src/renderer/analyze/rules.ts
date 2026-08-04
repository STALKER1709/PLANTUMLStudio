/**
 * Motifs de reconnaissance, par langue.
 *
 * L'analyse ne « comprend » rien : elle reconnaît des tournures. C'est la
 * technique classique d'Abbott — les noms donnent les acteurs, les verbes
 * donnent les cas d'utilisation — restreinte aux formulations qu'on trouve
 * réellement dans un cahier des charges.
 *
 * Ce fichier ne contient que des **données**. Le parcours du texte est dans
 * `analyzeText.ts`, ce qui permet d'ajouter une langue sans toucher au moteur.
 */

export type AnalysisLanguage = 'fr' | 'en';

/** Ce qu'une règle produit quand elle reconnaît une phrase. */
export type Emission =
  | { kind: 'system'; name: string }
  | { kind: 'actor'; actor: string }
  | { kind: 'useCase'; actor: string; useCase: string }
  | { kind: 'inheritance'; actor: string; parent: string }
  | { kind: 'include'; source: string; target: string }
  | { kind: 'extend'; source: string; target: string };

export interface Rule {
  /** Identifiant du motif, affiché pour expliquer d'où vient un élément. */
  id: string;
  regex: RegExp;
  emit(groups: string[]): Emission[];
}

export interface LanguageRules {
  /** Mots vides fréquents, comptés pour deviner la langue. */
  marqueurs: RegExp;
  /** Règles essayées dans l'ordre : la première qui reconnaît la phrase gagne. */
  rules: ReadonlyArray<Rule>;
  /** Une phrase portant ce marqueur désigne un acteur secondaire. */
  acteurSecondaire: RegExp;
  /** Articles retirés en tête d'un nom d'acteur. */
  articles: RegExp;
  /**
   * Sépare « consulter le catalogue et passer commande » en deux cas.
   *
   * Le séparateur est **capturé** : un fragment qui ne commence pas un nouvel
   * élément est recollé au précédent avec le mot qui les reliait.
   */
  enumeration: RegExp;
  /** Coupe la subordonnée : « le client, qui est inscrit, peut… ». */
  subordonnee: RegExp;
  /** Queues sans valeur : « … dans le système ». */
  queues: RegExp;
  /**
   * Circonstancielle accrochée au cas : « proposer un trajet **en indiquant
   * son itinéraire** ». Le cas d'utilisation s'arrête au groupe verbal.
   */
  queueParticipiale: RegExp;
  /** Reconnaît un début de groupe verbal, pour recoller un fragment sans verbe. */
  commenceParUnVerbe(fragment: string): boolean;
  /**
   * Préposition en tête de fragment : « service de paiement et de facturation »
   * ne nomme qu'un acteur, pas deux.
   */
  preposition: RegExp;
  /** Le système lui-même n'est pas un acteur : ses phrases donnent des cas internes. */
  designeLeSysteme: RegExp;
  /**
   * Mots qui ne nomment jamais un acteur : pronoms et connecteurs.
   *
   * Sans ce garde-fou, « Ensuite, il pourra… » produit deux acteurs nommés
   * « Ensuite » et « Il ». L'analyse ne résout pas les pronoms ; elle doit donc
   * refuser d'en faire des acteurs plutôt que d'inventer.
   */
  nonActeurs: RegExp;
  /**
   * Amorce de circonstancielle : « Une fois la demande validée, le salarié… »
   *
   * Le fragment avant la virgule situe l'action, il ne nomme pas celui qui
   * l'accomplit. Sans ce garde-fou, il devient un acteur fantôme.
   */
  amorceCirconstancielle: RegExp;
  /** Conjugué → infinitif, pour les verbes courants d'un cahier des charges. */
  infinitifs: ReadonlyMap<string, string>;
}

/**
 * Verbes conjugués rencontrés dans une spécification, ramenés à l'infinitif.
 *
 * Une table plutôt qu'une règle de dérivation : « gère » donnerait « gèrer »
 * par simple suffixe, et les exceptions du premier groupe sont exactement les
 * verbes qu'on emploie ici.
 */
const INFINITIFS_FR = new Map<string, string>([
  ['consulte', 'consulter'],
  ['crée', 'créer'],
  ['modifie', 'modifier'],
  ['supprime', 'supprimer'],
  ['gère', 'gérer'],
  ['valide', 'valider'],
  ['enregistre', 'enregistrer'],
  ['ajoute', 'ajouter'],
  ['envoie', 'envoyer'],
  ['reçoit', 'recevoir'],
  ['paie', 'payer'],
  ['règle', 'régler'],
  ['commande', 'commander'],
  ['réserve', 'réserver'],
  ['annule', 'annuler'],
  ['imprime', 'imprimer'],
  ['exporte', 'exporter'],
  ['importe', 'importer'],
  ['saisit', 'saisir'],
  ['choisit', 'choisir'],
  ['remplit', 'remplir'],
  ['définit', 'définir'],
  ['suit', 'suivre'],
  ['met', 'mettre'],
  ['prend', 'prendre'],
  ['vérifie', 'vérifier'],
  ['recherche', 'rechercher'],
  ['affiche', 'afficher'],
  ['calcule', 'calculer'],
  ['notifie', 'notifier'],
  ['authentifie', 'authentifier'],
  ['télécharge', 'télécharger'],
  ['publie', 'publier'],
  ['propose', 'proposer'],
  ['soumet', 'soumettre'],
  ['consulte', 'consulter'],
  ['clôture', 'clôturer'],
  ['archive', 'archiver'],
]);

const INFINITIFS_EN = new Map<string, string>([
  ['views', 'view'],
  ['creates', 'create'],
  ['edits', 'edit'],
  ['updates', 'update'],
  ['deletes', 'delete'],
  ['manages', 'manage'],
  ['validates', 'validate'],
  ['records', 'record'],
  ['adds', 'add'],
  ['sends', 'send'],
  ['receives', 'receive'],
  ['pays', 'pay'],
  ['orders', 'order'],
  ['books', 'book'],
  ['cancels', 'cancel'],
  ['prints', 'print'],
  ['exports', 'export'],
  ['imports', 'import'],
  ['enters', 'enter'],
  ['chooses', 'choose'],
  ['checks', 'check'],
  ['searches', 'search'],
  ['displays', 'display'],
  ['computes', 'compute'],
  ['notifies', 'notify'],
  ['uploads', 'upload'],
  ['publishes', 'publish'],
]);

/** Verbes anglais employés à l'infinitif en tête d'un cas d'utilisation. */
const VERBES_EN = new Set<string>([
  ...INFINITIFS_EN.values(),
  'browse',
  'log',
  'sign',
  'register',
  'submit',
  'approve',
  'reject',
  'assign',
  'track',
  'generate',
  'download',
  'configure',
  'schedule',
  'archive',
  'rate',
  'review',
  'share',
  'invite',
  'refund',
  'return',
]);

/**
 * Un fragment qui commence par un de ces mots continue le précédent.
 *
 * L'anglais n'offre aucune marque d'infinitif exploitable : impossible de
 * décider par la forme si « close » ouvre un nouveau cas. On raisonne donc à
 * l'envers — tout mot qui n'est ni déterminant ni préposition ouvre un
 * élément —, ce qui vaut mieux que d'espérer une liste de verbes complète.
 */
const NON_VERBES_EN =
  /^(?:a|an|the|his|her|their|its|my|your|our|this|that|these|those|some|any|of|to|for|from|by|with|in|on|at|about|per|both|each|all)$/i;

const FR: LanguageRules = {
  marqueurs: /\b(?:le|la|les|des|une|est|peut|doit|dans|pour|avec|utilisateur|système)\b/gi,
  acteurSecondaire:
    /\b(?:service|système|prestataire|partenaire|fournisseur|acteur|api)\s+(?:externe|tiers)|\bacteur\s+secondaire|\bsystème\s+tiers/i,
  articles:
    /^(?:l[ea]\s+|l'|les\s+|un[e]?\s+|des\s+|du\s+|d'|au\s+|aux\s+|notre\s+|nos\s+|votre\s+|vos\s+|leurs?\s+|mon\s+|ma\s+|mes\s+|son\s+|sa\s+|ses\s+|ce[ts]?\s+|cette\s+|chaque\s+)/i,
  enumeration: /\s*(,|;|\bet\b|\bpuis\b|\bainsi\s+que\b|\bou\b)\s*/gi,
  subordonnee: /\s+(?:qui|lequel|laquelle|dont)\s+/i,
  queues: /\s+(?:dans|sur|depuis|via)\s+(?:le\s+|la\s+|l')?(?:système|application|site|plateforme|logiciel)\b.*$/i,
  queueParticipiale: /,?\s+(?:en\s+\w+ant|tout\s+en\s+\w+ant)\b.*$/i,
  preposition: /^(?:de\s+|du\s+|des\s+|d'|à\s+|au\s+|aux\s+|en\s+|pour\s+|sur\s+|par\s+)/i,
  designeLeSysteme: /^(?:syst[èe]me|application|logiciel|site|plateforme|programme)$/i,
  nonActeurs:
    /^(?:il|elle|ils|elles|on|celui-ci|celle-ci|ce\s+dernier|cette\s+derni[èe]re|cela|ceci|ensuite|puis|alors|enfin|donc|aussi|[ée]galement|cependant|toutefois|par\s+ailleurs|de\s+plus|en\s+outre|chacun|chacune|tous|toutes|tout|rien|personne|quiconque)$/i,
  amorceCirconstancielle:
    /^(?:une\s+fois|lorsqu|quand|si\s|d[èe]s\s|apr[èe]s|avant|afin|pour\s+que|en\s+cas|à\s+la\s+fin|au\s+moment|tant\s+que|pendant)/i,
  infinitifs: INFINITIFS_FR,
  commenceParUnVerbe(fragment) {
    const premier = fragment.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    // Les quatre terminaisons couvrent les trois groupes, « prendre » et
    // « pouvoir » compris ; les conjugués connus sont acceptés tels quels.
    return /(?:er|ir|re|oir)$/.test(premier) || INFINITIFS_FR.has(premier);
  },
  rules: [
    {
      id: 'systeme',
      regex: /^(?:syst[èe]me|application|projet|titre|logiciel|plateforme)\s*:\s*(.+)$/i,
      emit: ([nom]) => [{ kind: 'system', name: nom }],
    },
    {
      id: 'systeme-nomme',
      regex: /^(?:le\s+syst[èe]me|l'application|le\s+logiciel)\s+(?:s'appelle|se\s+nomme)\s+(.+)$/i,
      emit: ([nom]) => [{ kind: 'system', name: nom }],
    },
    {
      id: 'recit-utilisateur',
      regex: /^en\s+tant\s+qu[e']\s*(.+?)\s*,\s*je\s+(?:veux|souhaite|peux|dois)\s+(?:pouvoir\s+)?(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'permission',
      regex:
        /^(?:le\s+)?syst[èe]me\s+(?:doit\s+)?(?:permet|permettre|autorise|autoriser)\w*\s+(?:à|au|aux)\s+(.+?)\s+de\s+(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'inclusion',
      regex: /^(.+?)\s+(?:inclut|comprend|n[ée]cessite\s+toujours|implique\s+toujours)\s+(.+)$/i,
      emit: ([source, cible]) => [{ kind: 'include', source, target: cible }],
    },
    {
      id: 'extension',
      regex: /^(.+?)\s+(?:[ée]tend|prolonge|peut\s+[êe]tre\s+[ée]tendu[e]?\s+par)\s+(.+)$/i,
      emit: ([source, cible]) => [{ kind: 'extend', source, target: cible }],
    },
    {
      // Avant les règles d'héritage : « X est un service externe » qualifie le
      // rôle de X, ce n'est pas une généralisation vers un acteur « service ».
      id: 'role-secondaire',
      regex:
        /^(.+?)\s+est\s+un[e]?\s+(?:service|syst[èe]me|prestataire|partenaire|fournisseur|acteur|api)\s+(?:externe|tiers)/i,
      emit: ([acteur]) => [{ kind: 'actor', actor: acteur }],
    },
    {
      id: 'heritage',
      regex: /^(.+?)\s+(?:h[ée]rite\s+d[eu']\s*|sp[ée]cialise\s+)(.+)$/i,
      emit: ([acteur, parent]) => [{ kind: 'inheritance', actor: acteur, parent }],
    },
    {
      id: 'heritage-est-un',
      regex: /^(.+?)\s+est\s+un[e]?\s+(.+?)\s+(?:qui|qu[i'])\s+(?:peut|effectue)\s+(.+)$/i,
      emit: ([acteur, parent, cas]) => [
        { kind: 'inheritance', actor: acteur, parent },
        { kind: 'useCase', actor: acteur, useCase: cas },
      ],
    },
    {
      id: 'capacite',
      regex: /^(.+?)\s+(?:peut|peuvent|pourra|pourront)\s+(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'obligation',
      regex: /^(.+?)\s+(?:doit|doivent)\s+(?:pouvoir\s+)?(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'action',
      regex: new RegExp(
        `^(.+?)\\s+(${[...INFINITIFS_FR.keys()].join('|')})\\s+(.+)$`,
        'i'
      ),
      emit: ([acteur, verbe, complement]) => [
        {
          kind: 'useCase',
          actor: acteur,
          useCase: `${INFINITIFS_FR.get(verbe.toLowerCase()) ?? verbe} ${complement}`,
        },
      ],
    },
    {
      id: 'acteur-seul',
      regex: /^(?:l'acteur|l'intervenant)\s+(.+)$/i,
      emit: ([acteur]) => [{ kind: 'actor', actor: acteur }],
    },
  ],
};

const EN: LanguageRules = {
  marqueurs: /\b(?:the|an|is|can|must|shall|with|for|user|system|able)\b/gi,
  acteurSecondaire: /\bexternal\s+(?:service|system|party|provider)|\bsecondary\s+actor|\bthird[-\s]party/i,
  articles: /^(?:the\s+|an?\s+|our\s+|your\s+|their\s+|its\s+|his\s+|her\s+|my\s+|th[ie]se?\s+|that\s+|each\s+|every\s+)/i,
  enumeration: /\s*(,|;|\band\b|\bthen\b|\bor\b)\s*/gi,
  subordonnee: /\s+(?:who|which|that)\s+/i,
  queues: /\s+(?:in|on|from|through)\s+the\s+(?:system|application|site|platform|software)\b.*$/i,
  queueParticipiale: /,\s+\w+ing\b.*$/i,
  preposition: /^(?:of\s+|to\s+|for\s+|from\s+|by\s+|with\s+|in\s+|on\s+)/i,
  designeLeSysteme: /^(?:system|application|software|site|platform|program)$/i,
  nonActeurs:
    /^(?:it|he|she|they|this|that|these|those|then|next|finally|also|however|therefore|thus|moreover|furthermore|everyone|anyone|nobody|each|all|both)$/i,
  amorceCirconstancielle:
    /^(?:once|when|if\s|as\s+soon|after|before|in\s+order|in\s+case|while|during|at\s+the\s+end)/i,
  infinitifs: INFINITIFS_EN,
  commenceParUnVerbe(fragment) {
    const premier = fragment.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    if (VERBES_EN.has(premier) || INFINITIFS_EN.has(premier)) return true;
    // Un gérondif ouvre une circonstancielle, pas un cas d'utilisation : dans
    // « publishes a trip, giving the route », « giving » prolonge le cas.
    if (/ing$/.test(premier)) return false;
    return premier !== '' && !NON_VERBES_EN.test(premier);
  },
  rules: [
    {
      id: 'systeme',
      regex: /^(?:system|application|project|title|software|platform)\s*:\s*(.+)$/i,
      emit: ([nom]) => [{ kind: 'system', name: nom }],
    },
    {
      id: 'systeme-nomme',
      regex: /^(?:the\s+system|the\s+application)\s+is\s+(?:called|named)\s+(.+)$/i,
      emit: ([nom]) => [{ kind: 'system', name: nom }],
    },
    {
      id: 'recit-utilisateur',
      regex: /^as\s+an?\s+(.+?)\s*,\s*i\s+(?:want|need|wish|should\s+be\s+able)\s+(?:to\s+)?(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'permission',
      regex: /^the\s+system\s+(?:shall|must|should|will)\s+(?:allow|let|enable)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'inclusion',
      regex: /^(.+?)\s+(?:includes|always\s+requires)\s+(.+)$/i,
      emit: ([source, cible]) => [{ kind: 'include', source, target: cible }],
    },
    {
      id: 'extension',
      regex: /^(.+?)\s+(?:extends|may\s+be\s+extended\s+by)\s+(.+)$/i,
      emit: ([source, cible]) => [{ kind: 'extend', source, target: cible }],
    },
    {
      id: 'role-secondaire',
      regex: /^(.+?)\s+is\s+an?\s+(?:external|third[-\s]party)\s+(?:service|system|provider|party)/i,
      emit: ([acteur]) => [{ kind: 'actor', actor: acteur }],
    },
    {
      id: 'heritage',
      regex: /^(.+?)\s+(?:inherits\s+from|is\s+a\s+kind\s+of|specialises|specializes)\s+(.+)$/i,
      emit: ([acteur, parent]) => [{ kind: 'inheritance', actor: acteur, parent }],
    },
    {
      id: 'heritage-est-un',
      regex: /^(.+?)\s+is\s+an?\s+(.+?)\s+who\s+(?:can|may)\s+(.+)$/i,
      emit: ([acteur, parent, cas]) => [
        { kind: 'inheritance', actor: acteur, parent },
        { kind: 'useCase', actor: acteur, useCase: cas },
      ],
    },
    {
      id: 'capacite',
      regex: /^(.+?)\s+(?:can|may|is\s+able\s+to|are\s+able\s+to)\s+(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'obligation',
      regex: /^(.+?)\s+(?:must|shall|should)\s+(?:be\s+able\s+to\s+)?(.+)$/i,
      emit: ([acteur, cas]) => [{ kind: 'useCase', actor: acteur, useCase: cas }],
    },
    {
      id: 'action',
      regex: new RegExp(`^(.+?)\\s+(${[...INFINITIFS_EN.keys()].join('|')})\\s+(.+)$`, 'i'),
      emit: ([acteur, verbe, complement]) => [
        {
          kind: 'useCase',
          actor: acteur,
          useCase: `${INFINITIFS_EN.get(verbe.toLowerCase()) ?? verbe} ${complement}`,
        },
      ],
    },
    {
      id: 'acteur-seul',
      regex: /^the\s+actor\s+(.+)$/i,
      emit: ([acteur]) => [{ kind: 'actor', actor: acteur }],
    },
  ],
};

export const LANGUAGE_RULES: Record<AnalysisLanguage, LanguageRules> = { fr: FR, en: EN };

/**
 * Langue du texte, devinée en comptant les mots vides.
 *
 * À égalité — texte très court, ou lignes de mots isolés — on retient le
 * français : c'est la langue de rédaction attendue de l'application.
 */
export function detectLanguage(text: string): AnalysisLanguage {
  const compte = (motif: RegExp) => text.match(new RegExp(motif.source, 'gi'))?.length ?? 0;
  return compte(EN.marqueurs) > compte(FR.marqueurs) ? 'en' : 'fr';
}
