import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, session } from 'electron';

import { APP_ID } from '../shared/constants';
import { registerIpcHandlers } from './ipc/handlers';
import { EnvironmentService } from './services/EnvironmentService';
import { ExportService } from './services/ExportService';
import { FileService } from './services/FileService';
import { PlantUMLService } from './services/PlantUMLService';
import { ProjectService } from './services/ProjectService';
import { TemplateService } from './services/TemplateService';
import { configureLogger, logger } from './utils/logger';
import { resolveResourcesPath } from './utils/paths';
import { createMainWindow } from './windows/createMainWindow';

/** `dist/` : compilé côté main, et `dist/renderer` côté interface. */
const distPath = path.join(__dirname, '..');
/** Racine du dépôt en développement (deux niveaux au-dessus de `dist/main`). */
const projectRoot = path.join(distPath, '..');

/**
 * Mode développement : soit demandé explicitement (`npm run dev`), soit déduit
 * de l'absence du renderer compilé. Une application non packagée mais dont le
 * `dist/renderer` existe (tests de bout en bout) charge bien les fichiers
 * construits, et non le serveur Vite.
 */
const isDevelopment =
  process.env.NODE_ENV === 'development' ||
  (!app.isPackaged && !fs.existsSync(path.join(distPath, 'renderer', 'index.html')));

/**
 * Icône de la fenêtre. Empaquetée, elle est copiée à la racine des ressources ;
 * en développement, elle est lue directement dans `build/icons/`.
 */
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(projectRoot, 'build', 'icons', '256x256.png');

let mainWindow: BrowserWindow | null = null;

// Une seule instance : deux fenêtres écrivant dans le même projet mèneraient
// à des pertes de modifications.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.setAppUserModelId(APP_ID);

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  configureLogger(app.getPath('logs'));

  try {
    const resourcesPath = resolveResourcesPath({
      isPackaged: app.isPackaged,
      packagedResourcesPath: process.resourcesPath,
      projectRoot,
    });
    const templatesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'templates')
      : path.join(projectRoot, 'templates');

    logger.info(`Démarrage de PlantUML Studio (ressources : ${resourcesPath})`);

    const environment = new EnvironmentService({ resourcesPath });
    const status = await environment.checkEnvironment();

    if (!status.javaAvailable) {
      logger.warn('Java non détecté : le rendu échouera tant que le problème persiste.');
    }
    if (!status.plantumlJarAvailable) {
      logger.warn('plantuml.jar absent du dossier resources.');
    }
    status.diagnostics.forEach((diagnostic) => logger.info(`Diagnostic : ${diagnostic}`));

    const plantuml = new PlantUMLService({
      resourcesPath,
      javaPath: status.javaPath ?? undefined,
      dotPath: status.graphvizPath,
      // Formalisme appliqué à toute source rendue, y compris celles écrites
      // ou collées par l'utilisateur.
      formalismConfigPath: path.join(templatesPath, '_formalisme.puml'),
    });

    registerIpcHandlers({
      getMainWindow: () => mainWindow,
      plantuml,
      files: new FileService(),
      projects: new ProjectService(),
      exports: new ExportService(plantuml),
      environment,
      templates: new TemplateService(templatesPath),
    });

    blockNetworkRequests();

    mainWindow = createMainWindow({ isDevelopment, distPath, iconPath });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (error) {
    logger.error("Échec du démarrage de l'application", error);
    app.quit();
  }
});

/**
 * Garde-fou « 100 % hors ligne » : toute requête sortante est rejetée.
 * Seuls les schémas locaux (file:, devtools:, blob:, data:) — et le serveur
 * Vite en développement — sont autorisés.
 */
function blockNetworkRequests(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const isLocal =
      /^(file|devtools|blob|data|chrome-extension):/i.test(details.url) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(details.url);

    if (isLocal && (!/^https?:/i.test(details.url) || isDevelopment)) {
      callback({ cancel: false });
      return;
    }

    logger.warn(`Requête réseau bloquée : ${details.url}`);
    callback({ cancel: true });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow({ isDevelopment, distPath, iconPath });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Exception non interceptée dans le main process', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetée non gérée dans le main process', reason);
});
