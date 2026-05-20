import { samplePose } from '@xflip/core';
import type React from 'react';
import { useRef, useState } from 'react';
import { useStudio } from '../store/context.js';
import type { PoseKeyframe, StudioLayer } from '../store/types.js';

type DragMode = 'translate' | 'rotate' | 'scale';

/**
 * Canvas: renders all layers as positioned DOM elements.
 * Drag modes (hold modifier at drag start):
 *   plain  → translate (tx, ty)
 *   Shift  → rotate around canvas center
 *   Ctrl   → scale (drag up = bigger)
 */
export function Canvas() {
  const { project, dispatch } = useStudio();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    layerId: number;
    startX: number;
    startY: number;
    canvasCX: number;
    canvasCY: number;
    startAngle: number;
    mode: DragMode;
    baseKf: PoseKeyframe;
  } | null>(null);

  const sorted = [...project.layers].sort((a, b) => a.zOrder - b.zOrder);
  const { previewNx: nx, previewNy: ny } = project;

  const handlePointerDown = (e: React.PointerEvent, layer: StudioLayer) => {
    e.preventDefault();
    dispatch({ type: 'SELECT_LAYER', id: layer.id });
    if (!layer.poseEnabled) return;
    const kf = samplePose(layer.pose, nx, ny);
    const mode: DragMode = e.shiftKey ? 'rotate' : e.ctrlKey || e.metaKey ? 'scale' : 'translate';
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : e.clientX;
    const cy = rect ? rect.top + rect.height / 2 : e.clientY;
    setDragging({
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      canvasCX: cx,
      canvasCY: cy,
      startAngle: 0, // unused for rotateY; kept for type compat
      mode,
      baseKf: {
        tx: kf.tx,
        ty: kf.ty,
        rotationRad: kf.rotationRad,
        scale: kf.scale,
        opacity: kf.opacity,
      },
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const layer = project.layers.find((l) => l.id === dragging.layerId);
    if (!layer) return;
    const existing: PoseKeyframe = layer.pose.keyframes[project.activePoseCell] ?? {
      tx: 0,
      ty: 0,
      rotationRad: 0,
      scale: 1,
      opacity: 1,
    };
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    let newKf: PoseKeyframe;
    if (dragging.mode === 'rotate') {
      // rotateY: horizontal drag maps to Y-axis rotation (right = positive = face turns right)
      newKf = { ...existing, rotationRad: dragging.baseKf.rotationRad + dx / 150 };
    } else if (dragging.mode === 'scale') {
      newKf = { ...existing, scale: Math.max(0.01, dragging.baseKf.scale * Math.exp(-dy / 200)) };
    } else {
      newKf = { ...existing, tx: dragging.baseKf.tx + dx, ty: dragging.baseKf.ty + dy };
    }
    dispatch({
      type: 'SET_LAYER_POSE_CELL',
      layerId: dragging.layerId,
      cellIndex: project.activePoseCell,
      keyframe: newKf,
    });
  };

  const handlePointerUp = () => setDragging(null);

  const cursorForMode = (mode: DragMode | null) => {
    if (mode === 'rotate') return 'crosshair';
    if (mode === 'scale') return 'ns-resize';
    return 'grab';
  };

  return (
    <div style={styles.wrapper}>
      <div
        ref={canvasRef}
        style={{ ...styles.canvas, width: project.width / 2, height: project.height / 2 }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {sorted.map((layer) => {
          const kf = layer.poseEnabled ? samplePose(layer.pose, nx, ny) : null;
          const isSelected = project.selectedLayerId === layer.id;
          return (
            <img
              key={layer.id}
              src={layer.imageUrl}
              alt={layer.name}
              draggable={false}
              style={{
                ...styles.layerImg,
                opacity: (layer.opacity / 255) * (kf?.opacity ?? 1),
                mixBlendMode: layer.blendMode as React.CSSProperties['mixBlendMode'],
                transform: kf
                  ? `perspective(800px) translate3d(${kf.tx}px,${kf.ty}px,0) rotateY(${kf.rotationRad}rad) scale(${kf.scale})`
                  : 'none',
                outline: isSelected ? '2px solid #89b4fa' : 'none',
                cursor: dragging?.layerId === layer.id ? cursorForMode(dragging.mode) : 'grab',
              }}
              onPointerDown={(e) => handlePointerDown(e, layer)}
            />
          );
        })}
        {sorted.length === 0 && <div style={styles.empty}>Add layers from the panel</div>}
      </div>
      <div style={styles.footer}>
        <span style={styles.tiltInfo}>
          tiltX {nx >= 0 ? '+' : ''}
          {nx.toFixed(2)} · tiltY {ny >= 0 ? '+' : ''}
          {ny.toFixed(2)}
        </span>
        <span style={styles.hint}>drag=move · Shift+drag=rotateY · Ctrl+drag=scale</span>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#181825',
    gap: 12,
    overflow: 'hidden',
    padding: 24,
  },
  canvas: {
    position: 'relative' as const,
    background: '#313244',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  layerImg: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    userSelect: 'none' as const,
  },
  empty: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6c7086',
    fontSize: 13,
  },
  footer: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  tiltInfo: {
    fontSize: 11,
    color: '#6c7086',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 10,
    color: '#45475a',
  },
} as const;
