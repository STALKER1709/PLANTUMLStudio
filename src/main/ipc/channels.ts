/**
 * Canaux IPC. La source de vérité est `src/shared/constants.ts` (partagée avec
 * le preload) ; ce module ajoute le typage côté main process.
 */
import { IPC_CHANNELS } from '../../shared/constants';

export { IPC_CHANNELS };
export type { IpcChannel } from '../../shared/constants';

/** Liste figée des canaux, utile pour l'enregistrement et les tests. */
export const ALL_CHANNELS = Object.values(IPC_CHANNELS);
