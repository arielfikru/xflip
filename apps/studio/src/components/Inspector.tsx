import type React from 'react';
import { useStudio } from '../store/context.js';
import type { PoseKeyframe } from '../store/types.js';
import { PoseGrid } from './PoseGrid.js';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function Inspector() {
  const { project, dispatch } = useStudio();
  const layer = project.layers.find((l) => l.id === project.selectedLayerId);

  const identity: PoseKeyframe = {
    tx: 0,
    ty: 0,
    rotationXRad: 0,
    rotationYRad: 0,
    scale: 1,
    opacity: 1,
  };
  const activeKf: PoseKeyframe = layer
    ? (layer.pose.keyframes[project.activePoseCell] ?? identity)
    : identity;

  const setKf = (patch: Partial<PoseKeyframe>) => {
    if (!layer) return;
    dispatch({
      type: 'SET_LAYER_POSE_CELL',
      layerId: layer.id,
      cellIndex: project.activePoseCell,
      keyframe: { ...activeKf, ...patch },
    });
  };

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
                onChange={(e) =>
                  dispatch({
                    type: 'SET_LAYER_BLEND_MODE',
                    layerId: layer.id,
                    blendMode: e.target.value,
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
            <Row label="Effect">
              <select
                value={layer.effectType}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_LAYER_EFFECT_TYPE',
                    layerId: layer.id,
                    effectType: e.target.value,
                  })
                }
                style={styles.select}
              >
                {EFFECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Row>
            <PoseSliderRow
              label="Opacity"
              min={0}
              max={255}
              step={1}
              value={layer.opacity}
              unit="%"
              display={Math.round((layer.opacity / 255) * 100)}
              onChange={(v) =>
                dispatch({ type: 'SET_LAYER_OPACITY', layerId: layer.id, opacity: v })
              }
            />
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
                <div style={styles.kfControls}>
                  <PoseSliderRow
                    label="tx"
                    min={-500}
                    max={500}
                    step={1}
                    value={activeKf.tx}
                    unit="px"
                    display={Math.round(activeKf.tx)}
                    onChange={(v) => setKf({ tx: v })}
                  />
                  <PoseSliderRow
                    label="ty"
                    min={-500}
                    max={500}
                    step={1}
                    value={activeKf.ty}
                    unit="px"
                    display={Math.round(activeKf.ty)}
                    onChange={(v) => setKf({ ty: v })}
                  />
                  <PoseSliderRow
                    label="rotX"
                    min={-180}
                    max={180}
                    step={1}
                    value={Math.round(activeKf.rotationXRad * RAD_TO_DEG)}
                    unit="°"
                    display={Math.round(activeKf.rotationXRad * RAD_TO_DEG)}
                    onChange={(v) => setKf({ rotationXRad: v * DEG_TO_RAD })}
                  />
                  <PoseSliderRow
                    label="rotY"
                    min={-180}
                    max={180}
                    step={1}
                    value={Math.round(activeKf.rotationYRad * RAD_TO_DEG)}
                    unit="°"
                    display={Math.round(activeKf.rotationYRad * RAD_TO_DEG)}
                    onChange={(v) => setKf({ rotationYRad: v * DEG_TO_RAD })}
                  />
                  <PoseSliderRow
                    label="scale"
                    min={0.01}
                    max={5}
                    step={0.01}
                    value={activeKf.scale}
                    unit=""
                    display={Number(activeKf.scale.toFixed(2))}
                    onChange={(v) => setKf({ scale: v })}
                  />
                  <PoseSliderRow
                    label="opacity"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(activeKf.opacity * 100)}
                    unit="%"
                    display={Math.round(activeKf.opacity * 100)}
                    onChange={(v) => setKf({ opacity: v / 100 })}
                  />
                </div>
              </>
            )}
          </Section>
        </div>
      )}
    </aside>
  );
}

interface PoseSliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  display: number;
  onChange: (v: number) => void;
}

function PoseSliderRow({
  label,
  min,
  max,
  step,
  value,
  unit,
  display,
  onChange,
}: PoseSliderRowProps) {
  return (
    <div style={styles.sliderRow}>
      <span style={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.range}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        style={styles.numberInput}
      />
      {unit && <span style={styles.unit}>{unit}</span>}
    </div>
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
  'plus-lighter',
];

const EFFECT_TYPES = [
  { value: 'base', label: 'Base' },
  { value: 'static_overlay', label: 'Static Overlay' },
  { value: 'holo_sweep', label: 'Holo Sweep' },
  { value: 'specular', label: 'Specular' },
  { value: 'sparkle', label: 'Sparkle' },
  { value: 'parallax', label: 'Parallax' },
  { value: 'foil', label: 'Foil' },
  { value: 'border_foil', label: 'Border Foil' },
  { value: 'border_glow', label: 'Border Glow' },
  { value: 'aurora', label: 'Aurora' },
];

const styles = {
  panel: {
    width: 240,
    minWidth: 200,
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
  kfControls: { marginTop: 6 },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  sliderLabel: { width: 36, fontSize: 11, color: '#6c7086', flexShrink: 0 },
  range: { flex: 1, minWidth: 0 },
  numberInput: {
    width: 48,
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 3,
    padding: '1px 3px',
    fontSize: 11,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  unit: { fontSize: 10, color: '#6c7086', width: 14, flexShrink: 0 },
} as const;
