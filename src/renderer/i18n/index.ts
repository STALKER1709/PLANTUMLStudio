import en from './en.json';
import fr from './fr.json';
import { useSettingsStore } from '../store/settingsStore';

export type Language = 'fr' | 'en';

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Language, Dictionary> = {
  fr: fr as Dictionary,
  en: en as Dictionary,
};

export const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

/**
 * Traduit une clé. Les paramètres sont interpolés au format `{nom}`.
 * Une clé absente est renvoyée telle quelle : le défaut visible aide à
 * repérer les oublis sans jamais casser l'interface.
 */
export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  const template = DICTIONARIES[language]?.[key] ?? DICTIONARIES.fr[key] ?? key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

export function useTranslation(): {
  t: (key: string, params?: Record<string, string | number>) => string;
  language: Language;
} {
  const language = useSettingsStore((state) => state.language);
  return {
    language,
    t: (key, params) => translate(language, key, params),
  };
}
