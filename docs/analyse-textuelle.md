# Analyse d'une description textuelle

Le bouton **« Analyser un texte »** part d'une description en français ou en anglais et en
tire les acteurs, leurs cas d'utilisation, les généralisations et les relations `include` /
`extend`. Le résultat ouvre le formulaire de l'assistant, où il se corrige avant de produire
la moindre ligne de PlantUML.

## Ce que l'analyse est, et ce qu'elle n'est pas

L'application est **entièrement hors ligne** : aucun modèle de langue n'est appelé, rien
n'est téléchargé. L'analyse reconnaît des **tournures**, elle ne comprend pas le texte.
C'est la technique classique d'Abbott — les noms donnent les acteurs, les verbes donnent les
cas — restreinte aux formulations qu'on rencontre dans un cahier des charges.

Conséquence directe, et assumée : **l'analyse propose, elle ne conclut pas.** Chaque élément
trouvé affiche la phrase et la ligne dont il provient, les phrases dont rien n'a été tiré
restent affichées, et le seul chemin de sortie passe par le formulaire.

## Tournures reconnues

### Français

| Écrivez | Ce qui en est tiré |
| --- | --- |
| `En tant que gestionnaire, je veux valider les réservations.` | acteur + cas |
| `Le visiteur peut consulter le catalogue et créer un compte.` | acteur + deux cas |
| `Le système doit permettre au client de payer en ligne.` | acteur + cas |
| `Le client inscrit hérite du visiteur.` | généralisation |
| `Le service de paiement est un service externe.` | acteur **secondaire** |
| `Réserver une prestation inclut s'authentifier.` | relation `<<include>>` |
| `Résoudre un ticket peut être étendu par escalader au fournisseur.` | relation `<<extend>>` |
| `Le manager valide les demandes.` | acteur + cas (verbe conjugué ramené à l'infinitif) |
| `Le système doit envoyer une confirmation.` | cas **sans acteur direct** |
| `Plateforme de réservation` *(première ligne, sans point)* | nom du système |

### Anglais

| Écrivez | Ce qui en est tiré |
| --- | --- |
| `As a warehouse clerk, I want to prepare a shipment.` | acteur + cas |
| `A visitor can browse the catalogue and create an account.` | acteur + deux cas |
| `The system shall allow the customer to pay an order.` | acteur + cas |
| `The registered customer inherits from the visitor.` | généralisation |
| `The payment gateway is an external service.` | acteur **secondaire** |
| `Place an order includes authenticate.` | relation `<<include>>` |

Les listes à puces (`-`, `*`, `1.`) sont admises : la puce est retirée avant l'analyse.

## Ce qui n'est pas reconnu

- **Les pronoms.** « Ensuite, **il** pourra le faire » : l'analyse ne sait pas qui est « il »
  et refuse d'en faire un acteur plutôt que d'inventer.
- **La voix passive.** « Le paiement **est confié à** un prestataire externe » n'est pas lu.
- **La négation et le conditionnel.** « sauf si », « à moins que » sont ignorés — la phrase
  est traitée comme si la restriction n'existait pas, ou laissée de côté.
- **Les acteurs implicites**, jamais nommés dans le texte.
- **Les phrases longues à subordonnées enchâssées.**

Toute phrase dont rien n'est tiré apparaît sous **« Phrases laissées de côté »**, avec son
numéro de ligne. C'est le point important : un oubli est visible, il ne disparaît pas.

## Règles appliquées pendant l'analyse

- **Le système n'est pas un acteur.** « Le système doit envoyer une confirmation » produit un
  cas *sans acteur direct*, pas un acteur nommé « Système ».
- **La règle d'héritage** du [formalisme](formalisme.md) est appliquée dès l'analyse : un cas
  déjà porté par un ancêtre n'est pas repris chez l'héritier, sinon il recevrait deux flèches.
  La chaîne d'ascendance est remontée en entier, et gardée contre les cycles.
- **Les énumérations sont éclatées**, mais un fragment qui ne commence pas un nouvel élément
  est recollé au précédent : « annuler une réservation **ou une prestation** » reste un seul
  cas.
- **Les verbes conjugués sont ramenés à l'infinitif** : « le manager valide les demandes »
  donne le cas « Valider les demandes ».

## Qualité mesurée

`tests/unit/analyze.test.ts` mesure le rappel et la précision sur le corpus de
`tests/unit/fixtures/analyzeCorpus.ts` — six descriptions rédigées en phrases courtes et deux
volontairement narratives, quatre en français et quatre en anglais.

| Corpus | Acteurs | Couples acteur–cas |
| --- | --- | --- |
| Descriptions rédigées en phrases courtes | rappel 100 %, précision 100 % | rappel 100 %, précision 100 % |
| Descriptions narratives | rappel 67 %, précision 100 % | rappel 100 %, précision 100 % |

**Ces chiffres ne se lisent pas comme une promesse.** Le corpus a été écrit puis les motifs
ajustés en le regardant : il vaut comme garde-fou contre les régressions, pas comme preuve
que l'analyse tiendra sur un texte quelconque. Ce qu'il établit vraiment est plus modeste, et
plus utile : sur ces textes, ce qui est proposé est juste. Le rappel décroche sur la prose
narrative — l'acteur secondaire des deux textes n'arrive que par une tournure passive — mais
la précision tient, et c'est elle qui compte quand c'est un humain qui valide.

Les seuils sont assertés dans les tests ; ils échouent si un motif régresse.
