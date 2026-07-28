import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push(kind: ToastKind, message: string, durationMs?: number): void;
  dismiss(id: number): void;
}

let nextId = 1;

/** Notifications non bloquantes (enregistrement, export, erreurs disque). */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (kind, message, durationMs = kind === 'error' ? 8000 : 4000) => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    // Les erreurs restent affichées plus longtemps, mais rien n'est permanent :
    // le journal disque garde la trace complète.
    setTimeout(() => get().dismiss(id), durationMs);
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
