# Journal des versions

Les dates sont celles de la préparation de la version. Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; les numéros suivent
[SemVer](https://semver.org/lang/fr/).

## [0.9.0] — 2026-08-04

Première version complète. Elle n'est pas numérotée 1.0.0 pour une raison
précise, énoncée plus bas : le packaging n'a été vérifié que sous Linux.

### Ajouté

- **Les 14 diagrammes UML 2.5**, chacun livré comme modèle commenté en français
  et suivant un formalisme documenté (`docs/formalisme.md`).
- **Diagramme de Gantt** (`docs/gantt.md`) — hors UML, dans sa propre famille.
  Le formulaire s'ouvre avec les huit phases d'un projet de fin d'études déjà
  nommées : il ne reste que les périodes à renseigner. Chaque phase se borne par
  deux dates, ce qui laisse deux phases se chevaucher, et reçoit sa propre
  couleur sans rien à saisir.
- **Assistant de création** : un formulaire par type de diagramme, dont
  l'application écrit la source PlantUML. Aperçu mis à jour à chaque frappe.
- **Dérivation depuis les cas d'utilisation** : diagramme de séquence et de
  communication par cas, classes d'analyse, vue d'ensemble des interactions. Ce
  qui ne se dérive pas est listé avec sa raison.
- **Édition du rendu à la souris** : tout élément se déplace, un paquetage
  emmène ce qu'il contient, et les flèches sont recalculées pour ne traverser ni
  un élément ni une autre flèche.
- **Optimisation de la disposition** : mesurée sur 17 diagrammes, 11 défauts
  ramenés à 2 en 206 ms cumulées, sans jamais dégrader un diagramme déjà propre.
- **Disposition imposée aux cas d'utilisation** : acteurs principaux à gauche,
  secondaires à droite.
- **Règle d'héritage** : un cas ne reçoit jamais deux flèches d'acteurs qui
  s'héritent. L'assistant ne l'écrit pas ; les diagrammes déjà écrits sont
  vérifiés, et « Corriger » retire les flèches de trop d'un clic en laissant un
  commentaire à leur place.
- **Dispositions conservées par le projet** : les déplacements sont rangés dans
  le `.plantumlproj`, indexés par chemin relatif, et retrouvés à la réouverture.
  La source reste un fichier PlantUML valide, lisible par tout autre outil.
- **Annulation d'un déplacement** : un cran en arrière par geste — et non par
  pixel —, ou double appui sur un élément pour le remettre seul à sa place.
- **Interface et assistant bilingues** : les libellés des quinze formulaires,
  ainsi que ce que l'assistant écrit dans la source, suivent la langue choisie.
- Éditeur Monaco (coloration PlantUML, autocomplétion, extraits), panneau
  d'erreurs en français avec numéro de ligne cliquable, arborescence de projet,
  export PNG / SVG / PDF et archive ZIP, thème clair / sombre.

### Sécurité

- **Garantie hors ligne** par quatre barrières indépendantes : scan statique des
  sources, blocage des requêtes sortantes au runtime, CSP stricte, cloisonnement
  Electron (`contextIsolation`, `sandbox`, `nodeIntegration: false`).
- Accès disque confiné au dossier du projet ouvert.
- Moteur PlantUML en profil `SANDBOX`, élargi à `ALLOWLIST` limité au projet dès
  qu'un projet est ouvert.

### Vérifié

- 250 tests unitaires, dont le **rendu réel** des 15 modèles livrés et de toutes
  les sources produites par l'assistant, par `plantuml.jar`.
- 20 tests de bout en bout (Playwright + Electron) : rendu, édition à la souris,
  optimisation, assistant, Gantt, dérivation, règle d'héritage, création de
  projet, arborescence, export d'un diagramme et du projet, persistance des
  dispositions, annulation, et absence de requête réseau.
- `npm run verify:offline` sans détection.
- Paquets Linux `.deb` et AppImage construits et mesurés (119 Mo chacun, dont
  22,6 Mo de `plantuml.jar` et 18,9 Mo de code applicatif). La cible `.rpm`
  demande `rpmbuild` sur la machine de construction, absent ici.

### Non vérifié — ce qui manque pour une 1.0.0

Ces trois points sont ouverts et **n'ont pas pu être éprouvés** dans
l'environnement de développement utilisé :

1. **Packaging Windows et macOS.** `npm run package:win` et `npm run package:mac`
   n'ont jamais été exécutés : ils demandent respectivement Wine ou une machine
   macOS. Un échec `EPERM` sur `release\win-unpacked` a été rapporté sous
   Windows sans avoir pu être reproduit — voir `docs/distribution.md`.
2. **JRE embarqué.** `npm run resources:jre` n'a jamais abouti, les serveurs
   Adoptium étant inaccessibles depuis l'environnement de build. Le chemin
   « JRE embarqué » d'`EnvironmentService` est couvert par des tests unitaires,
   mais le téléchargement lui-même reste à éprouver.
3. **Signature et notarisation.** Aucune. Les installateurs déclencheront un
   avertissement SmartScreen sous Windows et un refus de Gatekeeper sous macOS.

Une 1.0.0 suppose au minimum qu'un installateur ait été produit **et lancé** sur
chacune des trois plateformes visées.
