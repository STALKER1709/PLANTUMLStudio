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
| `linetype polyline` | connecteurs en segments droits, brisés là où il le faut |

### Pourquoi `polyline` plutôt que `ortho`

Le routage orthogonal (`linetype ortho`) donne des connecteurs à angles droits, comme
PowerAMC ou Visual Paradigm. Il a un défaut mesurable : il aligne les liens sur des **couloirs
communs**, si bien que plusieurs flèches se superposent au point de n'en former qu'une à
l'œil.

Mesure sur 128 liens répartis dans 17 diagrammes — les 14 modèles livrés et trois diagrammes
denses (10 classes et 14 relations, 3 acteurs et 14 relations, 7 états et 12 transitions) :

| Routage | Croisements | Frôlements (< 6 unités) | Traversées d'élément |
| --- | --- | --- | --- |
| `ortho`, `nodesep 70` | 9 | 5 | 0 |
| **`polyline`, `nodesep 90`** | **6** | **4** | 0 |

Un tiers de croisements en moins, sans rien perdre par ailleurs : c'est `polyline` qui est
appliqué. Pour retrouver les angles droits, remplacez `polyline` par `ortho` dans
`templates/_formalisme.puml` — ou dans le modèle concerné, qui recopie le réglage en clair.

### Routage et Graphviz

`linetype` n'est honoré que par **Graphviz**. Sans lui, le moteur Smetana ignore la
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
| `nodesep 90` / `ranksep 110` | écarte les rangs : sans marge, les traits se touchent | formalisme commun |
| `linetype polyline` | connecteurs en segments droits, sans couloirs partagés | formalisme commun |
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

## 1 ter. Éditer le rendu

La disposition calculée peut être retouchée **à la souris**, sans toucher au texte.

Le bouton **« Éditer »** de la prévisualisation rend les éléments saisissables : un glisser
déplace une classe, un acteur ou un cas d'utilisation, et les liens qui l'atteignent sont
réécrits pour rester accrochés. Le compteur voisin indique le nombre de déplacements et les
annule tous d'un clic.

Ce que cela suppose, et ce que cela implique :

- **PlantUML annote son SVG.** Chaque élément y porte son identifiant de source
  (`data-entity`), chaque lien ses deux extrémités. Les déplacements sont donc indexés par
  identifiant : ils **survivent aux régénérations** du diagramme tant que l'élément garde son
  nom dans la source.
- **Tout élément identifié est déplaçable** : classes, objets, acteurs, cas d'utilisation,
  composants, artefacts, nœuds, notes, états — et les **regroupements** eux-mêmes, paquetages
  et nœuds de déploiement, qu'on saisit par leur bandeau de titre ou par un point vide de leur
  cadre. Les états ne recevant qu'un attribut `id`, l'application leur pose l'identifiant que
  leurs liens utilisent déjà.
- **L'héritage des déplacements.** Déplacer un paquetage emporte tout ce qu'il contient, y
  compris les paquetages imbriqués et leur propre contenu. Le SVG de PlantUML étant plat — un
  paquetage et ses classes y sont frères, sans lien de parenté déclaré —, l'emboîtement est
  déduit de la géométrie : le contenant retenu est le **plus petit** de ceux qui englobent
  l'élément. Un élément déjà déplacé à la main conserve son décalage propre, qui **s'ajoute** à
  celui de son contenant. Un lien dont les deux extrémités subissent le même déplacement — cas
  d'un lien interne à un paquetage — est emmené tel quel : le tracé calculé par PlantUML est
  conservé.
- **Le cadre d'un paquetage ne se redimensionne pas.** Sortir une classe de son paquetage la
  montre à l'extérieur du cadre, alors que la source l'y place toujours. C'est un choix : le
  déplacement demandé est respecté, pas réinterprété.
- **La source n'est jamais modifiée.** Les déplacements vivent à côté d'elle, le temps de la
  session ; ils ne sont pas enregistrés dans le `.puml`.
- **Les flèches sont recalculées, pas déformées.** Dès qu'une de ses extrémités bouge, le lien
  est retracé en ligne droite d'une bordure à l'autre : il s'ancre donc toujours du bon côté,
  y compris lorsqu'un élément passe à l'opposé de sa cible. Le point d'arrivée suit le contour
  réel — ovale pour un cas d'utilisation, rectangle sinon. Pointes de flèche et losanges sont
  réorientés par un déplacement rigide, sans changement de taille, et l'étiquette se replace au
  milieu du nouveau segment.
- **Les tracés déviés ne se touchent pas.** Un lien recalculé qui traverserait un autre élément
  est dévié : le contournement passe par un ou deux points de dégagement, à 14 unités du bord,
  et c'est le plus court des détours dégagés qui est retenu. Lorsqu'aucun détour n'est libre —
  élément cerné —, le segment direct est conservé plutôt qu'un contournement qui traverserait
  lui aussi. Deux liens qui relient la **même paire** d'éléments sont écartés symétriquement de
  l'axe, faute de quoi ils se superposeraient exactement.
- **Un élément posé sur un lien le fait dévier**, même si les deux extrémités de ce lien sont
  restées en place : la collision est cherchée sur l'enveloppe de la courbe d'origine, ce qui
  ne manque jamais un chevauchement réel.
- **Le contournement calculé par PlantUML est perdu sur les liens déplacés.** Une courbe qui
  évitait élégamment plusieurs obstacles devient une polyligne ; les liens que rien ne perturbe
  gardent en revanche exactement le tracé d'origine.
- **Le diagramme de séquence obéit à d'autres règles.** L'axe vertical y porte la chronologie :
  un participant ne se règle donc **qu'en abscisse**, ce que signale le curseur. Sa tête, son
  pied et sa ligne de vie se déplacent ensemble ; les messages restent accrochés, chaque
  extrémité suivant la ligne de vie dont elle est la plus proche — un message s'allonge du
  côté déplacé sans que sa pointe de flèche quitte sa cible.
- **Les diagrammes d'activité ne sont pas manipulables.** PlantUML n'y annote aucun élément :
  rien ne permet de rattacher une forme du SVG à une instruction de la source. Leur disposition
  se règle par le texte (`-[hidden]->`, `together`, ordre des déclarations).
- **L'export suit ce que vous voyez.** Dès qu'un déplacement existe, « Exporter » écrit le
  rendu affiché — SVG et PDF depuis le texte SVG, PNG rastérisé par l'application — au lieu de
  régénérer depuis la source.
- **La zone visible s'agrandit** pour accueillir un élément tiré au-delà du cadre calculé.

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
