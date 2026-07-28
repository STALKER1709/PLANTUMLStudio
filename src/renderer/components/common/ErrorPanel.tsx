import type { PlantUMLError } from '../../../shared/types';
import { useTranslation } from '../../i18n';

export interface ErrorPanelProps {
  errors: PlantUMLError[];
  /** Saut direct à la ligne fautive dans l'éditeur. */
  onGotoLine(line: number): void;
}

export function ErrorPanel({ errors, onGotoLine }: ErrorPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="error-panel" role="alert" aria-live="polite">
      <h3>{t('errors.title')}</h3>
      <ul>
        {errors.map((error, index) => (
          <li key={`${error.raw}-${index}`}>
            {error.line !== undefined && (
              <button
                type="button"
                className="error-line-link"
                onClick={() => onGotoLine(error.line as number)}
              >
                {t('errors.gotoLine', { line: error.line })}
              </button>
            )}
            {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
