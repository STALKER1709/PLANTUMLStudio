import { describe, expect, it } from 'vitest';

import { analyzeText, sentencesOf } from '../../src/renderer/analyze/analyzeText';
import { detectLanguage } from '../../src/renderer/analyze/rules';
import { toAssistantValues } from '../../src/renderer/analyze/toAssistant';
import { schemaById } from '../../src/renderer/assistant/schemas';
import { CORPUS, type CorpusEntry } from './fixtures/analyzeCorpus';

/** Même normalisation que l'analyse : ni casse ni accents. */
function key(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

describe('Découpage du texte', () => {
  it('rend chaque phrase avec sa ligne', () => {
    const phrases = sentencesOf('Première ligne.\n\nDeuxième ligne. Suite de la deuxième.');

    expect(phrases).toEqual([
      { text: 'Première ligne.', line: 1 },
      { text: 'Deuxième ligne.', line: 3 },
      { text: 'Suite de la deuxième.', line: 3 },
    ]);
  });

  it('retire les puces et la numérotation', () => {
    const phrases = sentencesOf('- Le client peut payer.\n2. Le vendeur peut livrer.');

    expect(phrases.map((phrase) => phrase.text)).toEqual([
      'Le client peut payer.',
      'Le vendeur peut livrer.',
    ]);
  });
});

describe('Langue', () => {
  it('reconnaît le français et l’anglais', () => {
    expect(detectLanguage('Le client peut passer une commande dans le système.')).toBe('fr');
    expect(detectLanguage('The customer can place an order in the system.')).toBe('en');
  });

  it('retient le français quand rien ne tranche', () => {
    expect(detectLanguage('')).toBe('fr');
  });

  it('obéit à la langue imposée', () => {
    // Le texte est anglais ; forcer le français doit désactiver ses motifs.
    const analyse = analyzeText('The customer can place an order.', 'fr');
    expect(analyse.language).toBe('fr');
    expect(analyse.actors).toHaveLength(0);
  });
});

describe('Extraction', () => {
  it('éclate une énumération de cas', () => {
    const analyse = analyzeText('Le client peut réserver une place et annuler une réservation.');

    expect(analyse.actors[0].useCases).toEqual([
      'Réserver une place',
      'Annuler une réservation',
    ]);
  });

  it('ne coupe pas un complément qui ne commence pas un nouveau cas', () => {
    const analyse = analyzeText('Le client peut annuler une réservation ou une prestation.');

    expect(analyse.actors[0].useCases).toEqual(['Annuler une réservation ou une prestation']);
  });

  it('attribue les mêmes cas à plusieurs acteurs cités ensemble', () => {
    const analyse = analyzeText('Le client et le gestionnaire peuvent consulter le catalogue.');

    expect(analyse.actors.map((acteur) => acteur.name)).toEqual(['Client', 'Gestionnaire']);
    expect(analyse.actors[1].useCases).toEqual(['Consulter le catalogue']);
  });

  it('ne coupe pas un nom d’acteur sur une préposition', () => {
    const analyse = analyzeText('Le service de paiement et de facturation peut émettre une facture.');

    expect(analyse.actors.map((acteur) => acteur.name)).toEqual([
      'Service de paiement et de facturation',
    ]);
  });

  it('reconnaît un acteur secondaire déclaré comme service externe', () => {
    const analyse = analyzeText('Le service de paiement est un service externe.');

    expect(analyse.actors).toEqual([
      { name: 'Service de paiement', role: 'secondaire', inherits: '', useCases: [] },
    ]);
  });

  it('range une exigence portée par le système parmi les cas sans acteur', () => {
    const analyse = analyzeText('Le système doit envoyer une confirmation.');

    expect(analyse.actors).toHaveLength(0);
    expect(analyse.internalUseCases).toEqual(['Envoyer une confirmation']);
  });

  it('laisse de côté une phrase dont le sujet est un pronom', () => {
    const analyse = analyzeText('Ensuite, il pourra le faire depuis son téléphone.');

    expect(analyse.actors).toHaveLength(0);
    expect(analyse.internalUseCases).toHaveLength(0);
    expect(analyse.ignored).toEqual([
      { sentence: 'Ensuite, il pourra le faire depuis son téléphone.', line: 1 },
    ]);
  });

  it('ne fait pas un acteur d’une circonstancielle', () => {
    const analyse = analyzeText('Une fois la demande validée, le salarié reçoit une notification.');

    expect(analyse.actors.map((acteur) => acteur.name)).toEqual(['Salarié']);
  });
});

describe('Traçabilité', () => {
  it('rattache chaque élément à la phrase et à la ligne qui l’ont produit', () => {
    const analyse = analyzeText('Titre\nLe client peut payer une commande.');
    const trouvaille = analyse.findings.find((finding) => finding.kind === 'useCase');

    expect(trouvaille).toEqual({
      kind: 'useCase',
      label: 'Client : Payer une commande',
      line: 2,
      sentence: 'Le client peut payer une commande.',
      pattern: 'capacite',
    });
  });

  it('rend visibles les phrases dont rien n’a été tiré', () => {
    const analyse = analyzeText('Le client peut payer.\nCe document décrit le périmètre du projet.');

    expect(analyse.ignored).toEqual([
      { sentence: 'Ce document décrit le périmètre du projet.', line: 2 },
    ]);
  });
});

describe('Héritage : pas deux flèches vers le même cas', () => {
  it('retire d’un héritier le cas déjà porté par son ancêtre', () => {
    const analyse = analyzeText(
      [
        'Le visiteur peut consulter le catalogue.',
        'Le client hérite du visiteur.',
        'Le client peut consulter le catalogue et passer une commande.',
      ].join('\n')
    );

    const client = analyse.actors.find((acteur) => acteur.name === 'Client');
    expect(client?.inherits).toBe('Visiteur');
    expect(client?.useCases).toEqual(['Passer une commande']);
  });

  it('remonte toute la chaîne d’ascendance', () => {
    const analyse = analyzeText(
      [
        'Le visiteur peut consulter le catalogue.',
        'Le client hérite du visiteur.',
        'Le client privilégié hérite du client.',
        'Le client privilégié peut consulter le catalogue et accéder aux ventes privées.',
      ].join('\n')
    );

    const privilegie = analyse.actors.find((acteur) => acteur.name === 'Client privilégié');
    expect(privilegie?.useCases).toEqual(['Accéder aux ventes privées']);
  });

  it('ne boucle pas sur un héritage circulaire', () => {
    const analyse = analyzeText(
      ['A hérite de B.', 'B hérite de A.', 'A peut agir sur le stock.'].join('\n')
    );

    expect(analyse.actors.map((acteur) => acteur.name).sort()).toEqual(['A', 'B']);
  });
});

describe('Passage à l’assistant', () => {
  it('remplit les quatre sections du formulaire', () => {
    const analyse = analyzeText(
      [
        'Plateforme de réservation',
        'Le visiteur peut consulter le catalogue.',
        'Le client hérite du visiteur.',
        'Le client peut réserver une prestation.',
        'Le service de paiement est un service externe.',
        "Réserver une prestation inclut s'authentifier.",
      ].join('\n')
    );

    const { schemaId, titre, valeurs } = toAssistantValues(analyse);

    expect(schemaId).toBe('08-diagramme-cas-utilisation');
    expect(titre).toBe('Plateforme de réservation');
    expect(valeurs.systeme).toEqual([{ nom: 'Plateforme de réservation' }]);
    expect(valeurs.acteurs).toEqual([
      { nom: 'Visiteur', role: 'principal', herite: '', cas: 'Consulter le catalogue' },
      { nom: 'Client', role: 'principal', herite: 'Visiteur', cas: 'Réserver une prestation' },
      { nom: 'Service de paiement', role: 'secondaire', herite: '', cas: '' },
    ]);
    expect(valeurs.casInternes).toEqual([{ nom: "S'authentifier" }]);
    expect(valeurs.relationsCas).toEqual([
      { source: 'Réserver une prestation', type: 'include', cible: "S'authentifier" },
    ]);
  });

  it('donne une ligne vierge aux sections que l’analyse ne remplit pas', () => {
    const valeurs = toAssistantValues(analyzeText('Le client peut payer.')).valeurs;

    expect(valeurs.casInternes).toEqual([{ nom: '' }]);
    expect(valeurs.relationsCas).toEqual([{ source: '', type: 'include', cible: '' }]);
  });

  it('produit une source que le schéma sait construire', () => {
    const analyse = analyzeText(
      [
        'Le visiteur peut consulter le catalogue.',
        'Le client hérite du visiteur.',
        'Le client peut passer une commande.',
      ].join('\n')
    );

    const { titre, valeurs } = toAssistantValues(analyse);
    const source = schemaById('08-diagramme-cas-utilisation')?.build(titre, valeurs) ?? '';

    expect(source).toContain('@startuml');
    expect(source).toContain('Visiteur <|-[norank]- Client');
    // Le cas hérité n'est pas redessiné sous l'héritier.
    expect(source.match(/Consulter le catalogue/g)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ Mesure */

interface Score {
  attendus: number;
  trouves: number;
  justes: number;
}

function mesurer(entry: CorpusEntry): { acteurs: Score; couples: Score } {
  const analyse = analyzeText(entry.text, entry.language);

  const acteursAttendus = new Set(entry.expected.map((acteur) => key(acteur.name)));
  const acteursTrouves = new Set(analyse.actors.map((acteur) => key(acteur.name)));

  const couplesAttendus = new Set(
    entry.expected.flatMap((acteur) =>
      acteur.useCases.map((cas) => `${key(acteur.name)}|${key(cas)}`)
    )
  );
  const couplesTrouves = new Set(
    analyse.actors.flatMap((acteur) =>
      acteur.useCases.map((cas) => `${key(acteur.name)}|${key(cas)}`)
    )
  );

  const intersection = (a: Set<string>, b: Set<string>) =>
    [...a].filter((valeur) => b.has(valeur)).length;

  return {
    acteurs: {
      attendus: acteursAttendus.size,
      trouves: acteursTrouves.size,
      justes: intersection(acteursAttendus, acteursTrouves),
    },
    couples: {
      attendus: couplesAttendus.size,
      trouves: couplesTrouves.size,
      justes: intersection(couplesAttendus, couplesTrouves),
    },
  };
}

function cumuler(scores: Score[]): Score {
  return scores.reduce(
    (total, score) => ({
      attendus: total.attendus + score.attendus,
      trouves: total.trouves + score.trouves,
      justes: total.justes + score.justes,
    }),
    { attendus: 0, trouves: 0, justes: 0 }
  );
}

const rappel = (score: Score) => (score.attendus === 0 ? 1 : score.justes / score.attendus);
const precision = (score: Score) => (score.trouves === 0 ? 1 : score.justes / score.trouves);

describe('Qualité mesurée sur le corpus', () => {
  const disciplines = CORPUS.filter((entry) => !entry.narratif);
  const narratifs = CORPUS.filter((entry) => entry.narratif);

  it('sur une description rédigée en phrases courtes, retrouve l’essentiel', () => {
    const acteurs = cumuler(disciplines.map((entry) => mesurer(entry).acteurs));
    const couples = cumuler(disciplines.map((entry) => mesurer(entry).couples));

    // Seuils tenus par la version mesurée ; les chiffres réels sont plus hauts.
    // Ils descendent volontiers si un motif régresse : c'est leur rôle.
    expect(rappel(acteurs)).toBeGreaterThanOrEqual(0.95);
    expect(precision(acteurs)).toBeGreaterThanOrEqual(0.95);
    expect(rappel(couples)).toBeGreaterThanOrEqual(0.9);
    expect(precision(couples)).toBeGreaterThanOrEqual(0.9);
  });

  it('laisse échapper des éléments sur de la prose narrative, sans en inventer', () => {
    const acteurs = cumuler(narratifs.map((entry) => mesurer(entry).acteurs));
    const couples = cumuler(narratifs.map((entry) => mesurer(entry).couples));

    // Ce qui décroche, c'est le rappel : l'acteur secondaire des deux textes
    // n'est amené que par une tournure passive — « le paiement est confié à un
    // prestataire externe » —, que l'analyse ne sait pas lire.
    expect(rappel(acteurs)).toBeLessThan(1);

    // Ce qui ne doit pas décrocher, c'est la précision : mieux vaut ne rien
    // proposer que proposer du faux, puisque c'est l'utilisateur qui valide.
    expect(precision(acteurs)).toBe(1);
    expect(precision(couples)).toBe(1);
  });

  it('chaque description disciplinée produit au moins un acteur exploitable', () => {
    disciplines.forEach((entry) => {
      expect(analyzeText(entry.text, entry.language).actors.length).toBeGreaterThan(0);
    });
  });
});
