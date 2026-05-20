import { encode } from '@xflip/core';
import { useStudio } from '../store/context.js';

export function TopBar() {
  const { project, dispatch } = useStudio();

  const exportCard = async () => {
    if (project.layers.length === 0) {
      alert('Add at least one layer before exporting.');
      return;
    }
    const sorted = [...project.layers].sort((a, b) => a.zOrder - b.zOrder);

    // Use first layer as flat front/back fallback (FRNT/BACK)
    const firstBlob = sorted[0];
    if (!firstBlob) return;
    const firstBytes = await blobToUint8Array(firstBlob.imageBlob);

    const layers = await Promise.all(
      sorted.map(async (layer) => {
        const imageData = await blobToUint8Array(layer.imageBlob);
        return {
          layerId: layer.id % 256,
          format: mimeToFormat(layer.imageBlob.type),
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
        frontFormat: 'png' as const,
        backFormat: 'png' as const,
        flipAxis: 'horizontal' as const,
        flags: 0,
      },
      front: firstBytes,
      back: firstBytes,
      frontLayers: {
        version: 1,
        flags: 0,
        layers,
      },
    };

    const bytes = encode(file as Parameters<typeof encode>[0]);
    downloadBytes(bytes, 'card.xflip');
  };

  return (
    <header style={styles.bar}>
      <span style={styles.logo}>xflip Studio</span>
      <div style={styles.actions}>
        <button type="button" style={styles.btn} onClick={exportCard}>
          Export .xflip
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

const mimeToFormat = (mime: string): 'png' | 'jpeg' | 'webp' | 'avif' => {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/avif') return 'avif';
  return 'png';
};

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
