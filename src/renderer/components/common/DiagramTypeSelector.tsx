import { useState } from 'react';

import { useIpc } from '../../hooks/useIpc';
import { useTranslation } from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import { PromptDialog } from './PromptDialog';

export interface DiagramTypeSelectorProps {
  /** `true` lorsque l'éditeur contient des modifications non enregistrées. */
  isDirty: boolean;
  onInsert(content: string): void;
}

/**
 * Sélecteur des 10 modèles livrés avec l'application.
 * Le modèle remplace le contenu de l'éditeur ; une confirmation protège les
 * modifications non enregistrées.
 */
export function DiagramTypeSelector({ isDirty, onInsert }: DiagramTypeSelectorProps) {
  const { t } = useTranslation();
  const templates = useIpc(() => window.electronAPI.listTemplates(), []);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const items = templates.data?.ok ? (templates.data.data ?? []) : [];

  const load = async (id: string) => {
    const result = await window.electronAPI.readTemplate(id);
    if (!result.ok || result.data === undefined) {
      useToastStore
        .getState()
        .push('error', t('toast.error', { message: result.error ?? t('errors.unknown') }));
      return;
    }
    onInsert(result.data);
  };

  return (
    <>
      <select
        aria-label={t('toolbar.template')}
        value=""
        disabled={items.length === 0}
        onChange={(event) => {
          const id = event.target.value;
          if (!id) return;
          if (isDirty) setPendingId(id);
          else void load(id);
        }}
      >
        <option value="">{t('toolbar.templatePlaceholder')}</option>

        {/* Les 14 diagrammes UML se rangent en deux familles : les regrouper
            évite une liste plate de 14 entrées difficile à parcourir. */}
        {(['structurel', 'comportemental', 'planification'] as const).map((category) => {
          const group = items.filter((template) => template.category === category);
          if (group.length === 0) return null;

          return (
            <optgroup key={category} label={t(`template.category.${category}`)}>
              {group.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

      <PromptDialog
        open={pendingId !== null}
        mode="confirm"
        title={t('template.confirmReplace')}
        onConfirm={() => {
          if (pendingId) void load(pendingId);
          setPendingId(null);
        }}
        onCancel={() => setPendingId(null)}
      />
    </>
  );
}
