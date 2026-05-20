import { encode } from '@xflip/core';
import { defineXflipCard } from '@xflip/viewer';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../store/context.js';

defineXflipCard();

// Extend JSX for the custom element
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'xflip-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        'tilt-max'?: number;
      };
    }
  }
}

interface Props {
  onClose: () => void;
}

const cssToXflipBlend = (css: string): string => {
  const map: Record<string, string> = {
    'color-dodge': 'color_dodge',
    'color-burn': 'color_burn',
    'soft-light': 'soft_light',
    'hard-light': 'hard_light',
    'plus-lighter': 'add',
  };
  return map[css] ?? css;
};

export function PreviewModal({ onClose }: Props) {
  const { project } = useStudio();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: encode once on open
  useEffect(() => {
    (async () => {
      try {
        const sorted = [...project.layers].sort((a, b) => a.zOrder - b.zOrder);
        if (sorted.length === 0) {
          setError('No layers to preview.');
          return;
        }

        const toBytes = (blob: Blob) => blob.arrayBuffer().then((b) => new Uint8Array(b));

        const firstLayer = sorted[0];
        if (!firstLayer) return;
        const firstBytes = await toBytes(firstLayer.imageBlob);

        const layers = await Promise.all(
          sorted.map(async (layer, idx) => {
            const imageData = await toBytes(layer.imageBlob);
            return {
              layerId: idx % 256,
              format: 'png' as const,
              blendMode: cssToXflipBlend(layer.blendMode),
              effectType: layer.effectType || 'base',
              opacity: layer.opacity,
              zOrder: layer.zOrder,
              response: {},
              imageData,
              ...(layer.poseEnabled ? { pose: layer.pose } : {}),
            };
          }),
        );

        const file = {
          versionMajor: 1,
          versionMinor: 2,
          head: {
            width: project.width,
            height: project.height,
            frontFormat: 'png' as const,
            backFormat: 'png' as const,
            flipAxis: 'horizontal' as const,
            flags: 0,
          },
          front: firstBytes,
          back: firstBytes,
          frontLayers: { version: 1, flags: 0, layers },
        };

        const bytes = encode(file as Parameters<typeof encode>[0]);
        const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setSrc(url);
      } catch (e) {
        setError(String(e));
      }
    })();

    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []); // encode once on open

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog
    <div style={styles.overlay} onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog handles keyboard */}
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Card preview"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div style={styles.header}>
          <span style={styles.title}>Preview</span>
          <span style={styles.hint}>Hover to tilt · Click to flip</span>
          <button type="button" style={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={styles.body}>
          {error && <p style={styles.error}>{error}</p>}
          {!error && !src && <p style={styles.loading}>Encoding…</p>}
          {src && <xflip-card src={src} tilt-max={30} style={styles.card} />}
        </div>
        <p style={styles.footer}>
          This preview uses the actual xflip-card viewer. Pose rig responds to mouse tilt.
        </p>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 12,
    width: 440,
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid #313244',
  },
  title: { fontWeight: 700, fontSize: 14, color: '#cdd6f4', flex: 1 },
  hint: { fontSize: 11, color: '#6c7086' },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#6c7086',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '2px 4px',
  },
  body: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 300,
  },
  card: {
    '--xflip-width': '240px',
    width: '240px',
  } as React.CSSProperties,
  loading: { color: '#6c7086', fontSize: 13 },
  error: { color: '#f38ba8', fontSize: 13 },
  footer: {
    fontSize: 11,
    color: '#45475a',
    textAlign: 'center' as const,
    padding: '8px 16px 12px',
    margin: 0,
    borderTop: '1px solid #313244',
  },
} as const;
