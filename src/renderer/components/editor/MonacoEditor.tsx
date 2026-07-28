import { Editor, loader } from '@monaco-editor/react';
// Seule l'API de l'éditeur est importée : le point d'entrée « monaco-editor »
// embarquerait aussi les workers CSS/HTML/JSON/TypeScript (environ 9 Mo) dont
// PlantUML Studio n'a aucun usage.
import * as monaco from 'monaco-editor/editor/editor.api';
// Police d'icônes de Monaco (suggestions, pliage de code) : elle n'est pas
// incluse dans editor.api et doit être enregistrée explicitement.
import 'monaco-editor/features/codicon/register';
// Le worker est fourni par Vite : aucune ressource n'est téléchargée depuis un CDN.
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { useCallback, useEffect, useRef } from 'react';

import { MONACO_THEME, type ThemeName } from '../../styles/themes';
import { PLANTUML_LANGUAGE_ID, registerPlantUmlLanguage } from './plantuml-language';

// Monaco cherche ses workers via cette variable globale ; sans elle, l'éditeur
// tente un chargement distant, incompatible avec le fonctionnement hors ligne.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// `@monaco-editor/react` charge Monaco depuis un CDN par défaut : on lui impose
// l'instance locale installée via npm.
loader.config({ monaco });

export interface MonacoEditorProps {
  value: string;
  onChange(value: string): void;
  theme: ThemeName;
  /** Ligne à révéler (clic sur une erreur) ; consommée puis remise à zéro. */
  revealLine: number | null;
  onRevealLineConsumed(): void;
  onSave(): void;
  readOnly?: boolean;
}

export function MonacoEditor({
  value,
  onChange,
  theme,
  revealLine,
  onRevealLineConsumed,
  onSave,
  readOnly = false,
}: MonacoEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // `onSave` change à chaque rendu : la commande Monaco lit la référence.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const handleMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
    editor.focus();
  }, []);

  useEffect(() => {
    if (revealLine === null) return;
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    const line = model ? Math.min(Math.max(revealLine, 1), model.getLineCount()) : revealLine;

    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    onRevealLineConsumed();
  }, [revealLine, onRevealLineConsumed]);

  return (
    <div className="editor-host">
      <Editor
        language={PLANTUML_LANGUAGE_ID}
        value={value}
        theme={MONACO_THEME[theme]}
        beforeMount={(instance) => registerPlantUmlLanguage(instance)}
        onMount={handleMount}
        onChange={(next) => onChange(next ?? '')}
        options={{
          fontSize: 13,
          fontFamily: "'Cascadia Mono', 'JetBrains Mono', Consolas, monospace",
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          readOnly,
          smoothScrolling: true,
          padding: { top: 8 },
        }}
      />
    </div>
  );
}
