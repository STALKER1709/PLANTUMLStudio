import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';

import { applyLayoutOffsets, type LayoutOffsets, type Point } from '../utils/diagramLayout';

interface DragState {
  id: string;
  /** Position de départ du pointeur, en coordonnées SVG. */
  origin: Point;
  /** Décalage déjà appliqué à l'élément avant ce glisser. */
  base: Point;
  /** `true` pour un participant : l'axe vertical porte la chronologie. */
  horizontal: boolean;
}

/** Témoin de la disposition appliquée, porté par le SVG rendu. */
const APPLIED_MARKER = 'data-puml-applied';

/** Éléments saisissables, quel que soit le type de diagramme. */
export const GRABBABLE = 'g[data-entity], g[data-participant]';

/** Écart maximal entre deux appuis pour qu'ils comptent comme un double clic. */
const DOUBLE_APPUI_MS = 400;

export interface DiagramEditingOptions {
  /** Conteneur du SVG rendu. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Rejoué à chaque rendu : le SVG est remplacé, les décalages réappliqués. */
  svgMarkup: string;
  offsets: LayoutOffsets;
  enabled: boolean;
  /** Facteur de zoom courant, pour convertir les pixels écran en unités SVG. */
  zoom: number;
  /** Appelé à l'appui, avant le premier mouvement : borne l'annulation. */
  onBeginMove(): void;
  onMove(id: string, offset: Point): void;
  /** Remet un élément à la place calculée par PlantUML (double-clic). */
  onReset(id: string): void;
}

/**
 * Rend le diagramme manipulable à la souris : chaque élément se saisit et se
 * déplace, les liens qui le touchent le suivent.
 *
 * Le SVG n'est pas reconstruit à chaque mouvement — seules les géométries
 * concernées sont réécrites, à partir de leur état d'origine mémorisé.
 */
export function useDiagramEditing({
  stageRef,
  svgMarkup,
  offsets,
  enabled,
  zoom,
  onBeginMove,
  onMove,
  onReset,
}: DiagramEditingOptions): void {
  const dragRef = useRef<DragState | null>(null);
  /** Dernier élément saisi, pour reconnaître un double appui. */
  const dernierAppui = useRef<{ id: string; temps: number } | null>(null);
  // Le glisser lit les décalages en cours sans réabonner ses écouteurs.
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const rootSvg = useCallback((): SVGSVGElement | null => {
    return stageRef.current?.querySelector('svg') ?? null;
  }, [stageRef]);

  /**
   * Signature de la disposition appliquée, déposée sur le SVG lui-même.
   *
   * Elle sert de témoin : si elle a disparu, c'est que React a reconstruit le
   * contenu du conteneur — ce qu'il fait au moindre re-rendu touchant
   * `dangerouslySetInnerHTML` — et que nos écritures dans le DOM sont parties
   * avec. Sans ce témoin, un simple zoom ou un déplacement de la vue effaçait
   * silencieusement tous les déplacements d'éléments.
   */
  const signature = useMemo(() => JSON.stringify(offsets), [offsets]);

  // Volontairement sans tableau de dépendances : la vérification a lieu après
  // chaque rendu, mais ne coûte qu'une lecture d'attribut tant que rien n'a
  // changé. En effet de disposition plutôt que d'effet simple, pour que la
  // correction précède la peinture et qu'aucun clignotement ne soit visible.
  useLayoutEffect(() => {
    const svg = rootSvg();
    if (!svg || svg.getAttribute(APPLIED_MARKER) === signature) return;

    applyLayoutOffsets(svg, offsets);
    svg.setAttribute(APPLIED_MARKER, signature);
  });

  useEffect(() => {
    const stage = stageRef.current;
    const svg = rootSvg();
    if (!stage || !svg) return undefined;

    svg.classList.toggle('editable', enabled);
    if (!enabled) return undefined;

    const handleDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Éléments et regroupements sont frères dans le SVG, et les seconds sont
      // dessinés en premier : cliquer une classe saisit la classe, cliquer le
      // fond d'un paquetage saisit le paquetage.
      const group = target?.closest<SVGGElement>(GRABBABLE);
      const participant = group?.getAttribute('data-participant');
      const id = group?.getAttribute('data-entity') ?? participant;
      if (!group || !id) return;

      // Le déplacement d'un élément prime sur le défilement de la vue.
      event.stopPropagation();
      event.preventDefault();

      // Double appui sur le même élément : il retrouve la place que PlantUML
      // lui avait donnée. La détection se fait ici et non sur `dblclick` :
      // `preventDefault()` ci-dessus supprime les événements souris de
      // compatibilité dont `dblclick` fait partie, qui ne serait jamais reçu.
      const maintenant = event.timeStamp;
      const precedent = dernierAppui.current;
      dernierAppui.current = { id, temps: maintenant };

      if (
        precedent !== null &&
        precedent.id === id &&
        maintenant - precedent.temps < DOUBLE_APPUI_MS &&
        offsetsRef.current[id] !== undefined
      ) {
        dernierAppui.current = null;
        onReset(id);
        return;
      }

      dragRef.current = {
        id,
        origin: { x: event.clientX, y: event.clientY },
        base: offsetsRef.current[id] ?? { x: 0, y: 0 },
        horizontal: participant !== null && participant !== undefined,
      };
      onBeginMove();
      group.classList.add('dragging');
      stage.setPointerCapture(event.pointerId);
    };

    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      event.stopPropagation();
      // Les distances écran deviennent des unités SVG : sans cela, un élément
      // suivrait mal le curseur dès que la vue est zoomée.
      const facteur = zoomRef.current || 1;
      onMove(drag.id, {
        x: drag.base.x + (event.clientX - drag.origin.x) / facteur,
        // Un participant de diagramme de séquence ne se règle qu'en abscisse :
        // l'axe vertical porte la chronologie des messages.
        y: drag.horizontal ? 0 : drag.base.y + (event.clientY - drag.origin.y) / facteur,
      });
    };

    const handleUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      dragRef.current = null;
      svg.querySelectorAll('.dragging').forEach((element) => element.classList.remove('dragging'));
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    };

    stage.addEventListener('pointerdown', handleDown, true);
    stage.addEventListener('pointermove', handleMove, true);
    stage.addEventListener('pointerup', handleUp, true);
    stage.addEventListener('pointercancel', handleUp, true);

    return () => {
      stage.removeEventListener('pointerdown', handleDown, true);
      stage.removeEventListener('pointermove', handleMove, true);
      stage.removeEventListener('pointerup', handleUp, true);
      stage.removeEventListener('pointercancel', handleUp, true);
    };
  }, [enabled, svgMarkup, stageRef, rootSvg, onBeginMove, onMove, onReset]);
}
