import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../../shared/constants';
import { useDebouncedRender } from '../../hooks/useDebouncedRender';
import { useDiagramEditing } from '../../hooks/useDiagramEditing';
import { useTranslation } from '../../i18n';
import type { LayoutOffsets, Point } from '../../utils/diagramLayout';
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
  onResetLayout(): void;
  onGotoLine(line: number): void;
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
  onResetLayout,
  onGotoLine,
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
    if (isEditing && (event.target as Element).closest('g.entity[data-entity]')) return;
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

      {errors && errors.length > 0 && <ErrorPanel errors={errors} onGotoLine={onGotoLine} />}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
