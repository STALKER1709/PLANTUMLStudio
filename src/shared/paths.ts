/**
 * Manipulation de chemins **sans dépendance Node** : ce module est compilé
 * aussi bien par tsc (main process) que par Vite (renderer), et les deux côtés
 * doivent s'accorder au caractère près sur la clef d'une disposition.
 *
 * Dupliquer ce calcul serait le meilleur moyen d'obtenir un projet qui
 * enregistre sous une clef et relit sous une autre.
 */

/** Ramène les séparateurs Windows à la forme POSIX, seule écrite dans le projet. */
function posix(chemin: string): string {
  return chemin.replace(/\\/g, '/');
}

/**
 * Clef d'un fichier dans les dispositions d'un projet.
 *
 * C'est le chemin **relatif** à la racine, en séparateurs POSIX : un projet
 * déplacé, partagé ou versionné doit retrouver ses dispositions, ce qu'un
 * chemin absolu interdirait, et un projet écrit sous Windows doit se relire
 * sous Linux.
 *
 * Rend `null` quand le fichier est hors du projet — cas d'un fichier ouvert
 * ailleurs, qui n'a rien à ranger là.
 */
export function layoutKey(rootPath: string, filePath: string): string | null {
  const racine = posix(rootPath).replace(/\/+$/, '');
  const fichier = posix(filePath);

  if (racine === '' || fichier === '') return null;

  const prefixe = `${racine}/`;
  // Comparaison insensible à la casse : sous Windows et macOS, le même fichier
  // se désigne indifféremment « C:\Projets » ou « c:\projets », et la clef ne
  // doit pas dépendre de la façon dont le chemin est arrivé.
  if (fichier.toLowerCase().startsWith(prefixe.toLowerCase())) {
    const relatif = fichier.slice(prefixe.length);
    return relatif === '' || relatif.startsWith('..') ? null : relatif;
  }

  return null;
}
