import { useCallback, useEffect, useState } from 'react';

export interface IpcState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload(): void;
}

/**
 * Exécute un appel IPC au montage et expose son état.
 * `reload` permet de relancer l'appel (bouton « Relancer le diagnostic »).
 */
export function useIpc<T>(call: () => Promise<T>, deps: unknown[] = []): IpcState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // `call` est recréée à chaque rendu par les appelants : on s'appuie sur
  // `deps` fournies explicitement plutôt que sur son identité.
  const stableCall = useCallback(call, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    stableCall()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stableCall, nonce]);

  return { data, error, loading, reload: () => setNonce((value) => value + 1) };
}
