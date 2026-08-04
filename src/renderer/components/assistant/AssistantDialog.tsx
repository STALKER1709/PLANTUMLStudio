import { useMemo, useState } from 'react';

import {
  SCHEMAS,
  emptyRow,
  initialValues,
  type SectionValues,
} from '../../assistant/schemas';
import { filledRows, type AssistantField, type AssistantSection } from '../../assistant/model';
import { useTranslation } from '../../i18n';

export interface AssistantDialogProps {
  open: boolean;
  /** `true` si l'éditeur contient des modifications non enregistrées. */
  isDirty: boolean;
  onInsert(source: string): void;
  onCancel(): void;
}

/**
 * Assistant de création : un formulaire par type de diagramme, qui écrit la
 * source PlantUML à la place de l'utilisateur.
 *
 * Le formulaire est entièrement piloté par le schéma du type choisi — une seule
 * interface sert les 14 diagrammes. L'aperçu de la source est mis à jour à
 * chaque frappe : on voit ce que produit ce qu'on saisit, ce qui fait de
 * l'assistant un moyen d'apprendre la syntaxe autant que de s'en passer.
 */
export function AssistantDialog({ open, isDirty, onInsert, onCancel }: AssistantDialogProps) {
  const { t } = useTranslation();
  const [schemaId, setSchemaId] = useState(SCHEMAS[0].id);
  const [titre, setTitre] = useState('');
  const [valeurs, setValeurs] = useState<SectionValues>(() => initialValues(SCHEMAS[0]));

  const schema = useMemo(
    () => SCHEMAS.find((candidat) => candidat.id === schemaId) ?? SCHEMAS[0],
    [schemaId]
  );

  const source = useMemo(() => {
    try {
      return schema.build(titre, valeurs);
    } catch {
      // Une saisie incomplète ne doit jamais faire disparaître le formulaire.
      return '';
    }
  }, [schema, titre, valeurs]);

  if (!open) return null;

  const changerDeType = (id: string) => {
    const suivant = SCHEMAS.find((candidat) => candidat.id === id);
    if (!suivant) return;
    setSchemaId(id);
    setValeurs(initialValues(suivant));
  };

  const modifier = (sectionId: string, index: number, champ: string, valeur: string) => {
    setValeurs((precedent) => {
      const lignes = [...(precedent[sectionId] ?? [])];
      lignes[index] = { ...lignes[index], [champ]: valeur };
      return { ...precedent, [sectionId]: lignes };
    });
  };

  const ajouter = (sectionId: string) => {
    setValeurs((precedent) => ({
      ...precedent,
      [sectionId]: [...(precedent[sectionId] ?? []), emptyRow(schema, sectionId)],
    }));
  };

  const supprimer = (sectionId: string, index: number) => {
    setValeurs((precedent) => ({
      ...precedent,
      [sectionId]: (precedent[sectionId] ?? []).filter((_, rang) => rang !== index),
    }));
  };

  /** Libellés déjà déclarés dans une section, pour alimenter un champ lié. */
  const choixDe = (sectionId: string | undefined): string[] => {
    const section = schema.sections.find((candidat) => candidat.id === sectionId);
    if (!section) return [];
    const clef = section.fields[0]?.name ?? 'nom';
    return filledRows(section, valeurs)
      .map((row) => (row[clef] ?? '').trim())
      .filter((libelle, rang, tout) => libelle !== '' && tout.indexOf(libelle) === rang);
  };

  return (
    <div
      className="dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog assistant" role="dialog" aria-modal="true" aria-label={t('assistant.title')}>
        <p className="dialog-title">{t('assistant.title')}</p>

        <div className="assistant-entete">
          <label>
            {t('assistant.type')}
            <select value={schemaId} onChange={(event) => changerDeType(event.target.value)}>
              {(['structurel', 'comportemental'] as const).map((famille) => (
                <optgroup key={famille} label={t(`template.category.${famille}`)}>
                  {SCHEMAS.filter((candidat) => candidat.category === famille).map((candidat) => (
                    <option key={candidat.id} value={candidat.id}>
                      {candidat.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label>
            {t('assistant.diagramTitle')}
            <input
              type="text"
              value={titre}
              placeholder={schema.label}
              onChange={(event) => setTitre(event.target.value)}
            />
          </label>
        </div>

        <div className="assistant-corps">
          <div className="assistant-sections">
            {schema.sections.map((section) => (
              <SectionEditor
                key={section.id}
                section={section}
                lignes={valeurs[section.id] ?? []}
                choixDe={choixDe}
                onChange={modifier}
                onAdd={ajouter}
                onRemove={supprimer}
                labelAdd={t('assistant.addRow')}
                labelRemove={t('assistant.removeRow')}
              />
            ))}
          </div>

          <div className="assistant-apercu">
            <span className="assistant-apercu-titre">{t('assistant.preview')}</span>
            <pre>{source}</pre>
          </div>
        </div>

        <div className="dialog-actions">
          {isDirty && <span className="assistant-avertissement">{t('assistant.willReplace')}</span>}
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" onClick={() => onInsert(source)}>
            {t('assistant.insert')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SectionEditorProps {
  section: AssistantSection;
  lignes: Array<Record<string, string>>;
  choixDe(sectionId: string | undefined): string[];
  onChange(sectionId: string, index: number, champ: string, valeur: string): void;
  onAdd(sectionId: string): void;
  onRemove(sectionId: string, index: number): void;
  labelAdd: string;
  labelRemove: string;
}

function SectionEditor({
  section,
  lignes,
  choixDe,
  onChange,
  onAdd,
  onRemove,
  labelAdd,
  labelRemove,
}: SectionEditorProps) {
  return (
    <fieldset className="assistant-section">
      <legend>{section.label}</legend>
      {section.hint && <p className="assistant-aide">{section.hint}</p>}

      {lignes.map((ligne, index) => (
        <div className="assistant-ligne" key={index}>
          {section.fields.map((field) => (
            <label key={field.name} className={`assistant-champ champ-${field.kind}`}>
              <span>{field.label}</span>
              <FieldEditor
                field={field}
                value={ligne[field.name] ?? ''}
                choix={field.kind === 'reference' ? choixDe(field.references) : []}
                onChange={(valeur) => onChange(section.id, index, field.name, valeur)}
              />
            </label>
          ))}
          <button
            type="button"
            className="assistant-supprimer"
            aria-label={labelRemove}
            title={labelRemove}
            onClick={() => onRemove(section.id, index)}
          >
            ✕
          </button>
        </div>
      ))}

      <button type="button" onClick={() => onAdd(section.id)}>
        + {labelAdd}
      </button>
    </fieldset>
  );
}

interface FieldEditorProps {
  field: AssistantField;
  value: string;
  choix: string[];
  onChange(valeur: string): void;
}

function FieldEditor({ field, value, choix, onChange }: FieldEditorProps) {
  if (field.kind === 'choice') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'reference') {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {choix.map((libelle) => (
          <option key={libelle} value={libelle}>
            {libelle}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'multiline') {
    return (
      <textarea
        rows={3}
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
