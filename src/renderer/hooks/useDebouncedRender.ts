import { useEffect, useRef, useState } from 'react';

import { DEFAULT_RENDER_DEBOUNCE_MS } from '../../shared/constants';
import type { PlantUMLError } from '../../shared/types';

export interface RenderState {
  svgContent: string | null;
  errors: PlantUMLError[] | null;
  isRendering: boolean;
  durationMs: number | null;
}

const IDLE: RenderState = {
  svgContent: null,
  errors: null,
  isRendering: false,
  durationMs: null,
};

/**
 * Déclenche un rendu SVG après une pause de frappe.
 *
 * Deux garde-fous :
 * - le minuteur est réarmé à chaque modification ;
 * - chaque requête porte un numéro de séquence, si bien qu'une réponse
 *   tardive ne peut jamais écraser un rendu plus récent.
 */
export function useDebouncedRender(
  source: string,
  delayMs: number = DEFAULT_RENDER_DEBOUNCE_MS,
  enabled = true,
  applyFormalism = true
): RenderState {
  const [state, setState] = useState<RenderState>(IDLE);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    if (source.trim() === '') {
      requestIdRef.current += 1;
      setState(IDLE);
      return undefined;
    }

    setState((previous) => ({ ...previous, isRendering: true }));
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      window.electronAPI
        .renderDiagram(source, 'svg', applyFormalism)
        .then((result) => {
          if (requestId !== requestIdRef.current) return;
          setState({
            svgContent: result.success ? (result.svgContent ?? null) : null,
            errors: result.success ? null : (result.errors ?? []),
            isRendering: false,
            durationMs: result.durationMs,
          });
        })
        .catch((error: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setState({
            svgContent: null,
            errors: [
              {
                message: error instanceof Error ? error.message : String(error),
                raw: String(error),
              },
            ],
            isRendering: false,
            durationMs: null,
          });
        });
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [source, delayMs, enabled, applyFormalism]);

  return state;
}
