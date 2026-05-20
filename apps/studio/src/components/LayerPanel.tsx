import { Fragment, useRef, useState } from 'react';
import { useStudio } from '../store/context.js';
import { createLayer } from '../store/reducer.js';

type DragState = { dragId: number; overId: number | null };

async function makeWhiteBlob(w: number, h: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

const EFFECT_PRESETS = [
  { label: 'Base', effectType: 'base', blendMode: 'normal' },
  { label: 'Holo Sweep', effectType: 'holo_sweep', blendMode: 'color-dodge' },
  { label: 'Sparkle', effectType: 'sparkle', blendMode: 'screen' },
  { label: 'Specular', effectType: 'specular', blendMode: 'overlay' },
  { label: 'Border Foil', effectType: 'border_foil', blendMode: 'normal' },
];

export function LayerPanel() {
  const { project, dispatch } = useStudio();
  const inputRef = useRef<HTMLInputElement>(null);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const existing = project.layers.length;
    Array.from(files).forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const layer = createLayer(file, url, existing + i);
      dispatch({ type: 'ADD_LAYER', layer });
    });
  };

  const removeLayer = (id: number) => {
    const layer = project.layers.find((l) => l.id === id);
    if (layer) URL.revokeObjectURL(layer.imageUrl);
    dispatch({ type: 'REMOVE_LAYER', id });
  };

  const addEffectLayer = async (preset: (typeof EFFECT_PRESETS)[number]) => {
    setEffectPickerOpen(false);
    const blob = await makeWhiteBlob(project.width, project.height);
    const url = URL.createObjectURL(blob);
    const zOrder = project.layers.length;
    const layer = createLayer(blob, url, zOrder);
    dispatch({
      type: 'ADD_LAYER',
      layer: {
        ...layer,
        name: preset.label,
        effectType: preset.effectType,
        blendMode: preset.blendMode,
      },
    });
  };

  const sorted = [...project.layers].sort((a, b) => b.zOrder - a.zOrder);

  const swapZOrder = (idxA: number, idxB: number) => {
    const a = sorted[idxA];
    const b = sorted[idxB];
    if (!a || !b) return;
    dispatch({ type: 'REORDER_LAYER', id: a.id, newZOrder: b.zOrder });
    dispatch({ type: 'REORDER_LAYER', id: b.id, newZOrder: a.zOrder });
  };

  const onDrop = (toIdx: number) => {
    if (!drag) return;
    const fromIdx = sorted.findIndex((l) => l.id === drag.dragId);
    if (fromIdx !== -1 && fromIdx !== toIdx) swapZOrder(fromIdx, toIdx);
    setDrag(null);
  };

  return (
    <aside style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Layers</span>
        <div style={{ position: 'relative' as const }}>
          <button
            type="button"
            style={styles.addBtn}
            onClick={() => setEffectPickerOpen((v) => !v)}
            title="Add effect layer"
          >
            + Effect
          </button>
          {effectPickerOpen && (
            <div style={styles.effectMenu}>
              {EFFECT_PRESETS.map((p) => (
                <button
                  key={p.effectType}
                  type="button"
                  style={styles.effectMenuItem}
                  onClick={() => addEffectLayer(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          style={styles.addBtn}
          onClick={() => inputRef.current?.click()}
          title="Add layer (PNG / WebP)"
        >
          + Add
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/avif"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div style={styles.list}>
        {sorted.length === 0 && <p style={styles.empty}>Drop PNG / WebP layers here</p>}
        {sorted.map((layer, idx) => {
          const isDragging = drag?.dragId === layer.id;
          const isOver = drag?.overId === layer.id;
          const canMoveUp = idx > 0;
          const canMoveDown = idx < sorted.length - 1;
          return (
            <Fragment key={layer.id}>
              {/* biome-ignore lint/a11y/useSemanticElements: nested interactive children prevent using <button> */}
              <div
                role="button"
                tabIndex={0}
                draggable
                style={{
                  ...styles.item,
                  ...(project.selectedLayerId === layer.id ? styles.itemSelected : {}),
                  ...(isDragging ? styles.itemDragging : {}),
                  ...(isOver ? styles.itemOver : {}),
                }}
                onClick={() => dispatch({ type: 'SELECT_LAYER', id: layer.id })}
                onKeyDown={(e) =>
                  e.key === 'Enter' && dispatch({ type: 'SELECT_LAYER', id: layer.id })
                }
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ dragId: layer.id, overId: null });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (drag && drag.overId !== layer.id)
                    setDrag((d) => d && { ...d, overId: layer.id });
                }}
                onDragLeave={() => setDrag((d) => d && { ...d, overId: null })}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(idx);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <span style={styles.handle} title="Drag to reorder">
                  ⠿
                </span>
                <img src={layer.imageUrl} style={styles.thumb} alt="" />
                <span style={styles.name}>{layer.name}</span>
                <div style={styles.reorderBtns}>
                  <button
                    type="button"
                    style={{ ...styles.reorderBtn, opacity: canMoveUp ? 1 : 0.25 }}
                    disabled={!canMoveUp}
                    onClick={(e) => {
                      e.stopPropagation();
                      swapZOrder(idx, idx - 1);
                    }}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.reorderBtn, opacity: canMoveDown ? 1 : 0.25 }}
                    disabled={!canMoveDown}
                    onClick={(e) => {
                      e.stopPropagation();
                      swapZOrder(idx, idx + 1);
                    }}
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLayer(layer.id);
                  }}
                  title="Remove layer"
                >
                  ×
                </button>
              </div>
            </Fragment>
          );
        })}
      </div>
    </aside>
  );
}

const styles = {
  panel: {
    width: 200,
    minWidth: 160,
    background: '#1e1e2e',
    borderRight: '1px solid #313244',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    borderBottom: '1px solid #313244',
  },
  title: { flex: 1, fontWeight: 600, fontSize: 13, color: '#cdd6f4' },
  addBtn: {
    background: '#89b4fa',
    color: '#1e1e2e',
    border: 'none',
    borderRadius: 4,
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  list: { flex: 1, overflowY: 'auto' as const, padding: '4px 0' },
  empty: { color: '#6c7086', fontSize: 12, textAlign: 'center' as const, padding: 16 },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    transition: 'background 0.1s',
  },
  itemSelected: {
    background: '#313244',
    borderLeftColor: '#89b4fa',
  },
  thumb: {
    width: 28,
    height: 28,
    objectFit: 'contain' as const,
    borderRadius: 3,
    background: '#313244',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    fontSize: 12,
    color: '#cdd6f4',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#f38ba8',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
  },
  handle: {
    color: '#45475a',
    cursor: 'grab',
    fontSize: 14,
    flexShrink: 0,
    userSelect: 'none' as const,
    lineHeight: 1,
  },
  reorderBtns: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
    flexShrink: 0,
  },
  reorderBtn: {
    background: 'none',
    border: 'none',
    color: '#6c7086',
    cursor: 'pointer',
    fontSize: 8,
    lineHeight: 1.2,
    padding: '1px 2px',
  },
  itemDragging: {
    opacity: 0.4,
  },
  itemOver: {
    background: '#2d2d44',
    borderLeftColor: '#cba6f7',
  },
  effectMenu: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    zIndex: 100,
    background: '#313244',
    border: '1px solid #45475a',
    borderRadius: 4,
    minWidth: 130,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  effectMenuItem: {
    background: 'none',
    border: 'none',
    color: '#cdd6f4',
    cursor: 'pointer',
    fontSize: 12,
    padding: '6px 10px',
    textAlign: 'left' as const,
  },
} as const;
