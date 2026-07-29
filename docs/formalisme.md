# Formalisme des diagrammes

Ce document est la référence appliquée par les 14 modèles livrés dans `templates/`.

Il a deux origines :

- **Les 7 diagrammes décrits dans le document de formalisme fourni** (cas d'utilisation,
  activité, séquence, communication, classe, paquetage, état-transition). Leurs règles sont
  reprises telles quelles ; les citations entre guillemets proviennent de ce document.
- **Les 7 diagrammes restants de la norme UML 2.5**, absents du document. Leur formalisme a
  été défini par extension, en suivant la règle énoncée plus bas.

## 1. Conventions communes

Chaque modèle porte le même en-tête. Il n'est pas décoratif : chaque ligne traduit une règle.

### Palette

| Rôle | Couleur | Application |
| --- | --- | --- |
| Bordures et flèches | `#1E90FF` | tous les éléments et toutes les relations |
| Fond des éléments | `#D9F6FB` | classes, cas d'utilisation, activités, états, composants… |
| Têtes d'acteurs | `#FFF6B0` | acteurs de tous les diagrammes |
| Texte des éléments | `#10314A` | libellés à l'intérieur des formes |
| Conteneurs | transparent | cadre système, paquetages, nœuds, dossiers, cadres |
| Relations entre cas | `#8888EE` | `<<include>>` et `<<extend>>`, pour les distinguer des associations |

La règle structurante : **les conteneurs restent transparents, seuls les éléments qu'ils
portent sont colorés.** Un cadre système rempli écraserait visuellement les cas d'utilisation
qu'il contient.

### Réglages

```plantuml
<style>
root    { FontName "Segoe UI"  FontSize 12  LineColor #1E90FF  LineThickness 1.5 }
element { BackGroundColor #D9F6FB  LineColor #1E90FF  FontColor #10314A }
arrow   { LineColor #1E90FF  FontColor #333333 }
activityDiagram { circle { BackGroundColor #1E90FF  LineColor #1E90FF } }
stateDiagram    { circle { BackGroundColor #1E90FF  LineColor #1E90FF } }
</style>
skinparam shadowing false
skinparam actorBackgroundColor #FFF6B0
skinparam classAttributeIconSize 0
skinparam packageStyle folder
skinparam style strictuml
```

| Réglage | Règle correspondante |
| --- | --- |
| bloc `circle` des diagrammes d'activité et d'états | « L'état initial… est représenté par un cercle plein » — sans lui, le style général le rendrait creux |
| `classAttributeIconSize 0` | « représenté par son niveau d'accessibilité (+ pour public, - pour private, # pour protected) » — sans ce réglage PlantUML affiche des pastilles colorées à la place |
| `packageStyle folder` | « Il est représenté par un dossier avec son nom à l'intérieur. » |
| `style strictuml` | distingue visuellement message synchrone, asynchrone et retour |
| `shadowing false` | tracé net, sans ombre portée |
| `linetype ortho` | connecteurs à angles droits, comme dans PowerAMC ou Visual Paradigm |

### Tracés orthogonaux et Graphviz

`linetype ortho` n'est honoré que par **Graphviz**. Sans lui, le moteur Smetana ignore la
directive : les connecteurs restent courbes et le diagramme demeure correct, mais l'aspect
s'éloigne des outils de modélisation classiques. C'est la seule différence visuelle notable
entre les deux moteurs — raison pour laquelle Graphviz est recommandé sans être exigé.

### Application automatique

**Le formalisme n'a pas besoin d'être présent dans votre source.** L'application le passe à
PlantUML par l'option `-config`, qui applique un fichier de réglages à toute source rendue
sans la modifier : un diagramme écrit ou collé à la main sort donc dans le formalisme commun,
sans une ligne de `skinparam`.

Le fichier appliqué est `templates/_formalisme.puml`. La bascule **« Formalisme »** de la
barre d'outils le désactive à la demande — la source est alors rendue avec les réglages par
défaut de PlantUML. Le choix est mémorisé et vaut aussi pour les exports PNG, SVG, PDF et ZIP.

Les réglages que votre source déclare elle-même sont lus **après** ceux du fichier commun :
ils l'emportent donc. Un `skinparam actorStyle awesome` dans votre diagramme reste appliqué.

Les modèles livrés recopient malgré tout ces réglages en clair : chacun reste ainsi autonome,
y compris ouvert dans un autre outil PlantUML. Pour mutualiser dans vos propres fichiers,
copiez `templates/_formalisme.puml` à la racine de votre projet puis
`!include _formalisme.puml` — les inclusions sont autorisées dans le dossier du projet ouvert,
et nulle part ailleurs.

## 1 bis. Maîtriser la disposition

PlantUML calcule seul le placement. Trois leviers suffisent à obtenir une disposition proche
de celle d'un outil à placement manuel — les deux premiers sont déjà dans le formalisme commun,
le troisième s'écrit dans votre source.

| Levier | Effet | Où |
| --- | --- | --- |
| `nodesep 70` / `ranksep 110` | écarte les rangs : sans marge, les traits se touchent | formalisme commun |
| `linetype ortho` | connecteurs à angles droits | formalisme commun |
| `together { … }` | maintient un groupe d'éléments sur un même axe | votre source |
| `[norank]` sur un lien | dessine le lien sans le laisser imposer un rang | votre source |

### Aligner les acteurs d'un diagramme de cas d'utilisation

Deux pièges se conjuguent : les acteurs se dispersent au gré de leurs liens, et une
généralisation entre acteurs en extrait un de la colonne.

```plantuml
left to right direction

' 1. Les acteurs restent sur un même axe vertical.
together {
  actor "Visiteur" as Visiteur
  actor "Client inscrit" as Client
  actor "Administrateur" as Admin
}

' 2. La généralisation est dessinée sans imposer de rang :
'    sans [norank], le visiteur sort de la colonne.
Visiteur <|-[norank]- Client
```

Un acteur secondaire (service externe, API) reste **hors** du `together` : il se place alors
naturellement du côté opposé, comme dans la notation habituelle.

## 2. Les 7 diagrammes du document

### 2.1 Cas d'utilisation — `08-diagramme-cas-utilisation.puml`

| Élément | Notation | PlantUML |
| --- | --- | --- |
| Acteur | personnage filaire ; élément externe jouant un rôle | `actor "Client" as C` |
| Système | cadre délimitant l'espace étudié, nom en haut | `rectangle "Nom du système" { … }` |
| Cas d'utilisation | ellipse, libellé **verbe à l'infinitif + objet** | `usecase "Réserver une prestation" as UC` |
| Association | trait simple acteur ↔ cas | `C -- UC` |
| Relation | flèche à traits interrompus entre cas | `UC3 ..> UC4 : <<include>>` |
| Généralisation | flèche de l'acteur héritier vers l'hérité | `Visiteur <|-- Client` |

`<<include>>` marque une dépendance systématique, `<<extend>>` une possibilité étendue.

### 2.2 Activité — `11-diagramme-activite.puml`

| Élément | Notation | PlantUML |
| --- | --- | --- |
| État initial | cercle plein, **unique** dans le diagramme | `start` |
| Activité | rectangle aux coins arrondis | `:Déposer une demande;` |
| Transition | flèche portant le nom de l'évènement | `->` implicite entre activités |
| Décision | losange, oriente le flux selon un test | `if (…) then (oui) … else (non) … endif` |
| Couloir | colonne par acteur/objet, séparée par une droite verticale | `|Salarié|` |
| État final | fin du déroulement, plusieurs possibles | `stop` |

### 2.3 Séquence — `09-diagramme-sequence.puml`

Le temps se lit de haut en bas ; chaque colonne est une ligne de vie.

| Élément | Notation | PlantUML |
| --- | --- | --- |
| Ligne de vie d'un acteur | personnage + ligne pointillée | `actor "Utilisateur" as U` |
| Ligne de vie d'un objet | rectangle + ligne pointillée | `participant "ihm : InterfaceWeb" as UI` |
| Activation | rectangle sur la ligne de vie | `activate` / `deactivate` |
| Message synchrone | flèche à pointe pleine, met l'émetteur en attente | `A -> B : message()` |
| Message asynchrone | flèche à pointe fine, pas d'attente | `A ->> B : message()` |
| Message retour | trait interrompu, clôt l'activation | `B --> A : résultat` |
| Message récursif | flèche de l'objet vers lui-même | `A -> A : calculer()` |
| Opérateur `alt` | cadre à alternatives séparées par `else` | `alt … else … end` |

### 2.4 Communication — `10-diagramme-communication.puml`

PlantUML n'a pas de syntaxe dédiée : le diagramme est construit à partir d'un diagramme
d'objets, ce qui respecte à la lettre la notation décrite.

| Élément | Notation | PlantUML |
| --- | --- | --- |
| Rôle | rectangle, identifié `<nom de rôle> : <nom du type>` | `object "auth : ServiceAuth" as Auth` |
| Connecteur | trait plein reliant deux rôles | `UI --> Auth` |
| Message | porté au-dessus du lien, **numéroté**, flèche donnant le sens | `UI --> Auth : 2 : authentifier()` |

La numérotation hiérarchique (`2`, `2.1`, `2.2`) marque l'imbrication des appels.

### 2.5 Classe — `01-diagramme-classes.puml`

| Élément | Notation | PlantUML |
| --- | --- | --- |
| Classe | rectangle en **trois sections** : nom, attributs typés, opérations | `class Client { … }` |
| Attribut | `± nom : Type` | `- identifiant : UUID` |
| Méthode | `± nom() : TypeRetour` | `+ total() : Decimal` |
| Association | trait entre classes, multiplicités aux extrémités | `Client "1" -- "0..*" Commande` |
| Agrégation | losange **creux** côté agrégat | `LigneCommande o-- Produit` |
| Composition | losange **plein** ; la destruction de l'agrégat détruit les composants | `Commande *-- LigneCommande` |
| Héritage | flèche vers la classe mère | `Client <|-- ClientProfessionnel` |

### 2.6 Paquetage — `05-diagramme-paquetages.puml`

| Élément | Notation | PlantUML |
| --- | --- | --- |
| Paquetage | dossier portant son nom, imbricable, nom unique | `package "main" { … }` |
| Contenu | à l'intérieur, ou à l'extérieur relié par une flèche | éléments déclarés dans le bloc |
| Dépendance | trait interrompu fléché | `Ipc ..> Services` |

### 2.7 État-transition — `12-diagramme-etats-transitions.puml`

| Élément | Notation | PlantUML |
| --- | --- | --- |
| État | situation durable de l'objet | `state Brouillon` |
| Transition | évènement faisant passer d'un état à l'autre | `Validee --> Payee : encaisser()` |
| État initial | cercle plein | `[*] --> Brouillon` |
| État final | cercle plein entouré d'un cercle, plusieurs possibles | `Livree --> [*]` |

Gardes entre crochets (`[panier non vide]`), actions `entry /` et `exit /` attachées à l'état.

## 3. Les 7 diagrammes ajoutés

Aucun n'est décrit dans le document fourni. **Règle appliquée : reprendre le formalisme du
diagramme documenté le plus proche, et n'introduire de notation nouvelle que là où la norme
UML l'impose.** Chaque écart est signalé en commentaire dans le modèle concerné.

| Diagramme | Formalisme de référence | Extension retenue |
| --- | --- | --- |
| **Objets** (`02`) | Classe | Instance nommée `nomInstance : Classe` ; les liens reprennent la nature des associations, sans multiplicités |
| **Composants** (`03`) | Paquetage | Composant en rectangle ; interfaces fournies/requises en « boule et douille » ; regroupement en paquetages |
| **Déploiement** (`04`) | Composants | Nœud en cube (matériel ou environnement d'exécution) ; artefacts déployés à l'intérieur |
| **Structure composite** (`06`) | Composants | Cadre du classeur englobant ; parties nommées `nom : Type` ; **ports** en carrés sur la frontière ; connecteurs en traits pleins |
| **Profil** (`07`) | Classe | Métaclasse `<<metaclass>>`, stéréotype `<<stereotype>>` dont les attributs sont les valeurs marquées ; extension notée par une flèche d'héritage étiquetée `<<extend>>` |
| **Temps** (`13`) | État-transition | États repris du diagramme d'états ; axe horizontal du temps ; `robust` pour les états discrets, `concise` pour les états brefs |
| **Vue d'ensemble des interactions** (`14`) | Activité | Structure de contrôle du diagramme d'activité, mais chaque nœud est un renvoi `ref sd <nom>` vers un diagramme de séquence, jamais une action élémentaire |

### Limites assumées

Trois de ces diagrammes n'ont pas de syntaxe native dans PlantUML et sont **émulés** :

- **Communication** — construit sur un diagramme d'objets. Le nom du rôle apparaît dans un
  compartiment plutôt que souligné.
- **Profil** — construit sur un diagramme de classes. La flèche d'extension UML (triangle
  plein) est rendue par une flèche d'héritage étiquetée `<<extend>>`.
- **Vue d'ensemble des interactions** — construite sur un diagramme d'activité. Les cadres
  `ref` sont des nœuds d'activité portant la mention `ref sd …`.

Ces approximations sont visuellement fidèles et sémantiquement exactes, mais un outil UML
strict les considérerait comme des diagrammes de la famille support, pas comme le type visé.

## 4. Vérification

Les 14 modèles sont contrôlés automatiquement par `tests/unit/TemplateService.test.ts` :
présence et classement des 14 diagrammes, en-tête de formalisme dans chacun, et **génération
effective des 14** par plantuml.jar lorsque celui-ci est installé.

```bash
npm test
```
