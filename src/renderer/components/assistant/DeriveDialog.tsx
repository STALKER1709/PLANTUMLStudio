import { useMemo, useState } from 'react';

import { NON_DERIVABLES, deriveAll } from '../../derive/derivations';
import { looksLikeUseCase, parseUseCaseDiagram } from '../../derive/parseUseCase';
import { useTranslation } from '../../i18n';

export interface DeriveDialogProps {
  open: boolean;
  /** Source de l'éditeur, censée être un diagramme de cas d'utilisation. */
  source: string;
  /** Dossier du projet ouvert, `null` s'il n'y en a pas. */
  projectPath: string | null;
  onInsert(source: string): void;
  onSaveAll(fichiers: Array<{ name: string; content: string }>): void;
  onCancel(): void;
}

/**
 * Dérivation des autres diagrammes depuis le diagramme de cas d'utilisation
 * ouvert dans l'éditeur.
 *
 * La boîte affiche aussi bien ce qui se dérive que ce qui ne se dérive pas :
 * sans cela, l'absence d'un type passerait pour une lacune de l'outil, alors
 * qu'elle tient à ce que le diagramme de départ ne contient pas.
 */
export function DeriveDialog({
  open,
  source,
  projectPath,
  onInsert,
  onSaveAll,
  onCancel,
}: DeriveDialogProps) {
  const { t } = useTranslation();
  const [choisi, setChoisi] = useState<string | null>(null);

  const model = useMemo(() => parseUseCaseDiagram(source), [source]);
  const derivations = useMemo(() => (looksLikeUseCase(model) ? deriveAll(model) : []), [model]);

  if (!open) return null;

  const courante = derivations.find((derivation) => derivation.id === choisi) ?? derivations[0];

  return (
    <div
      className="dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog assistant" role="dialog" aria-modal="true" aria-label={t('derive.title')}>
        <p className="dialog-title">{t('derive.title')}</p>

        {derivations.length === 0 ? (
          <p className="assistant-aide">{t('derive.notAUseCase')}</p>
        ) : (
          <>
            <p className="assistant-aide">
              {t('derive.summary', {
                actors: model.actors.length,
                useCases: model.useCases.length,
              })}
            </p>

            <div className="assistant-corps">
              <div className="assistant-sections derive-liste">
                {derivations.map((derivation) => (
                  <label
                    key={derivation.id}
                    className={`derive-choix${derivation.id === courante?.id ? ' actif' : ''}`}
                  >
                    <input
                      type="radio"
                      name="derivation"
                      checked={derivation.id === courante?.id}
                      onChange={() => setChoisi(derivation.id)}
                    />
                    <span>
                      <strong>{derivation.label}</strong>
                      <em>{derivation.note}</em>
                    </span>
                  </label>
                ))}

                <fieldset className="assistant-section">
                  <legend>{t('derive.notDerivable')}</legend>
                  <p className="assistant-aide">{t('derive.notDerivableWhy')}</p>
                  <ul className="derive-exclusions">
                    {NON_DERIVABLES.map((entree) => (
                      <li key={entree.label}>
                        <strong>{entree.label}</strong> — {entree.raison}
                      </li>
                    ))}
                  </ul>
                </fieldset>
              </div>

              <div className="assistant-apercu">
                <span className="assistant-apercu-titre">{t('assistant.preview')}</span>
                <pre>{courante?.source ?? ''}</pre>
              </div>
            </div>
          </>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          {derivations.length > 0 && (
            <>
              <button
                type="button"
                disabled={projectPath === null}
                title={projectPath === null ? t('derive.needProject') : undefined}
                onClick={() =>
                  onSaveAll(
                    derivations.map((derivation) => ({
                      name: `${derivation.id}.puml`,
                      content: derivation.source,
                    }))
                  )
                }
              >
                {t('derive.saveAll', { count: derivations.length })}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!courante}
                onClick={() => courante && onInsert(courante.source)}
              >
                {t('derive.insert')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
