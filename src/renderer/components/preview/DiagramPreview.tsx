import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../../shared/constants';
import { useDebouncedRender } from '../../hooks/useDebouncedRender';
import { GRABBABLE, useDiagramEditing } from '../../hooks/useDiagramEditing';
import { useTranslation } from '../../i18n';
import {
  indexEntities,
  indexLinks,
  type LayoutOffsets,
  type Point,
} from '../../utils/diagramLayout';
import {
  labelOf,
  looksLikeUseCase,
  parseUseCaseDiagram,
  redundantAssociations,
  removeRedundantAssociations,
} from '../../derive/parseUseCase';
import { optimizeLayout, type OptimizeResult } from '../../utils/layoutOptimizer';
import { arrangeUseCaseColumns } from '../../utils/useCaseLayout';
import { readSvgSize, sanitizeSvg } from '../../utils/sanitizeSvg';
import { ErrorPanel } from '../common/ErrorPanel';
import { ZoomPanControls } from './ZoomPanControls';

export interface DiagramPreviewProps {
  pumlSource: string;
  debounceMs: number;
  enabled: boolean;
  /** Applique le formalisme commun au rendu. */
  applyFormalism: boolean;
  /** Déplacements appliqués aux éléments du diagramme. */
  layoutOffsets: LayoutOffsets;
  onMoveElement(id: string, offset: Point): void;
  /** Reçoit la disposition trouvée, et de quoi en rendre compte. */
  onOptimizeLayout(result: OptimizeResult): void;
  onResetLayout(): void;
  onGotoLine(line: number): void;
  /** Remplace la source par sa version corrigée. */
  onCorrectSource(source: string): void;
}

interface Offset {
  x: number;
  y: number;
}

export function DiagramPreview({
  pumlSource,
  debounceMs,
  enabled,
  applyFormalism,
  layoutOffsets,
  onMoveElement,
  onOptimizeLayout,
  onResetLayout,
  onGotoLine,
  onCorrectSource,
}: DiagramPreviewProps) {
  const { t } = useTranslation();
  const { svgContent, errors, isRendering, durationMs } = useDebouncedRender(
    pumlSource,
    debounceMs,
    enabled,
    applyFormalism
  );

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panOrigin = useRef<{ pointerX: number; pointerY: number; offset: Offset } | null>(null);

  // Le SVG n'est jamais injecté brut : voir `sanitizeSvg`.
  const safeSvg = useMemo(() => (svgContent ? sanitizeSvg(svgContent) : ''), [svgContent]);

  useDiagramEditing({
    stageRef,
    svgMarkup: safeSvg,
    offsets: layoutOffsets,
    enabled: isEditing,
    zoom,
    onMove: onMoveElement,
  });

  const deplacements = Object.keys(layoutOffsets).length;

  /**
   * Fautes de notation repérées dans la source, qui n'empêchent pas le rendu.
   *
   * Aujourd'hui une seule : une flèche vers un cas qu'un ancêtre porte déjà.
   * Le diagramme se génère, mais il porte un trait de trop.
   */
  const avertissements = useMemo(() => {
    const modele = parseUseCaseDiagram(pumlSource);
    if (!looksLikeUseCase(modele)) return [];

    return redundantAssociations(modele).map((redondance) => ({
      message: t('errors.redundantAssociation', {
        actor: labelOf(modele, redondance.actor),
        ancestor: labelOf(modele, redondance.ancestor),
        useCase: labelOf(modele, redondance.useCase),
      }),
      line: redondance.line,
      raw: `${redondance.actor} -- ${redondance.useCase}`,
    }));
  }, [pumlSource, t]);

  /**
   * Retire toutes les flèches redondantes en une fois.
   *
   * Chaque ligne retirée laisse à sa place un commentaire qui dit ce qui a été
   * enlevé et pourquoi : la correction reste lisible dans la source, et un
   * simple Ctrl+Z la défait puisqu'elle passe par l'éditeur.
   */
  const corrigerRedondances = useCallback(() => {
    const { source, removed } = removeRedundantAssociations(pumlSource, (retrait) =>
      t('errors.redundantRemoved', retrait)
    );
    if (removed.length === 0) return;
    onCorrectSource(source);
  }, [pumlSource, t, onCorrectSource]);

  const [isOptimizing, setIsOptimizing] = useState(false);

  /**
   * Cherche une disposition plus lisible, à partir de celle que PlantUML vient
   * de calculer et des déplacements déjà faits à la main.
   *
   * La recherche est synchrone et peut durer quelques centaines de
   * millisecondes : le rendu du bouton est laissé au navigateur avant de la
   * lancer, faute de quoi l'interface se figerait sans rien signaler.
   */
  const optimize = useCallback(() => {
    if (!stageRef.current?.querySelector('svg')) return;

    setIsOptimizing(true);
    requestAnimationFrame(() => {
      try {
        // Le SVG est retrouvé ici, et non avant : passer `isOptimizing` à vrai
        // provoque un rendu qui remplace le sous-arbre, et `getBBox` d'un nœud
        // détaché ne renvoie que des zéros — l'optimisation partirait alors de
        // boîtes vides, donc toutes superposées.
        const svg = stageRef.current?.querySelector('svg') as SVGSVGElement | null;
        if (!svg) return;

        const entities = indexEntities(svg);
        const modele = {
          nodes: Array.from(entities.values()).map((entity) => ({
            id: entity.id,
            box: entity.box,
            ellipse: entity.ellipse,
            container: entity.container,
          })),
          links: indexLinks(svg),
        };

        // Le formalisme impose une disposition aux diagrammes de cas
        // d'utilisation : acteurs principaux à gauche, secondaires à droite.
        // Elle est appliquée d'abord, puis figée — la recherche ne doit pas la
        // défaire pour gagner quelques unités de tracé.
        const casUtilisation = parseUseCaseDiagram(pumlSource);
        const range = looksLikeUseCase(casUtilisation)
          ? arrangeUseCaseColumns({
              boxes: new Map(modele.nodes.map((node) => [node.id, node.box])),
              primary: casUtilisation.actors
                .filter((acteur) => acteur.side !== 'secondary')
                .map((acteur) => acteur.id),
              secondary: casUtilisation.actors
                .filter((acteur) => acteur.side === 'secondary')
                .map((acteur) => acteur.id),
            })
          : {};

        const resultat = optimizeLayout(modele, { ...layoutOffsets, ...range }, {
          locked: new Set(Object.keys(range)),
        });
        onOptimizeLayout({ ...resultat, arranged: Object.keys(range).length });
      } finally {
        setIsOptimizing(false);
      }
    });
  }, [layoutOffsets, onOptimizeLayout, pumlSource, stageRef]);

  const changeZoom = useCallback((delta: number) => {
    setZoom((previous) => clamp(Number((previous + delta).toFixed(2)), ZOOM_MIN, ZOOM_MAX));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const fitToWindow = useCallback(() => {
    const canvas = canvasRef.current;
    const size = safeSvg ? readSvgSize(safeSvg) : null;
    if (!canvas || !size) return;

    const scale = Math.min(
      (canvas.clientWidth - 32) / size.width,
      (canvas.clientHeight - 32) / size.height
    );
    setZoom(clamp(Number(scale.toFixed(2)), ZOOM_MIN, ZOOM_MAX));
    setOffset({ x: 16, y: 16 });
  }, [safeSvg]);

  // Ctrl + molette : zoom, comme dans la plupart des outils de dessin.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [changeZoom]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // En mode édition, un appui sur un élément lui appartient : il le déplace
    // au lieu de faire glisser la vue entière.
    if (isEditing && (event.target as Element).closest(GRABBABLE)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panOrigin.current = { pointerX: event.clientX, pointerY: event.clientY, offset };
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = panOrigin.current;
    if (!origin) return;
    setOffset({
      x: origin.offset.x + (event.clientX - origin.pointerX),
      y: origin.offset.y + (event.clientY - origin.pointerY),
    });
  };

  const stopPanning = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panOrigin.current = null;
    setIsPanning(false);
  };

  return (
    <div className="diagram-preview">
      <div className="panel-header">
        <span>{t('panel.preview')}</span>
        <button
          type="button"
          className={isEditing ? 'primary' : undefined}
          aria-pressed={isEditing}
          disabled={!safeSvg}
          title={t('preview.editHint')}
          onClick={() => setIsEditing((actif) => !actif)}
        >
          {t('preview.edit')}
        </button>
        <button
          type="button"
          disabled={!safeSvg || isOptimizing}
          title={t('preview.optimizeHint')}
          onClick={optimize}
        >
          {t('preview.optimize')}
        </button>
        {deplacements > 0 && (
          <button type="button" onClick={onResetLayout} title={t('preview.resetLayout')}>
            ↺ {deplacements}
          </button>
        )}
        <ZoomPanControls
          zoom={zoom}
          onZoomIn={() => changeZoom(ZOOM_STEP)}
          onZoomOut={() => changeZoom(-ZOOM_STEP)}
          onReset={resetView}
          onFit={fitToWindow}
          disabled={!safeSvg}
        />
        {isRendering ? (
          <span className="spinner" role="status" aria-label={t('preview.rendering')} />
        ) : (
          durationMs !== null && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {t('preview.duration', { ms: durationMs })}
            </span>
          )
        )}
      </div>

      <div
        ref={canvasRef}
        className={`preview-canvas${isPanning ? ' panning' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
      >
        {safeSvg ? (
          <div
            ref={stageRef}
            className={`preview-stage${isEditing ? ' editing' : ''}`}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            // Contenu assaini par sanitizeSvg (voir utils/sanitizeSvg.ts)
            dangerouslySetInnerHTML={{ __html: safeSvg }}
          />
        ) : (
          !errors && <p className="empty-state">{t('preview.empty')}</p>
        )}
      </div>

      {((errors && errors.length > 0) || avertissements.length > 0) && (
        <ErrorPanel
          errors={errors ?? []}
          warnings={avertissements}
          onGotoLine={onGotoLine}
          onFixWarnings={avertissements.length > 0 ? corrigerRedondances : undefined}
        />
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
