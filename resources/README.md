# Ressources embarquées

Ce dossier contient les binaires nécessaires au fonctionnement hors ligne.
Ils ne sont **pas** versionnés (voir `.gitignore`) : récupérez-les avant de packager.

| Chemin | Rôle | Comment l'obtenir |
| --- | --- | --- |
| `plantuml.jar` | Moteur de rendu PlantUML | `npm run resources:plantuml` |
| `jre/<win\|mac\|linux>/` | JRE Temurin embarqué (optionnel) | `npm run resources:jre -- win mac linux` |
| `graphviz/<win\|mac\|linux>/bin/dot` | Mise en page des diagrammes | binaires officiels Graphviz, copiés manuellement |

## Installation sans accès réseau

Les deux scripts acceptent une source locale, pour une machine coupée d'Internet :

```bash
PLANTUML_JAR_FILE=/media/usb/plantuml.jar npm run resources:plantuml
JRE_ARCHIVE_FILE=/media/usb/OpenJDK21-jre_x64_windows.zip npm run resources:jre -- win
```

## Sans ces ressources

- **Sans JRE embarqué** : l'application cherche Java dans cet ordre — `JAVA_HOME`,
  le `PATH`, puis les dossiers d'installation habituels (`Program Files\Eclipse
  Adoptium\…`, `/usr/lib/jvm/…`, `/Library/Java/JavaVirtualMachines/…`).
  Java 11 ou supérieur est requis.
- **Graphviz installé mais hors du `PATH`** : c'est le comportement par défaut de
  l'installateur Windows officiel. `dot` est donc aussi cherché dans
  `Program Files\Graphviz\bin\`, y compris les dossiers versionnés
  (`Graphviz-15.1.0`), ainsi que dans `/usr/bin`, `/usr/local/bin` et
  `/opt/homebrew/bin`.
- **Sans Graphviz** : le moteur Smetana intégré à plantuml.jar prend le relais.
  Les diagrammes de classes, d'états et de composants restent générables, avec
  une mise en page légèrement différente.
- **Sans `plantuml.jar`** : aucun rendu n'est possible ; l'application affiche
  un écran de diagnostic expliquant la marche à suivre.

## Licences

- PlantUML : LGPL / GPL / MIT selon la distribution choisie — vérifiez le fichier
  de licence livré avec le JAR retenu.
- Eclipse Temurin : GPLv2 with Classpath Exception.
- Graphviz : Eclipse Public License 1.0.

Vérifiez ces conditions avant toute redistribution commerciale.
