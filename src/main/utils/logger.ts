import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let logDirectory = path.join(os.tmpdir(), 'plantuml-studio', 'logs');
let minimumLevel: LogLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
let writeFailureReported = false;

/**
 * Redirige les logs vers un dossier persistant (appelé au démarrage avec
 * `app.getPath('logs')`). Les erreurs d'écriture ne doivent jamais faire
 * tomber l'application : le logger dégrade silencieusement vers la console.
 */
export function configureLogger(directory: string, level?: LogLevel): void {
  logDirectory = directory;
  if (level) minimumLevel = level;
  writeFailureReported = false;
}

export function getLogFilePath(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logDirectory, `plantuml-studio-${day}.log`);
}

function serialize(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, message: string, extra: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) return;

  const details = extra.map(serialize).join(' ');
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${
    details ? ` ${details}` : ''
  }`;

  const consoleMethod = level === 'debug' ? 'log' : level;
  console[consoleMethod](line);

  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(getLogFilePath(), `${line}\n`, 'utf-8');
  } catch (error) {
    if (!writeFailureReported) {
      writeFailureReported = true;
      console.warn(
        `Impossible d'écrire dans le journal (${logDirectory}) : ${serialize(error)}`
      );
    }
  }
}

export const logger = {
  debug: (message: string, ...extra: unknown[]) => write('debug', message, extra),
  info: (message: string, ...extra: unknown[]) => write('info', message, extra),
  warn: (message: string, ...extra: unknown[]) => write('warn', message, extra),
  error: (message: string, ...extra: unknown[]) => write('error', message, extra),
};
