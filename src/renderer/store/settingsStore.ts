import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_RENDER_DEBOUNCE_MS } from '../../shared/constants';
import type { DiagramFormat } from '../../shared/types';
import type { Language } from '../i18n';
import { applyTheme, type ThemeName } from '../styles/themes';

interface SettingsState {
  theme: ThemeName;
  language: Language;
  /** Format proposé par défaut dans la boîte d'export. */
  exportFormat: DiagramFormat;
  /** Délai avant déclenchement du rendu après une frappe. */
  debounceMs: number;
  /** Rendu automatique ; désactivé, la prévisualisation se met à jour à l'enregistrement. */
  autoRender: boolean;
  /**
   * Applique le formalisme commun à toute source rendue ou exportée, y compris
   * celles écrites à la main. Désactivé, PlantUML rend avec ses réglages par défaut.
   */
  applyFormalism: boolean;

  setTheme(theme: ThemeName): void;
  toggleTheme(): void;
  setLanguage(language: Language): void;
  setExportFormat(format: DiagramFormat): void;
  setDebounceMs(delay: number): void;
  setAutoRender(enabled: boolean): void;
  setApplyFormalism(enabled: boolean): void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      language: 'fr',
      exportFormat: 'png',
      debounceMs: DEFAULT_RENDER_DEBOUNCE_MS,
      autoRender: true,
      applyFormalism: true,

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
      setLanguage: (language) => set({ language }),
      setExportFormat: (exportFormat) => set({ exportFormat }),
      setDebounceMs: (debounceMs) => set({ debounceMs: Math.min(Math.max(debounceMs, 100), 3000) }),
      setAutoRender: (autoRender) => set({ autoRender }),
      setApplyFormalism: (applyFormalism) => set({ applyFormalism }),
    }),
    {
      name: 'plantuml-studio-settings',
      // Les préférences sont locales à la machine : localStorage suffit et
      // évite un aller-retour IPC au démarrage.
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
