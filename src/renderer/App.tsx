import { useCallback, useEffect, useState } from 'react';

import { EnvironmentBanner, EnvironmentDiagnostics } from './components/common/EnvironmentDiagnostics';
import { ToastStack } from './components/common/ToastStack';
import { MonacoEditor } from './components/editor/MonacoEditor';
import { FileTree } from './components/file-tree/FileTree';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Toolbar } from './components/layout/Toolbar';
import { DiagramPreview } from './components/preview/DiagramPreview';
import { useIpc } from './hooks/useIpc';
import { useTranslation } from './i18n';
import { useEditorStore } from './store/editorStore';
import { useProjectStore } from './store/projectStore';
import { useSettingsStore } from './store/settingsStore';
import { useToastStore } from './store/toastStore';
import { applyTheme } from './styles/themes';
import { countDefects, type OptimizeResult } from './utils/layoutOptimizer';

export function App() {
  const { t } = useTranslation();

  const theme = useSettingsStore((state) => state.theme);
  const debounceMs = useSettingsStore((state) => state.debounceMs);
  const autoRender = useSettingsStore((state) => state.autoRender);
  const applyFormalism = useSettingsStore((state) => state.applyFormalism);

  const content = useEditorStore((state) => state.content);
  const setContent = useEditorStore((state) => state.setContent);
  const revealLine = useEditorStore((state) => state.revealLine);
  const requestRevealLine = useEditorStore((state) => state.requestRevealLine);
  const consumeRevealLine = useEditorStore((state) => state.consumeRevealLine);
  const layoutOffsets = useEditorStore((state) => state.layoutOffsets);
  const moveElement = useEditorStore((state) => state.moveElement);
  const applyLayout = useEditorStore((state) => state.applyLayout);
  const resetLayout = useEditorStore((state) => state.resetLayout);

  const saveCurrentFile = useProjectStore((state) => state.saveCurrentFile);
  const saveCurrentFileAs = useProjectStore((state) => state.saveCurrentFileAs);

  const environment = useIpc(() => window.electronAPI.checkEnvironment(), []);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // L'optimisation rend compte de ce qu'elle a gagné : sans cela, l'utilisateur
  // ne saurait pas distinguer « aucun défaut trouvé » de « rien n'a marché ».
  const handleOptimizeLayout = useCallback(
    (result: OptimizeResult) => {
      const defautsAvant = countDefects(result.before);
      const defautsApres = countDefects(result.after);

      if (result.skipped) {
        useToastStore.getState().push('info', t('toast.layoutTooLarge'));
        return;
      }
      const range = result.arranged ?? 0;
      if (result.moves === 0 && range === 0) {
        useToastStore.getState().push('info', t('toast.layoutAlreadyGood'));
        return;
      }

      applyLayout(result.offsets);
      useToastStore
        .getState()
        .push(
          'success',
          // Sur un diagramme de cas d'utilisation, ce qui compte d'abord est que
          // la disposition du formalisme ait été appliquée ; le compte des
          // défauts porte alors sur l'état final, une fois les acteurs rangés.
          range > 0
            ? t('toast.layoutArranged', { count: range, after: defautsApres })
            : t('toast.layoutOptimized', { before: defautsAvant, after: defautsApres })
        );
    },
    [applyLayout, t]
  );

  // Ctrl+S fonctionne aussi lorsque le focus est hors de Monaco.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        // Maj : choisir une nouvelle destination plutôt qu'écraser la courante.
        void (event.shiftKey ? saveCurrentFileAs() : saveCurrentFile());
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveCurrentFile, saveCurrentFileAs]);

  const handleSave = useCallback(() => void saveCurrentFile(), [saveCurrentFile]);

  const status = environment.data;

  if (environment.loading) {
    return <div className="diagnostics">{t('env.checking')}</div>;
  }

  if (status && !status.ready) {
    return (
      <>
        <EnvironmentDiagnostics status={status} onRetry={environment.reload} />
        <ToastStack />
      </>
    );
  }

  const showBanner = Boolean(status && status.diagnostics.length > 0 && !bannerDismissed);

  return (
    <div className="app">
      <Toolbar />

      {showBanner && status && (
        <EnvironmentBanner status={status} onDismiss={() => setBannerDismissed(true)} />
      )}

      <ThreePanelLayout
        left={<FileTree />}
        center={
          <div className="editor-panel">
            <div className="panel-header">
              <span>{t('panel.editor')}</span>
            </div>
            <MonacoEditor
              value={content}
              onChange={setContent}
              theme={theme}
              revealLine={revealLine}
              onRevealLineConsumed={consumeRevealLine}
              onSave={handleSave}
            />
          </div>
        }
        right={
          <DiagramPreview
            pumlSource={content}
            debounceMs={debounceMs}
            enabled={autoRender}
            applyFormalism={applyFormalism}
            layoutOffsets={layoutOffsets}
            onMoveElement={moveElement}
            onOptimizeLayout={handleOptimizeLayout}
            onResetLayout={resetLayout}
            onGotoLine={requestRevealLine}
          />
        }
      />

      <ToastStack />
    </div>
  );
}
