import type { DiagramFormat } from '../../../shared/types';
import { LANGUAGES, useTranslation, type Language } from '../../i18n';
import { useEditorStore, selectIsDirty } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToastStore } from '../../store/toastStore';
import { DiagramTypeSelector } from '../common/DiagramTypeSelector';

const FORMATS: DiagramFormat[] = ['png', 'svg', 'pdf'];

export function Toolbar() {
  const { t } = useTranslation();

  const project = useProjectStore((state) => state.project);
  const openProject = useProjectStore((state) => state.openProject);
  const createProject = useProjectStore((state) => state.createProject);
  const saveCurrentFile = useProjectStore((state) => state.saveCurrentFile);

  const filePath = useEditorStore((state) => state.filePath);
  const content = useEditorStore((state) => state.content);
  const isDirty = useEditorStore(selectIsDirty);
  const openDraft = useEditorStore((state) => state.openDraft);
  const setContent = useEditorStore((state) => state.setContent);

  const theme = useSettingsStore((state) => state.theme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const applyFormalism = useSettingsStore((state) => state.applyFormalism);
  const setApplyFormalism = useSettingsStore((state) => state.setApplyFormalism);
  const exportFormat = useSettingsStore((state) => state.exportFormat);
  const setExportFormat = useSettingsStore((state) => state.setExportFormat);

  const exportDiagram = async () => {
    const result = await window.electronAPI.exportDiagram(content, exportFormat, applyFormalism);
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
        <button
          type="button"
          className="primary"
          disabled={!filePath || !isDirty}
          onClick={() => void saveCurrentFile()}
          title="Ctrl+S"
        >
          {t('toolbar.save')}
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
    </header>
  );
}
