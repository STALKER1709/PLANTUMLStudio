# Construire et diffuser l'application

Ce document dit ce qui a été **réellement construit et vérifié**, et ce qui ne
l'a pas été. La distinction compte : un installateur qu'on n'a jamais lancé
n'est pas un installateur qui marche.

## État par plateforme

| Plateforme | Commande | État |
| --- | --- | --- |
| Linux | `npm run package:linux` | **Construit et mesuré** — voir le détail ci-dessous |
| Windows | `npm run package:win` | **Non vérifié** — jamais exécuté ici (demande Wine ou une machine Windows) |
| macOS | `npm run package:mac` | **Non vérifié** — demande une machine macOS |

### Détail de la construction Linux

Vérifié en version 0.9.0, sur cette base de code :

| Cible | Résultat |
| --- | --- |
| `.deb` | 119 Mo, produit |
| AppImage | 119 Mo, produit |
| `.rpm` | **échoue** : `Need executable 'rpmbuild' to convert dir to rpm` |

La cible `.rpm` n'est pas cassée : `electron-builder` délègue à `fpm`, qui a
besoin de `rpmbuild` sur la machine de construction. Un `sudo apt-get install
rpm` suffit. Comme les trois cibles sont demandées ensemble, l'absence de
`rpmbuild` **interrompt la construction après le `.deb`** et l'AppImage n'est
jamais produit — d'où l'intérêt de construire une cible à la fois si l'une
manque :

```bash
npx electron-builder --linux deb
npx electron-builder --linux AppImage
```

Répartition du poids, mesurée dans le `.deb` :

| Élément | Taille |
| --- | --- |
| Paquet complet | 119 Mo |
| dont `plantuml.jar` | 22,6 Mo |
| dont `app.asar` (code applicatif) | 18,9 Mo |

## Avant de construire

```bash
npm install
npm run resources:plantuml   # obligatoire : le moteur
npm run resources:jre        # optionnel : JRE embarqué pour la plateforme courante
npm run build                # compile main, preload et renderer
```

Sans `resources/plantuml.jar`, l'application démarre sur son écran de
diagnostic : elle ne peut rien rendre.

### Le JRE embarqué n'a pas été éprouvé

`npm run resources:jre` télécharge un JRE Temurin depuis Adoptium et le place
dans `resources/jre/`. Ce script **n'a jamais abouti** dans l'environnement de
développement utilisé, les serveurs d'Adoptium y étant inaccessibles.

Ce que cela veut dire concrètement : `EnvironmentService` sait chercher un java
embarqué avant `JAVA_HOME` puis le `PATH`, et cette logique est couverte par des
tests unitaires — mais le téléchargement lui-même reste à vérifier au premier
usage. Sans JRE embarqué, l'application exige un Java 11+ installé sur la
machine cible.

## L'échec `EPERM` sous Windows

Un `EPERM: operation not permitted, rename 'release\win-unpacked.tmp' ->
'release\win-unpacked'` a été rapporté lors d'un `npm run package:win`. Il n'a
pas pu être reproduit ici — la construction Windows n'a jamais été lancée depuis
cet environnement. Ce qui suit relève donc de pistes, non d'un diagnostic
vérifié. Les trois causes habituelles de ce message :

1. **Synchronisation cloud du dossier de travail.** OneDrive, Dropbox ou Google
   Drive gardent des poignées ouvertes sur les fichiers pendant leur
   synchronisation, ce qui fait échouer le renommage d'un dossier entier. Un
   projet situé sous `Documents\GitHub` est très souvent synchronisé.
   → Déplacer le dépôt hors du dossier synchronisé, par exemple `C:\dev\`.
2. **Analyse antivirus en temps réel.** Defender ouvre les fichiers fraîchement
   écrits pour les inspecter, au moment précis où electron-builder les renomme.
   → Exclure le dossier `release\` de l'analyse en temps réel.
3. **Droits de création de liens symboliques.** electron-builder en crée pour
   certaines cibles ; sans le privilège correspondant, l'opération échoue.
   → Activer le mode développeur de Windows, ou lancer la construction depuis un
   terminal élevé.

Dans tous les cas, supprimer le dossier `release\` avant de relancer : un
`win-unpacked` laissé par une tentative précédente suffit à reproduire l'échec.

**À ne pas faire :** `npm audit fix --force`. Cette commande installe des
versions majeures incompatibles de `electron-builder` et de ses dépendances, et
remplace un problème de droits par une chaîne de build cassée.

## Signature et notarisation

Aucune n'est en place, et c'est un choix par défaut plutôt qu'une décision :

- **Windows** — sans certificat Authenticode, SmartScreen affichera « Windows a
  protégé votre ordinateur » au premier lancement. L'utilisateur peut passer
  outre par « Informations complémentaires » → « Exécuter quand même ».
- **macOS** — sans identifiant de développeur ni notarisation, Gatekeeper
  refusera l'ouverture. Le contournement est un clic droit → « Ouvrir », puis une
  confirmation.

Les deux se règlent par l'achat d'un certificat et l'ajout de la configuration
correspondante dans `electron-builder`. Tant que la diffusion se fait de la main
à la main, l'avertissement est un inconvénient, pas un obstacle.

## Diffusion hors ligne

Il n'y a aucune mise à jour automatique : elle supposerait un accès réseau, que
l'application s'interdit. La diffusion se fait par installateur transmis hors
ligne — clé USB, partage local.

`scripts/download-plantuml.js` affiche l'empreinte SHA-256 du JAR téléchargé.
Conservez-la : c'est de quoi vérifier l'intégrité d'un paquet transmis par un
canal auquel on ne fait pas confiance.

## Licences des composants tiers

- PlantUML : LGPL / GPL / MIT selon la distribution retenue
- Eclipse Temurin (JRE) : GPLv2 with Classpath Exception
- Graphviz : Eclipse Public License 1.0
- Monaco Editor, React, Electron : MIT

Vérifiez ces conditions avant toute redistribution commerciale.
