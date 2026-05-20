import type React from 'react';
import { useStudio } from '../store/context.js';
import { PoseGrid } from './PoseGrid.js';

export function Inspector() {
  const { project, dispatch } = useStudio();
  const layer = project.layers.find((l) => l.id === project.selectedLayerId);

  return (
    <aside style={styles.panel}>
      <div style={styles.header}>Inspector</div>

      {!layer && <p style={styles.empty}>Select a layer</p>}

      {layer && (
        <div style={styles.body}>
          <Section label="Layer">
            <Row label="Name">{layer.name}</Row>
            <Row label="Blend">
              <select
                value={layer.blendMode}
                onChange={(_e) =>
                  dispatch({
                    type: 'SET_LAYER_POSE_CELL',
                    layerId: layer.id,
                    cellIndex: project.activePoseCell,
                    keyframe: layer.pose.keyframes[project.activePoseCell] ?? {
                      tx: 0,
                      ty: 0,
                      rotationRad: 0,
                      scale: 1,
                      opacity: 1,
                    },
                  })
                }
                style={styles.select}
              >
                {BLEND_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Opacity">
              <input
                type="range"
                min={0}
                max={255}
                value={layer.opacity}
                onChange={() => {}}
                style={styles.range}
              />
              <span style={styles.val}>{Math.round((layer.opacity / 255) * 100)}%</span>
            </Row>
          </Section>

          <Section label="Pose">
            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={layer.poseEnabled}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_LAYER_POSE_ENABLED',
                    layerId: layer.id,
                    enabled: e.target.checked,
                  })
                }
              />
              Enable pose rig
            </label>
            {layer.poseEnabled && (
              <>
                <p style={styles.poseLabel}>Active cell (click to switch):</p>
                <PoseGrid />
                <KeyframeInfo
                  keyframe={
                    layer.pose.keyframes[project.activePoseCell] ?? {
                      tx: 0,
                      ty: 0,
                      rotationRad: 0,
                      scale: 1,
                      opacity: 1,
                    }
                  }
                />
              </>
            )}
          </Section>
        </div>
      )}
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{children}</span>
    </div>
  );
}

function KeyframeInfo({
  keyframe,
}: {
  keyframe: { tx: number; ty: number; rotationRad: number; scale: number; opacity: number };
}) {
  return (
    <div style={styles.kfBox}>
      <KfRow label="tx" value={keyframe.tx.toFixed(1)} unit="px" />
      <KfRow label="ty" value={keyframe.ty.toFixed(1)} unit="px" />
      <KfRow label="rot" value={(keyframe.rotationRad * (180 / Math.PI)).toFixed(1)} unit="°" />
      <KfRow label="scale" value={keyframe.scale.toFixed(3)} />
      <KfRow label="opacity" value={keyframe.opacity.toFixed(3)} />
    </div>
  );
}

function KfRow({ label, value, unit = '' }: { label: string; value: string; unit?: string }) {
  return (
    <div style={styles.kfRow}>
      <span style={styles.kfLabel}>{label}</span>
      <span style={styles.kfValue}>
        {value}
        {unit}
      </span>
    </div>
  );
}

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'color-dodge',
  'color-burn',
  'soft-light',
  'hard-light',
  'difference',
  'luminosity',
];

const styles = {
  panel: {
    width: 220,
    minWidth: 180,
    background: '#1e1e2e',
    borderLeft: '1px solid #313244',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    padding: '8px 10px',
    fontWeight: 600,
    fontSize: 13,
    color: '#cdd6f4',
    borderBottom: '1px solid #313244',
  },
  empty: { color: '#6c7086', fontSize: 12, textAlign: 'center' as const, padding: 16 },
  body: { flex: 1, overflowY: 'auto' as const },
  section: { borderBottom: '1px solid #313244', padding: '8px 10px' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6c7086',
    textTransform: 'uppercase' as const,
    marginBottom: 6,
    letterSpacing: 1,
  },
  row: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  rowLabel: { width: 52, fontSize: 12, color: '#6c7086', flexShrink: 0 },
  rowValue: { flex: 1, fontSize: 12, color: '#cdd6f4' },
  select: {
    width: '100%',
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: 12,
  },
  range: { flex: 1 },
  val: { fontSize: 11, color: '#6c7086', width: 32, textAlign: 'right' as const },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#cdd6f4',
    cursor: 'pointer',
    marginBottom: 8,
  },
  poseLabel: { fontSize: 11, color: '#6c7086', margin: '0 0 4px' },
  kfBox: { background: '#181825', borderRadius: 4, padding: '6px 8px', marginTop: 8 },
  kfRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#cdd6f4',
    padding: '1px 0',
  },
  kfLabel: { color: '#6c7086' },
  kfValue: { fontFamily: 'monospace' },
} as const;
