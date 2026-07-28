import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export interface ThreePanelLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

const LEFT_MIN = 180;
const LEFT_MAX = 480;
const CENTER_MIN = 320;

/**
 * Disposition à trois panneaux redimensionnables (arborescence / éditeur /
 * prévisualisation). Les largeurs sont conservées en pixels : l'utilisateur
 * garde son réglage tant que la fenêtre reste ouverte.
 */
export function ThreePanelLayout({ left, center, right }: ThreePanelLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(560);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  const startDrag = useCallback(
    (handle: 'left' | 'right') => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(handle);
    },
    []
  );

  const onMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const container = containerRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();

      if (dragging === 'left') {
        const width = event.clientX - bounds.left;
        const maxWidth = Math.min(LEFT_MAX, bounds.width - rightWidth - CENTER_MIN);
        setLeftWidth(Math.max(LEFT_MIN, Math.min(width, Math.max(maxWidth, LEFT_MIN))));
        return;
      }

      const width = bounds.right - event.clientX;
      const maxWidth = bounds.width - leftWidth - CENTER_MIN;
      setRightWidth(Math.max(240, Math.min(width, Math.max(maxWidth, 240))));
    },
    [dragging, leftWidth, rightWidth]
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="three-panel app-body"
      style={{
        gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px`,
      }}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <section className="panel">{left}</section>

      <div
        className={`splitter${dragging === 'left' ? ' dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startDrag('left')}
      />

      <section className="panel">{center}</section>

      <div
        className={`splitter${dragging === 'right' ? ' dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startDrag('right')}
      />

      <section className="panel">{right}</section>
    </div>
  );
}
