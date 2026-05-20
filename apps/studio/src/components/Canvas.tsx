import { samplePose } from '@xflip/core';
import type React from 'react';
import { useRef } from 'react';
import { useStudio } from '../store/context.js';

export function Canvas() {
  const { project, dispatch } = useStudio();
  const canvasRef = useRef<HTMLDivElement>(null);

  const sorted = [...project.layers].sort((a, b) => a.zOrder - b.zOrder);
  const { previewNx: nx, previewNy: ny } = project;

  return (
    <div style={styles.wrapper}>
      <div
        ref={canvasRef}
        style={{ ...styles.canvas, width: project.width / 2, height: project.height / 2 }}
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
                cursor: 'pointer',
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                dispatch({ type: 'SELECT_LAYER', id: layer.id });
              }}
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
        <span style={styles.hint}>click layer to select · edit transforms in Inspector</span>
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
