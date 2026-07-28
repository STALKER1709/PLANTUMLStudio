import type { ElectronAPI } from '../shared/types';

declare global {
  interface Window {
    /** API exposée par le preload via `contextBridge`. */
    electronAPI: ElectronAPI;
  }
}

export {};
