import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { useEditorStore } from './store/editorStore';
import { useSettingsStore } from './store/settingsStore';
import { applyTheme } from './styles/themes';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error("Élément #root introuvable dans index.html");

// Le thème est appliqué avant le premier rendu pour éviter tout flash clair.
applyTheme(useSettingsStore.getState().theme);

// L'éditeur démarre sur un brouillon : l'utilisateur peut dessiner sans avoir
// à créer un projet au préalable.
useEditorStore.getState().openDraft();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
