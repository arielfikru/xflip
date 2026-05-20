import type React from 'react';
import { createContext, useContext, useReducer } from 'react';
import { INITIAL_PROJECT, studioReducer } from './reducer.js';
import type { StudioAction, StudioProject } from './types.js';

interface StudioCtx {
  project: StudioProject;
  dispatch: React.Dispatch<StudioAction>;
}

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [project, dispatch] = useReducer(studioReducer, INITIAL_PROJECT);
  return <Ctx.Provider value={{ project, dispatch }}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider');
  return ctx;
}
