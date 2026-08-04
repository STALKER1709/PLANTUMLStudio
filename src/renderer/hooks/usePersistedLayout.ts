import { useEffect, useRef } from 'react';

import { useEditorStore } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';

/**
 * Délai avant d'écrire la disposition sur disque.
 *
 * Un déplacement à la souris produit un flot d'états intermédiaires ; écrire à
 * chacun réécrirait le fichier projet des dizaines de fois par seconde. On
 * attend que la main se soit arrêtée.
 */
const ECRITURE_DEBOUNCE_MS = 600;

/**
 * Conserve dans le projet la disposition retouchée du fichier ouvert.
 *
 * Les déplacements ne vont pas dans le `.puml` : la source reste un fichier
 * PlantUML valide, lisible par n'importe quel autre outil. Ils vont dans le
 * `.plantumlproj`, indexés par chemin relatif.
 *
 * Deux situations n'ont rien à enregistrer, et ce n'est pas une erreur : un
 * brouillon jamais enregistré, et un fichier ouvert hors du projet courant.
 */
export function usePersistedLayout(): void {
  const filePath = useEditorStore((state) => state.filePath);
  const layoutOffsets = useEditorStore((state) => state.layoutOffsets);
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);

  /**
   * Dernière disposition écrite, par fichier.
   *
   * Sans cette mémoire, l'ouverture d'un fichier réécrirait aussitôt ce qu'on
   * vient de lui charger, et le premier rendu d'un diagramme sans déplacement
   * effacerait l'entrée d'un autre.
   */
  const dernierEcrit = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!filePath || !project) return;

    const signature = JSON.stringify(layoutOffsets);
    if (dernierEcrit.current.get(filePath) === signature) return;

    const minuterie = setTimeout(() => {
      dernierEcrit.current.set(filePath, signature);
      void window.electronAPI.saveLayout(filePath, layoutOffsets).then((resultat) => {
        // Le projet renvoyé porte la table à jour : le garder évite de relire
        // le fichier au prochain changement de diagramme.
        if (resultat.ok && resultat.data) setProject(resultat.data);
      });
    }, ECRITURE_DEBOUNCE_MS);

    return () => clearTimeout(minuterie);
  }, [filePath, layoutOffsets, project, setProject]);
}
