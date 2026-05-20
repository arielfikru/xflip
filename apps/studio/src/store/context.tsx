import type React from 'react';
import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { clearProject, loadProject, saveProject } from './db.js';
import { INITIAL_PROJECT, studioReducer } from './reducer.js';
import type { StudioAction, StudioProject } from './types.js';

interface StudioCtx {
  project: StudioProject;
  dispatch: React.Dispatch<StudioAction>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [project, rawDispatch] = useReducer(studioReducer, INITIAL_PROJECT);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Wrap dispatch to reset RESET action — also clear DB */
  const dispatch: React.Dispatch<StudioAction> = (action) => {
    rawDispatch(action);
    if (action.type === 'RESET') {
      clearProject().catch(() => {});
    }
  };

  /** Load persisted project on mount */
  useEffect(() => {
    loadProject()
      .then((saved) => {
        if (saved) {
          // Replay all layers individually so reducer IDs stay consistent
          for (const layer of saved.layers) {
            rawDispatch({ type: 'ADD_LAYER', layer });
          }
          rawDispatch({ type: 'SET_DIMENSIONS', width: saved.width, height: saved.height });
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Debounced autosave: 1.5 s after last change */
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saving');
      saveProject(project)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [project, ready]);

  return <Ctx.Provider value={{ project, dispatch, saveStatus }}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider');
  return ctx;
}
