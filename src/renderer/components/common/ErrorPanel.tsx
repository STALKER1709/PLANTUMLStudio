import type { PlantUMLError } from '../../../shared/types';
import { useTranslation } from '../../i18n';

export interface ErrorPanelProps {
  errors: PlantUMLError[];
  /**
   * Signalements qui n'empêchent pas la génération : le diagramme s'affiche,
   * mais quelque chose y contrevient au formalisme.
   */
  warnings?: PlantUMLError[];
  /** Saut direct à la ligne fautive dans l'éditeur. */
  onGotoLine(line: number): void;
  /**
   * Corrige d'un clic tout ce que les avertissements signalent.
   *
   * Absent quand rien n'est corrigeable automatiquement : le bouton n'apparaît
   * alors pas, plutôt que d'être affiché inerte.
   */
  onFixWarnings?(): void;
}

export function ErrorPanel({
  errors,
  warnings = [],
  onGotoLine,
  onFixWarnings,
}: ErrorPanelProps) {
  const { t } = useTranslation();
  const bloquant = errors.length > 0;

  return (
    <div
      className={`error-panel${bloquant ? '' : ' warnings-only'}`}
      role={bloquant ? 'alert' : 'status'}
      aria-live="polite"
    >
      {bloquant && (
        <>
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
        </>
      )}

      {warnings.length > 0 && (
        <>
          <h3 className="warnings-title">
            {t('errors.warningsTitle')}
            {onFixWarnings && (
              <button
                type="button"
                className="warnings-fix"
                title={t('errors.fixRedundanciesHint')}
                onClick={onFixWarnings}
              >
                {t('errors.fixRedundancies', { count: warnings.length })}
              </button>
            )}
          </h3>
          <ul>
            {warnings.map((warning, index) => (
              <li key={`${warning.raw}-${index}`}>
                {warning.line !== undefined && (
                  <button
                    type="button"
                    className="error-line-link"
                    onClick={() => onGotoLine(warning.line as number)}
                  >
                    {t('errors.gotoLine', { line: warning.line })}
                  </button>
                )}
                {warning.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
