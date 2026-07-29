import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, shell } from 'electron';

import { APP_NAME } from '../../shared/constants';
import { logger } from '../utils/logger';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

export interface CreateMainWindowOptions {
  /** `true` en développement : charge le serveur Vite et ouvre les DevTools. */
  isDevelopment: boolean;
  /** Racine des fichiers compilés (`dist/`). */
  distPath: string;
  /**
   * Icône de la fenêtre et de la barre des tâches. Sans elle, Electron affiche
   * la sienne : la configuration d'electron-builder ne vaut que pour
   * l'exécutable installé, jamais pour la fenêtre en développement.
   */
  iconPath?: string | null;
}

export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    ...(options.iconPath && fs.existsSync(options.iconPath) ? { icon: options.iconPath } : {}),
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      preload: path.join(options.distPath, 'preload', 'preload.js'),
      // Cloisonnement strict : le renderer n'a aucun accès direct à Node.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Application hors ligne : aucune navigation sortante n'est légitime.
  window.webContents.on('will-navigate', (event, url) => {
    if (options.isDevelopment && url.startsWith(DEV_SERVER_URL)) return;
    event.preventDefault();
    logger.warn(`Navigation bloquée vers ${url}`);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn(`Ouverture de fenêtre bloquée pour ${url}`);
    // Les liens externes éventuels partent vers le navigateur système,
    // jamais dans une fenêtre Electron.
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (options.isDevelopment) {
    void window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(options.distPath, 'renderer', 'index.html'));
  }

  return window;
}
