import { useMemo, useState } from 'react';

import { analyzeText, type AnalysisLanguage, type Finding } from '../../analyze/analyzeText';
import { toAssistantValues, type AssistantPrefill } from '../../analyze/toAssistant';
import { useTranslation } from '../../i18n';

export interface AnalyzeDialogProps {
  open: boolean;
  onCancel(): void;
  /** Ouvre l'assistant sur le formulaire déduit du texte. */
  onOpenAssistant(prefill: AssistantPrefill): void;
}

/** Ordre d'affichage : le cadre, puis qui agit, puis ce qui se passe. */
const ORDRE: ReadonlyArray<Finding['kind']> = [
  'system',
  'actor',
  'inheritance',
  'useCase',
  'internalUseCase',
  'include',
  'extend',
];

/**
 * Analyse d'une description textuelle.
 *
 * Le parti pris tient en une phrase : l'analyse **propose**, elle ne conclut
 * pas. Chaque élément trouvé affiche la ligne et la phrase qui l'ont produit,
 * les phrases dont rien n'a été tiré restent visibles, et le seul bouton de
 * sortie mène au formulaire de l'assistant — jamais directement à une source.
 */
export function AnalyzeDialog({ open, onCancel, onOpenAssistant }: AnalyzeDialogProps) {
  const { t } = useTranslation();
  const [texte, setTexte] = useState('');
  const [langue, setLangue] = useState<'auto' | AnalysisLanguage>('auto');

  const analyse = useMemo(
    () => analyzeText(texte, langue === 'auto' ? undefined : langue),
    [texte, langue]
  );

  if (!open) return null;

  const groupes = ORDRE.map((kind) => ({
    kind,
    trouvailles: analyse.findings.filter((finding) => finding.kind === kind),
  })).filter((groupe) => groupe.trouvailles.length > 0);

  const exploitable = analyse.actors.length > 0;

  return (
    <div
      className="dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog analyse" role="dialog" aria-modal="true" aria-label={t('analyze.title')}>
        <p className="dialog-title">{t('analyze.title')}</p>

        <div className="analyse-corps">
          <div className="analyse-saisie">
            <label className="analyse-langue">
              {t('analyze.language')}
              <select
                value={langue}
                onChange={(event) => setLangue(event.target.value as 'auto' | AnalysisLanguage)}
              >
                <option value="auto">
                  {t('analyze.languageAuto', { detected: t(`analyze.lang.${analyse.language}`) })}
                </option>
                <option value="fr">{t('analyze.lang.fr')}</option>
                <option value="en">{t('analyze.lang.en')}</option>
              </select>
            </label>

            <textarea
              className="analyse-texte"
              value={texte}
              placeholder={t('analyze.placeholder')}
              aria-label={t('analyze.title')}
              onChange={(event) => setTexte(event.target.value)}
            />

            {/* Les tournures les mieux reconnues, montrées plutôt qu'imposées :
                rien n'oblige à les suivre, mais les suivre donne un meilleur
                résultat, et un débutant n'a aucun moyen de les deviner. */}
            <details className="analyse-exemples">
              <summary>{t('analyze.examplesTitle')}</summary>
              <ul>
                {['story', 'can', 'allow', 'inherits', 'external', 'includes'].map((forme) => (
                  <li key={forme}>{t(`analyze.example.${forme}`)}</li>
                ))}
              </ul>
            </details>
          </div>

          <div className="analyse-resultat">
            {groupes.length === 0 && <p className="analyse-vide">{t('analyze.nothing')}</p>}

            {groupes.map((groupe) => (
              <section key={groupe.kind} className="analyse-groupe">
                <h3>
                  {t(`analyze.kind.${groupe.kind}`)}
                  <span className="analyse-compte">{groupe.trouvailles.length}</span>
                </h3>
                <ul>
                  {groupe.trouvailles.map((finding, index) => (
                    <li key={`${finding.kind}-${finding.label}-${index}`}>
                      <span className="analyse-libelle">{finding.label}</span>
                      {/* La phrase d'origine est ce qui rend la proposition
                          vérifiable : sans elle, l'utilisateur devrait croire. */}
                      <span className="analyse-source" title={finding.sentence}>
                        {t('analyze.fromLine', { line: finding.line })} · {finding.sentence}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {analyse.ignored.length > 0 && (
              <section className="analyse-groupe analyse-ignorees">
                <h3>
                  {t('analyze.ignored')}
                  <span className="analyse-compte">{analyse.ignored.length}</span>
                </h3>
                <p className="analyse-aide">{t('analyze.ignoredHint')}</p>
                <ul>
                  {analyse.ignored.map((phrase, index) => (
                    <li key={`${phrase.line}-${index}`}>
                      <span className="analyse-source">
                        {t('analyze.fromLine', { line: phrase.line })} · {phrase.sentence}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <div className="dialog-actions">
          <span className="analyse-avertissement">{t('analyze.proposalOnly')}</span>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!exploitable}
            title={exploitable ? undefined : t('analyze.needActor')}
            onClick={() => onOpenAssistant(toAssistantValues(analyse))}
          >
            {t('analyze.toAssistant')}
          </button>
        </div>
      </div>
    </div>
  );
}
