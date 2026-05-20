import { encode } from '@xflip/core';
import { useState } from 'react';
import { useStudio } from '../store/context.js';

type ExportCodec = 'webp' | 'avif' | 'png';

export function TopBar() {
  const { project, dispatch } = useStudio();
  const [codec, setCodec] = useState<ExportCodec>('webp');
  const [quality, setQuality] = useState(85);
  const [exporting, setExporting] = useState(false);

  const exportCard = async () => {
    if (project.layers.length === 0) {
      alert('Add at least one layer before exporting.');
      return;
    }
    setExporting(true);
    try {
      const sorted = [...project.layers].sort((a, b) => a.zOrder - b.zOrder);
      const firstLayer = sorted[0];
      if (!firstLayer) return;

      const mime = codec === 'avif' ? 'image/avif' : codec === 'webp' ? 'image/webp' : 'image/png';
      const q = codec === 'png' ? undefined : quality / 100;

      const reencodeBlob = (blob: Blob) =>
        blobToReencoded(blob, project.width, project.height, mime, q);

      const firstEncoded = await reencodeBlob(firstLayer.imageBlob);
      const firstBytes = await blobToUint8Array(firstEncoded);

      const layers = await Promise.all(
        sorted.map(async (layer, idx) => {
          const encoded = await reencodeBlob(layer.imageBlob);
          const imageData = await blobToUint8Array(encoded);
          return {
            layerId: idx % 256,
            format: codec,
            blendMode: cssToXflipBlend(layer.blendMode),
            effectType: layer.effectType || 'base',
            opacity: layer.opacity,
            zOrder: layer.zOrder,
            response: {},
            imageData,
            ...(layer.poseEnabled ? { pose: layer.pose } : {}),
          } as const;
        }),
      );

      const file = {
        versionMajor: 1,
        versionMinor: 2,
        head: {
          width: project.width,
          height: project.height,
          frontFormat: codec,
          backFormat: codec,
          flipAxis: 'horizontal' as const,
          flags: 0,
        },
        front: firstBytes,
        back: firstBytes,
        frontLayers: { version: 1, flags: 0, layers },
      };

      const bytes = encode(file as Parameters<typeof encode>[0]);
      downloadBytes(bytes, 'card.xflip');
    } finally {
      setExporting(false);
    }
  };

  return (
    <header style={styles.bar}>
      <span style={styles.logo}>xflip Studio</span>
      <div style={styles.settings}>
        <label style={styles.settingLabel}>
          Codec
          <select
            value={codec}
            onChange={(e) => setCodec(e.target.value as ExportCodec)}
            style={styles.select}
          >
            <option value="webp">WebP</option>
            <option value="avif">AVIF</option>
            <option value="png">PNG</option>
          </select>
        </label>
        {codec !== 'png' && (
          <label style={styles.settingLabel}>
            Q {quality}
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              style={styles.qualitySlider}
            />
          </label>
        )}
      </div>
      <div style={styles.actions}>
        <button type="button" style={styles.btn} onClick={exportCard} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export .xflip'}
        </button>
        <button
          type="button"
          style={{ ...styles.btn, ...styles.btnDanger }}
          onClick={() => dispatch({ type: 'RESET' })}
        >
          Reset
        </button>
      </div>
    </header>
  );
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

const blobToUint8Array = (blob: Blob): Promise<Uint8Array> =>
  blob.arrayBuffer().then((buf) => new Uint8Array(buf));

function blobToReencoded(
  blob: Blob,
  maxW: number,
  maxH: number,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = maxW;
      canvas.height = maxH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas 2d unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, maxW, maxH);
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('toBlob failed'));
        },
        mime,
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

const downloadBytes = (bytes: Uint8Array, name: string) => {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const styles = {
  bar: {
    height: 44,
    background: '#181825',
    borderBottom: '1px solid #313244',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 12,
    flexShrink: 0,
  },
  logo: { fontWeight: 700, fontSize: 15, color: '#cdd6f4', flex: 1 },
  settings: { display: 'flex', alignItems: 'center', gap: 10 },
  settingLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: '#6c7086',
  },
  select: {
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: 12,
  },
  qualitySlider: { width: 72, cursor: 'pointer' },
  actions: { display: 'flex', gap: 8 },
  btn: {
    background: '#89b4fa',
    color: '#1e1e2e',
    border: 'none',
    borderRadius: 5,
    padding: '5px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  btnDanger: { background: '#f38ba8' },
} as const;
