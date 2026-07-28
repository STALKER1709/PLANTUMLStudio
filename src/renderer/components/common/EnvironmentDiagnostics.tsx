import type { EnvironmentStatus } from '../../../shared/types';
import { useTranslation } from '../../i18n';

export interface EnvironmentDiagnosticsProps {
  status: EnvironmentStatus;
  onRetry(): void;
}

/** Écran bloquant affiché quand Java ou plantuml.jar manquent. */
export function EnvironmentDiagnostics({ status, onRetry }: EnvironmentDiagnosticsProps) {
  const { t } = useTranslation();

  return (
    <div className="diagnostics">
      <h1>{t('env.title')}</h1>

      <ul>
        <li>
          <strong>{t('env.java')}</strong> :{' '}
          {status.javaAvailable
            ? `${status.javaVersion ?? '?'} (${status.javaIsEmbedded ? t('env.embedded') : t('env.system')})`
            : t('env.missing')}
        </li>
        <li>
          <strong>{t('env.engine')}</strong> :{' '}
          {status.plantumlJarAvailable ? status.plantumlJarPath : t('env.missing')}
        </li>
        <li>
          <strong>{t('env.layout')}</strong> : {status.layoutEngine}
        </li>
      </ul>

      {status.diagnostics.length > 0 && (
        <ul>
          {status.diagnostics.map((diagnostic) => (
            <li key={diagnostic}>{diagnostic}</li>
          ))}
        </ul>
      )}

      <p>{t('env.blocked')}</p>

      <button type="button" className="primary" onClick={onRetry}>
        {t('env.retry')}
      </button>
    </div>
  );
}

export interface EnvironmentBannerProps {
  status: EnvironmentStatus;
  onDismiss(): void;
}

/** Bandeau non bloquant : l'application fonctionne, avec une réserve. */
export function EnvironmentBanner({ status, onDismiss }: EnvironmentBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="banner" role="status">
      <span>{status.diagnostics[0]}</span>
      <button type="button" onClick={onDismiss}>
        {t('common.close')}
      </button>
    </div>
  );
}
