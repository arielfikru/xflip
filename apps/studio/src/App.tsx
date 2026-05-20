import { Canvas } from './components/Canvas.js';
import { Inspector } from './components/Inspector.js';
import { LayerPanel } from './components/LayerPanel.js';
import { TopBar } from './components/TopBar.js';
import { StudioProvider } from './store/context.js';

export function App() {
  return (
    <StudioProvider>
      <div style={styles.root}>
        <TopBar />
        <div style={styles.body}>
          <LayerPanel />
          <Canvas />
          <Inspector />
        </div>
      </div>
    </StudioProvider>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: '#181825',
    color: '#cdd6f4',
    fontFamily: 'system-ui, sans-serif',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
} as const;
