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

## 1 bis. Créer un diagramme sans écrire de PlantUML

Le bouton **« Assistant »** de la barre d'outils ouvre un formulaire par type de diagramme :
on saisit les acteurs, les classes, les messages et leurs relations dans des champs, et
l'application écrit la source. Les 14 types sont couverts.

Trois principes :

- **Les listes liées évitent d'avoir à retenir les noms.** Un champ « De » ou « Vers » ne
  propose que les éléments déjà déclarés plus haut dans le formulaire — y compris ceux saisis
  dans une liste, comme les cas d'utilisation d'un acteur. Impossible de désigner un élément
  qui n'existe pas.
- **Le diagramme de cas d'utilisation se saisit par acteur.** Une ligne par acteur : son nom,
  son rôle (principal ou secondaire), de qui il hérite, et la liste de tout ce qu'il fait dans
  le système. Les associations et les généralisations en découlent ; il n'y a pas à les saisir
  séparément. Une dernière section reçoit les cas qu'aucun acteur ne déclenche lui-même, comme
  un « S'authentifier » atteint uniquement par des `<<include>>`.
- **Les identifiants sont dérivés des libellés.** « Réserver une prestation » devient
  `Reserver_une_prestation` : accents retirés, ponctuation remplacée, et un suffixe numérique
  si deux libellés se ressemblent au point de donner le même identifiant. La source reste donc
  lisible, et vous n'avez jamais à inventer d'alias.
- **L'aperçu de la source est mis à jour à chaque frappe.** On voit ce que produit ce que l'on
  saisit, ce qui fait de l'assistant un moyen d'apprendre la syntaxe autant que de s'en passer.

L'assistant écrit aussi les **recettes de disposition** décrites à la section suivante :
un diagramme de cas d'utilisation sort avec `left to right direction`, ses acteurs principaux
dans un `together`, et ses généralisations en `[norank]`. C'est du travail en moins, et le
piège du dernier point est évité d'office.

Aucun `skinparam` n'est écrit dans la source produite : le formalisme commun est appliqué au
rendu par `-config`, et l'y recopier le ferait apparaître deux fois.

Les sources produites par les 14 formulaires sont **générées par `plantuml.jar` à chaque
exécution des tests** : un formulaire qui écrirait une source invalide fait échouer la suite.

## 1 ter. Dériver les autres diagrammes des cas d'utilisation

Le bouton **« Dériver »** lit le diagramme de cas d'utilisation ouvert dans l'éditeur — écrit à
la main, collé ou produit par l'assistant — et en tire d'autres diagrammes.

### Ce qui se dérive, et pourquoi

Un diagramme de cas d'utilisation dit **qui fait quoi**, et quels cas s'appellent entre eux. Il
ne dit rien du **comment**, ni des données manipulées. Seules les dérivations qui se contentent
du « qui fait quoi » sont donc légitimes.

Les diagrammes produits suivent le **modèle d'analyse** de Jacobson, où un cas d'utilisation se
réalise par trois sortes d'objets : une **frontière** (ce que l'acteur manipule), un
**contrôle** (la logique du cas) et des **entités** (les données).

| Dérivation | Ce qui la fonde |
| --- | --- |
| Un **diagramme de séquence** par cas | acteurs associés au cas + frontière + contrôle ; les cas `<<include>>` deviennent des `ref` |
| Un **diagramme de communication** par cas | mêmes échanges, vus par les liens entre objets |
| Le **diagramme de classes d'analyse** | une frontière par acteur, un contrôle par cas, les accès et les `<<include>>` |
| La **vue d'ensemble des interactions** | l'enchaînement déduit des `<<include>>` et `<<extend>>` |

Les **généralisations d'acteurs sont suivies** : un acteur qui en spécialise un autre participe
aussi à ses cas, et apparaît donc dans les séquences correspondantes.

### Ce qui ne se dérive pas

| Diagramme | Raison |
| --- | --- |
| Classes de **conception** | attributs, méthodes et associations viennent du domaine, pas des cas |
| **États-transitions** | il décrit le cycle de vie d'un objet, absent des cas d'utilisation |
| **Activité** | il détaille le déroulement interne d'un cas ; les cas n'en donnent que le nom |
| Composants, déploiement, objets, temps, structure composite, profil | ils relèvent de l'architecture ou de l'exécution |

La boîte de dialogue affiche cette liste avec ses raisons : sans cela, l'absence d'un type
passerait pour une lacune de l'outil, alors qu'elle tient à ce que le diagramme de départ ne
contient pas.

### Ce que cela vous laisse à faire

**Aucun diagramme produit n'est fini.** Les classes *entité* — celles qui portent les données —
ne se déduisent de rien et restent à identifier ; le diagramme de classes d'analyse le rappelle
par une note. Les séquences donnent l'ossature frontière/contrôle, pas les échanges avec les
entités.

Chaque source dérivée est **générée par `plantuml.jar` à chaque exécution des tests**, y compris
celles tirées de la sortie de l'assistant : les deux moitiés de la chaîne doivent s'emboîter.

## 1 quater. Maîtriser la disposition

PlantUML calcule seul le placement. Trois leviers suffisent à obtenir une disposition proche
de celle d'un outil à placement manuel — les deux premiers sont déjà dans le formalisme commun,
le troisième s'écrit dans votre source.

| Levier | Effet | Où |
| --- | --- | --- |
| `nodesep 90` / `ranksep 110` | écarte les rangs : sans marge, les traits se touchent | formalisme commun |
| `linetype polyline` | connecteurs en segments droits, sans couloirs partagés | formalisme commun |
| `together { … }` | maintient un groupe d'éléments sur un même axe | votre source |
| `[norank]` sur un lien | dessine le lien sans le laisser imposer un rang | votre source |

### Un cas ne reçoit pas deux flèches d'acteurs qui s'héritent

La généralisation **donne déjà** à l'héritier les cas de son ancêtre. Lui redessiner une
flèche vers l'un d'eux ajoute un trait qui ne dit rien, et fait recevoir au cas deux flèches là
où une suffit. C'est une faute de notation, pas une question de goût.

```plantuml
Visiteur -- Consulter          ' le visiteur consulte
Client -- Réserver             ' le client réserve, et consulte AUSSI
Visiteur <|-[norank]- Client   ' …parce qu'il hérite, pas parce qu'on le redessine
```

La règle est appliquée des deux côtés :

- **L'assistant ne l'écrit jamais.** Le formulaire est organisé par acteur : chacun porte la
  liste de ses cas, et son ascendance. Un cas répété sous un héritier est retiré à la
  génération, et un commentaire dans la source dit lequel et pourquoi. La chaîne est remontée
  en entier : un cas tenu du grand-parent est tout aussi redondant.
- **Les diagrammes déjà écrits sont vérifiés.** Une flèche redondante est signalée sous
  l'aperçu, avec le numéro de ligne cliquable — le diagramme se génère, mais il porte un trait
  de trop.
- **La correction s'applique d'un clic.** Le bouton **« Corriger »**, à côté du signalement,
  retire toutes les flèches redondantes en une fois. Rien ne se fait dans votre dos : la
  correction part de vous, elle passe par l'éditeur, et **Ctrl+Z la défait**.

Chaque flèche retirée laisse un commentaire à sa place, à l'indentation d'origine :

```plantuml
' « Client » hérite de « Visiteur » : sa flèche vers « Consulter » a été retirée,
' l'héritage la lui donne déjà.
```

Une flèche qui disparaît sans explication se relit comme un oubli, et se réécrit à l'identique
six mois plus tard. Le commentaire coupe court à cela.

L'ancêtre le plus haut de la chaîne garde toujours la sienne — il n'a personne au-dessus de
lui pour la lui donner — donc un cas ne se retrouve jamais orphelin, quelle que soit la
profondeur de l'héritage.

Deux acteurs **sans lien d'héritage** peuvent en revanche exécuter le même cas : deux flèches
vers un cas unique, c'est licite, et rien n'est signalé.

### La disposition imposée aux diagrammes de cas d'utilisation

**Acteurs principaux à gauche, acteurs secondaires à droite, cas d'utilisation entre les deux.**
Trois leviers y concourent, et il en faut trois : aucun ne suffit seul.

| Levier | Ce qu'il garantit |
| --- | --- |
| Le **sens d'écriture** de l'association | le côté |
| `together { … }` | l'alignement des principaux sur un même axe |
| Le **rangement** appliqué au rendu (bouton « Optimiser ») | la position verticale |

#### Le sens d'écriture décide du côté

Sous `left to right direction`, Graphviz place la cible d'une association une colonne à droite
de sa source. Il suffit donc d'écrire l'association dans le bon sens :

```plantuml
Client -- UC          ' acteur principal   : à GAUCHE du cas
UC -- ServicePaiement ' acteur secondaire  : à DROITE du cas
```

Inverser une seule de ces lignes fait basculer l'acteur de l'autre côté du diagramme. C'est
mesurable : écrit `ServicePaiement -- UC`, le service de paiement remonte au-dessus des acteurs
principaux, à gauche.

#### Un acteur secondaire se dessine en rectangle

Un acteur secondaire est un **système**, pas une personne : API, service externe, robot de
conversation. La notation UML le représente par un rectangle stéréotypé, ce qui le distingue au
premier coup d'œil d'un acteur humain :

```plantuml
rectangle "Service de paiement" as Paiement <<actor>>
```

#### Ce que le source ne peut pas garantir

Le côté est acquis ; **la position verticale ne l'est pas**. Graphviz range les éléments d'une
colonne par minimisation des croisements, et aucune directive PlantUML ne contraint cet axe :
les acteurs secondaires atterrissent volontiers tout en bas, avec de longues diagonales qui
traversent le cadre. `together` sur eux n'y change rien.

C'est le bouton **« Optimiser »** qui ferme l'écart : sur un diagramme de cas d'utilisation, il
range d'abord les acteurs en deux colonnes — répartis régulièrement sur la hauteur du
diagramme, dans l'ordre de la source, qui est aussi celui de la chaîne de généralisations —
puis **fige ces positions** avant de chercher à réduire les défauts restants. Sans ce
verrouillage, la recherche défairait le rangement pour gagner quelques unités de tracé.

Le rangement passe par le même mécanisme de décalages que l'édition à la souris : il est donc
annulable d'un clic et conservé à l'export.

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

### Une conséquence de `style strictuml`

Ce réglage supprime le **pied** des diagrammes de séquence — la reprise des
participants sous les lignes de vie. UML ne l'exige pas, et son absence allège le
diagramme ; c'est néanmoins un effet à connaître, car il ne se déduit pas du nom du réglage.

## 1 quinquies. Éditer le rendu

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

## 1 sexies. Optimiser la disposition

Le bouton **« Optimiser »** de la prévisualisation cherche une disposition plus lisible et
l'applique sous forme de déplacements — les mêmes que ceux de l'édition à la souris, donc
annulables d'un clic et conservés à l'export.

### Ce qu'il optimise

La mise en page vient de Graphviz, qui raisonne sur le **graphe** : il minimise les croisements
avant de connaître les dimensions définitives des boîtes, et ne voit jamais la géométrie finale.
Il reste donc, après coup, des défauts visibles. L'optimisation part de cette mise en page et
évalue ce qui est **réellement dessiné** :

| Défaut | Ce qui est compté |
| --- | --- |
| Croisement | deux liens qui se coupent, sans partager d'extrémité |
| Frôlement | deux liens distants de moins de 8 unités sans se couper |
| Traversée | un lien qui entre dans un élément qu'il ne relie pas |
| Chevauchement | deux éléments qui se recouvrent, ou séparés de moins de 16 unités |

Un lien dont aucune extrémité n'a bougé est évalué sur **la courbe de PlantUML**, celle qui est
à l'écran ; les autres sur le segment qui les remplacera. Sans cette distinction, le score
compterait des croisements qui n'existent pas et manquerait ceux qui existent.

### Comment il cherche

Une recherche locale déterministe : à chaque passe, tous les déplacements candidats — huit
directions, trois amplitudes — sont évalués et **le meilleur** est appliqué ; on s'arrête dès
qu'aucun n'améliore le score.

L'esprit est de **réparer au moindre coût, jamais de reconstruire**. La mise en page de Graphviz
encode une hiérarchie — rangs, sens de lecture — que ce score ne sait pas voir : s'en écarter est
donc en soi une perte, facturée par un terme de déplacement. Et seul l'**allongement** des tracés
est pénalisé, jamais leur longueur absolue : facturer celle-ci reviendrait à récompenser le
tassement, et la recherche empilerait les éléments pour raccourcir les traits.

Les regroupements ne sont pas déplacés : ils emmèneraient leur contenu, et l'optimisation
reviendrait à faire glisser des pans entiers du diagramme.

### Ce que cela donne

Mesuré sur 17 diagrammes — les 14 modèles livrés et trois diagrammes denses — **11 défauts
tombent à 2**, en 206 ms cumulées, sans qu'aucun diagramme ne soit dégradé. Les diagrammes déjà
sans défaut ne sont pas touchés du tout.

Au-delà de 60 éléments, la recherche est abandonnée plutôt que de figer l'interface, et
l'application le dit.

## 2. Les 7 diagrammes du document

### 2.1 Cas d'utilisation — `08-diagramme-cas-utilisation.puml`

| Élément | Notation | PlantUML |
| --- | --- | --- |
| Acteur principal | personnage filaire, **à gauche** du système | `actor "Client" as C` |
| Acteur secondaire | rectangle stéréotypé, **à droite** du système | `rectangle "API" as A <<actor>>` |
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
