import { useState } from 'react';

import type { DiagramFormat } from '../../../shared/types';
import { LANGUAGES, useTranslation, type Language } from '../../i18n';
import { useEditorStore, selectIsDirty } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import { svgToPngBase64 } from '../../utils/rasterize';
import type { AssistantPrefill } from '../../analyze/toAssistant';
import { AnalyzeDialog } from '../assistant/AnalyzeDialog';
import { AssistantDialog } from '../assistant/AssistantDialog';
import { DeriveDialog } from '../assistant/DeriveDialog';
import { DiagramTypeSelector } from '../common/DiagramTypeSelector';

const FORMATS: DiagramFormat[] = ['png', 'svg', 'pdf'];

export function Toolbar() {
  const { t } = useTranslation();
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  const [derivationOuverte, setDerivationOuverte] = useState(false);
  const [analyseOuverte, setAnalyseOuverte] = useState(false);
  /**
   * Formulaire déduit d'une analyse, et le compteur qui remonte l'assistant.
   *
   * Sans ce compteur, rouvrir l'assistant après une seconde analyse garderait
   * l'état de la première : le composant ne lit ses valeurs qu'au montage.
   */
  const [prefill, setPrefill] = useState<AssistantPrefill | null>(null);
  const [generation, setGeneration] = useState(0);

  const project = useProjectStore((state) => state.project);
  const openProject = useProjectStore((state) => state.openProject);
  const createProject = useProjectStore((state) => state.createProject);
  const saveCurrentFile = useProjectStore((state) => state.saveCurrentFile);
  const saveCurrentFileAs = useProjectStore((state) => state.saveCurrentFileAs);
  const refreshTree = useProjectStore((state) => state.refreshTree);

  const filePath = useEditorStore((state) => state.filePath);
  const content = useEditorStore((state) => state.content);
  const isDirty = useEditorStore(selectIsDirty);
  const openDraft = useEditorStore((state) => state.openDraft);
  const setContent = useEditorStore((state) => state.setContent);
  const layoutOffsets = useEditorStore((state) => state.layoutOffsets);

  const theme = useSettingsStore((state) => state.theme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const applyFormalism = useSettingsStore((state) => state.applyFormalism);
  const setApplyFormalism = useSettingsStore((state) => state.setApplyFormalism);
  const exportFormat = useSettingsStore((state) => state.exportFormat);
  const setExportFormat = useSettingsStore((state) => state.setExportFormat);

  /**
   * Écrit toutes les dérivations dans le projet ouvert.
   *
   * Un échec par fichier n'interrompt pas les autres : mieux vaut douze
   * diagrammes sur treize qu'un abandon au premier conflit de nom.
   */
  const enregistrerDerivations = async (fichiers: Array<{ name: string; content: string }>) => {
    const racine = project?.rootPath;
    if (!racine) return;

    let ecrits = 0;
    const echecs: string[] = [];
    for (const fichier of fichiers) {
      const resultat = await window.electronAPI.createFile(racine, fichier.name, fichier.content);
      if (resultat.ok) ecrits += 1;
      else echecs.push(fichier.name);
    }

    await refreshTree();
    useToastStore
      .getState()
      .push(
        echecs.length === 0 ? 'success' : 'error',
        echecs.length === 0
          ? t('derive.saved', { count: ecrits })
          : t('derive.savedPartly', { count: ecrits, failed: echecs.join(', ') })
      );
  };

  const exportDiagram = async () => {
    // Un diagramme retouché à la souris s'exporte tel qu'il est affiché :
    // le régénérer depuis la source perdrait les déplacements.
    const result =
      Object.keys(layoutOffsets).length > 0
        ? await exporterRenduAffiche()
        : await window.electronAPI.exportDiagram(content, exportFormat, applyFormalism);
    if (!result.ok) {
      if (result.error && !/annul/i.test(result.error)) {
        useToastStore.getState().push('error', t('toast.error', { message: result.error }));
      }
      return;
    }
    useToastStore
      .getState()
      .push('success', t('toast.exported', { path: result.data?.outputPath ?? '' }));
  };

  const exporterRenduAffiche = async () => {
    const svgElement = document.querySelector('.preview-stage svg');
    if (!svgElement) {
      return { ok: false, error: t('errors.unknown') };
    }

    const svg = new XMLSerializer().serializeToString(svgElement);
    const pngBase64 = exportFormat === 'png' ? await svgToPngBase64(svg) : undefined;
    return window.electronAPI.exportRendered(exportFormat, svg, pngBase64);
  };

  const exportProject = async () => {
    // Liste vide : le main process exporte alors tout le projet.
    const result = await window.electronAPI.exportProject([], exportFormat, applyFormalism);
    if (!result.ok) {
      if (result.error && !/annul/i.test(result.error)) {
        useToastStore.getState().push('error', t('toast.error', { message: result.error }));
      }
      return;
    }
    useToastStore
      .getState()
      .push('success', t('toast.exported', { path: result.data?.outputPath ?? '' }));
  };

  return (
    <header className="toolbar">
      <span className="group">
        <button type="button" onClick={() => void openProject()}>
          {t('toolbar.openProject')}
        </button>
        <button type="button" onClick={() => void createProject()}>
          {t('toolbar.createProject')}
        </button>
        <button type="button" onClick={() => openDraft()}>
          {t('toolbar.newFile')}
        </button>
      </span>

      <span className="group">
        {/* Un brouillon est enregistrable : « Enregistrer » demande alors
            sa destination, au lieu d'être inaccessible. */}
        <button
          type="button"
          className="primary"
          disabled={content.trim() === '' || (Boolean(filePath) && !isDirty)}
          onClick={() => void saveCurrentFile()}
          title="Ctrl+S"
        >
          {t('toolbar.save')}
        </button>
        <button
          type="button"
          disabled={content.trim() === ''}
          onClick={() => void saveCurrentFileAs()}
          title="Ctrl+Maj+S"
        >
          {t('toolbar.saveAs')}
        </button>
      </span>

      <span className="group">
        <select
          aria-label={t('toolbar.format')}
          value={exportFormat}
          onChange={(event) => setExportFormat(event.target.value as DiagramFormat)}
        >
          {FORMATS.map((format) => (
            <option key={format} value={format}>
              {format.toUpperCase()}
            </option>
          ))}
        </select>
        <button type="button" disabled={content.trim() === ''} onClick={() => void exportDiagram()}>
          {t('toolbar.export')}
        </button>
        <button type="button" disabled={!project} onClick={() => void exportProject()}>
          {t('toolbar.exportProject')}
        </button>
      </span>

      <span className="group">
        {/* L'assistant écrit la source à partir d'un formulaire : il évite
            d'avoir à connaître la syntaxe PlantUML. */}
        <button
          type="button"
          onClick={() => {
            setPrefill(null);
            setGeneration((precedent) => precedent + 1);
            setAssistantOuvert(true);
          }}
        >
          {t('assistant.open')}
        </button>
        {/* En amont de l'assistant : une description en français ou en anglais,
            dont on tire les acteurs et leurs cas — à valider dans le formulaire. */}
        <button type="button" title={t('analyze.hint')} onClick={() => setAnalyseOuverte(true)}>
          {t('analyze.open')}
        </button>
        {/* Dérive séquences, communications et classes d'analyse depuis le
            diagramme de cas d'utilisation ouvert. */}
        <button
          type="button"
          disabled={content.trim() === ''}
          title={t('derive.hint')}
          onClick={() => setDerivationOuverte(true)}
        >
          {t('derive.open')}
        </button>
        <DiagramTypeSelector isDirty={isDirty} onInsert={setContent} />
        {/* Le formalisme s'applique à toute source, y compris saisie à la main. */}
        <button
          type="button"
          className={applyFormalism ? 'primary' : undefined}
          aria-pressed={applyFormalism}
          title={t('toolbar.formalismHint')}
          onClick={() => setApplyFormalism(!applyFormalism)}
        >
          {t('toolbar.formalism')}
        </button>
      </span>

      <span className="spacer" />

      <span className={`file-name${isDirty ? ' dirty' : ''}`} title={filePath ?? undefined}>
        {filePath ?? t('toolbar.noFile')}
      </span>

      <span className="group">
        <button type="button" onClick={toggleTheme} title={t('toolbar.theme')}>
          {theme === 'dark' ? `🌙 ${t('toolbar.themeDark')}` : `☀️ ${t('toolbar.themeLight')}`}
        </button>
        <select
          aria-label={t('toolbar.language')}
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
        >
          {LANGUAGES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>

      <DeriveDialog
        open={derivationOuverte}
        source={content}
        projectPath={project?.rootPath ?? null}
        onCancel={() => setDerivationOuverte(false)}
        onInsert={(derive) => {
          setContent(derive);
          setDerivationOuverte(false);
        }}
        onSaveAll={(fichiers) => {
          void enregistrerDerivations(fichiers);
          setDerivationOuverte(false);
        }}
      />

      <AnalyzeDialog
        open={analyseOuverte}
        onCancel={() => setAnalyseOuverte(false)}
        onOpenAssistant={(depuisLeTexte) => {
          setPrefill(depuisLeTexte);
          setGeneration((precedent) => precedent + 1);
          setAnalyseOuverte(false);
          setAssistantOuvert(true);
        }}
      />

      <AssistantDialog
        key={generation}
        open={assistantOuvert}
        isDirty={isDirty}
        prefill={prefill}
        onCancel={() => setAssistantOuvert(false)}
        onInsert={(source) => {
          setContent(source);
          setAssistantOuvert(false);
        }}
      />
    </header>
  );
}
