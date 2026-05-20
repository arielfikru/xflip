import { useStudio } from '../store/context.js';

/** 3×3 pose cell selector. Click = activate cell. */
export function PoseGrid() {
  const { project, dispatch } = useStudio();
  const g = project.gridSize;
  const cells = Array.from({ length: g * g }, (_, i) => i);

  return (
    <div style={styles.container}>
      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${g}, 1fr)` }}>
        {cells.map((i) => {
          const row = Math.floor(i / g);
          const col = i % g;
          const nx = (col / (g - 1)) * 2 - 1;
          const ny = (row / (g - 1)) * 2 - 1;
          const isCenter = i === Math.floor((g * g) / 2);
          const isActive = i === project.activePoseCell;

          return (
            <button
              type="button"
              key={i}
              title={`nx=${nx.toFixed(2)}, ny=${ny.toFixed(2)}`}
              style={{
                ...styles.cell,
                ...(isActive ? styles.cellActive : {}),
                ...(isCenter ? styles.cellCenter : {}),
              }}
              onClick={() => {
                dispatch({ type: 'SET_ACTIVE_POSE_CELL', cellIndex: i });
                dispatch({ type: 'SET_PREVIEW_TILT', nx, ny });
              }}
            >
              {isCenter ? '●' : ''}
            </button>
          );
        })}
      </div>
      <p style={styles.hint}>Cell {project.activePoseCell} — move selected layer to set keyframe</p>
    </div>
  );
}

const styles = {
  container: { padding: '8px 10px' },
  grid: {
    display: 'grid',
    gap: 3,
    width: 96,
    height: 96,
  },
  cell: {
    background: '#313244',
    border: '1px solid #45475a',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 10,
    color: '#6c7086',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  cellActive: {
    background: '#89b4fa',
    borderColor: '#89b4fa',
    color: '#1e1e2e',
  },
  cellCenter: {
    borderColor: '#a6e3a1',
  },
  hint: {
    fontSize: 11,
    color: '#6c7086',
    margin: '6px 0 0',
  },
} as const;
