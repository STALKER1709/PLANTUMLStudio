import { ZOOM_MAX, ZOOM_MIN } from '../../../shared/constants';
import { useTranslation } from '../../i18n';

export interface ZoomPanControlsProps {
  zoom: number;
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  onFit(): void;
  disabled?: boolean;
}

export function ZoomPanControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  disabled = false,
}: ZoomPanControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="zoom-controls">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={disabled || zoom <= ZOOM_MIN}
        aria-label={t('preview.zoomOut')}
        title={t('preview.zoomOut')}
      >
        −
      </button>
      <span className="zoom-value">{Math.round(zoom * 100)} %</span>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={disabled || zoom >= ZOOM_MAX}
        aria-label={t('preview.zoomIn')}
        title={t('preview.zoomIn')}
      >
        +
      </button>
      <button type="button" onClick={onReset} disabled={disabled} title={t('preview.resetZoom')}>
        100 %
      </button>
      <button type="button" onClick={onFit} disabled={disabled} title={t('preview.fit')}>
        ⤢
      </button>
    </div>
  );
}
