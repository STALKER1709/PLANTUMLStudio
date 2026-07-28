export type ThemeName = 'light' | 'dark';

export interface ThemePalette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  danger: string;
  warning: string;
  success: string;
  /** Fond de la zone de prévisualisation (les SVG PlantUML sont sur fond clair). */
  canvas: string;
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    background: '#1e1e2e',
    surface: '#252537',
    surfaceAlt: '#2d2d44',
    border: '#3b3b58',
    text: '#e6e6f0',
    textMuted: '#9a9ab5',
    accent: '#5b8def',
    accentText: '#ffffff',
    danger: '#f2686b',
    warning: '#e0a458',
    success: '#5fd08a',
    canvas: '#f7f7fb',
  },
  light: {
    background: '#f4f5f9',
    surface: '#ffffff',
    surfaceAlt: '#eceef5',
    border: '#d5d8e4',
    text: '#1f2333',
    textMuted: '#5f6478',
    accent: '#2f6bd8',
    accentText: '#ffffff',
    danger: '#c62f37',
    warning: '#a96a12',
    success: '#1f7a4d',
    canvas: '#ffffff',
  },
};

/** Thème Monaco correspondant. */
export const MONACO_THEME: Record<ThemeName, string> = {
  dark: 'plantuml-dark',
  light: 'plantuml-light',
};

/** Applique la palette sous forme de variables CSS sur `<html>`. */
export function applyTheme(theme: ThemeName): void {
  const palette = THEMES[theme];
  const root = document.documentElement;

  root.dataset.theme = theme;
  Object.entries(palette).forEach(([key, value]) => {
    root.style.setProperty(`--color-${kebab(key)}`, value);
  });
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
