import type React from 'react';
import { useStudio } from '../store/context.js';

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
            <SliderRow
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
        </div>
      )}
    </aside>
  );
}

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  display: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, min, max, step, value, unit, display, onChange }: SliderRowProps) {
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
