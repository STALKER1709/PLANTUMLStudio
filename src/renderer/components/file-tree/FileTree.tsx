import { useMemo, useState } from 'react';

import type { FileNode } from '../../../shared/types';
import { useTranslation } from '../../i18n';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { PromptDialog } from '../common/PromptDialog';

type DialogKind = 'create' | 'rename' | 'delete';

interface DialogState {
  kind: DialogKind;
  target: FileNode;
}

export function FileTree() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const tree = useProjectStore((state) => state.tree);
  const refreshTree = useProjectStore((state) => state.refreshTree);
  const openFile = useProjectStore((state) => state.openFile);
  const createFile = useProjectStore((state) => state.createFile);
  const renameFile = useProjectStore((state) => state.renameFile);
  const deleteFile = useProjectStore((state) => state.deleteFile);
  const currentFilePath = useEditorStore((state) => state.filePath);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FileNode | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const rootNode = useMemo<FileNode | null>(() => tree, [tree]);

  const toggle = (node: FileNode) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  };

  const handleSelect = (node: FileNode) => {
    setSelected(node);
    if (node.isDirectory) {
      toggle(node);
      return;
    }
    void openFile(node.path);
  };

  /** Dossier cible d'une création : la sélection, son parent, ou la racine. */
  const targetDirectory = (): FileNode | null => {
    if (!rootNode) return null;
    if (!selected) return rootNode;
    if (selected.isDirectory) return selected;
    return findParent(rootNode, selected.path) ?? rootNode;
  };

  const confirmDialog = (value: string) => {
    if (!dialog) return;

    if (dialog.kind === 'create') void createFile(dialog.target.path, value);
    if (dialog.kind === 'rename') void renameFile(dialog.target.path, value);
    if (dialog.kind === 'delete') void deleteFile(dialog.target.path);

    setDialog(null);
  };

  return (
    <>
      <div className="panel-header">
        <span>{t('panel.files')}</span>
        <span className="group">
          <button
            type="button"
            title={t('filetree.newFile')}
            disabled={!project}
            onClick={() => {
              const directory = targetDirectory();
              if (directory) setDialog({ kind: 'create', target: directory });
            }}
          >
            ＋
          </button>
          <button
            type="button"
            title={t('filetree.rename')}
            disabled={!selected || selected.path === rootNode?.path}
            onClick={() => selected && setDialog({ kind: 'rename', target: selected })}
          >
            ✎
          </button>
          <button
            type="button"
            title={t('filetree.delete')}
            disabled={!selected || selected.path === rootNode?.path}
            onClick={() => selected && setDialog({ kind: 'delete', target: selected })}
          >
            🗑
          </button>
          <button
            type="button"
            title={t('filetree.refresh')}
            disabled={!project}
            onClick={() => void refreshTree()}
          >
            ⟳
          </button>
        </span>
      </div>

      <div className="panel-content">
        {rootNode ? (
          <div className="file-tree" role="tree">
            <TreeNode
              node={rootNode}
              depth={0}
              expanded={expanded}
              selectedPath={selected?.path ?? null}
              openFilePath={currentFilePath}
              onSelect={handleSelect}
            />
          </div>
        ) : (
          <p className="empty-state">{t('filetree.empty')}</p>
        )}
      </div>

      <PromptDialog
        open={dialog !== null}
        mode={dialog?.kind === 'delete' ? 'confirm' : 'input'}
        title={dialogTitle(dialog, t)}
        defaultValue={dialog?.kind === 'rename' ? dialog.target.name : ''}
        onConfirm={confirmDialog}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  openFilePath: string | null;
  onSelect(node: FileNode): void;
}

function TreeNode({ node, depth, expanded, selectedPath, openFilePath, onSelect }: TreeNodeProps) {
  // La racine est toujours dépliée : masquer son contenu n'a aucun intérêt.
  const isOpen = depth === 0 || expanded.has(node.path);
  const isSelected = node.path === selectedPath || node.path === openFilePath;

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={node.isDirectory ? isOpen : undefined}
        aria-selected={isSelected}
        className={`file-tree-node${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node)}
        title={node.path}
      >
        <span className="icon" aria-hidden="true">
          {node.isDirectory ? (isOpen ? '▾' : '▸') : '📄'}
        </span>
        <span className="label">{node.name}</span>
      </button>

      {node.isDirectory &&
        isOpen &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selectedPath={selectedPath}
            openFilePath={openFilePath}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function dialogTitle(
  dialog: DialogState | null,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (!dialog) return '';
  if (dialog.kind === 'create') return t('filetree.promptNewFile');
  if (dialog.kind === 'rename') return t('filetree.promptRename');
  return t('filetree.confirmDelete', { name: dialog.target.name });
}

function findParent(node: FileNode, childPath: string): FileNode | null {
  if (!node.children) return null;
  if (node.children.some((child) => child.path === childPath)) return node;

  for (const child of node.children) {
    const found = findParent(child, childPath);
    if (found) return found;
  }
  return null;
}
