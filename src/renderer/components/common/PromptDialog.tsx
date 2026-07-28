import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../i18n';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  /** `input` demande une saisie, `confirm` ne demande qu'une validation. */
  mode?: 'input' | 'confirm';
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm(value: string): void;
  onCancel(): void;
}

/**
 * Boîte de dialogue interne.
 * `window.prompt()` n'est pas implémenté dans Electron : toute saisie modale
 * doit passer par un composant applicatif.
 */
export function PromptDialog({
  open,
  title,
  mode = 'input',
  defaultValue = '',
  confirmLabel,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    // Le focus part sur le champ pour permettre une saisie immédiate.
    const timer = setTimeout(() => inputRef.current?.select(), 0);
    return () => clearTimeout(timer);
  }, [open, defaultValue]);

  if (!open) return null;

  const submit = () => {
    if (mode === 'input' && value.trim() === '') return;
    onConfirm(value.trim());
  };

  return (
    <div
      className="dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <p className="dialog-title">{title}</p>

        {mode === 'input' && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') onCancel();
            }}
          />
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" onClick={submit}>
            {confirmLabel ?? t('common.yes')}
          </button>
        </div>
      </div>
    </div>
  );
}
