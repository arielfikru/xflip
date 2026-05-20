/** One layer in the studio project. */
export interface StudioLayer {
  id: number;
  name: string;
  /** Original file blob (PNG/WebP/…) as loaded by the user. */
  imageBlob: Blob;
  /** Object URL for rendering. Revoked on layer removal. */
  imageUrl: string;
  zOrder: number;
  opacity: number; // 0–255, maps to CSS opacity
  blendMode: string; // CSS mix-blend-mode value
  effectType: string;
}

/** Studio project: flat layered card state. */
export interface StudioProject {
  /** Canvas dimensions in pixels. */
  width: number;
  height: number;
  layers: StudioLayer[];
  /** Currently selected layer id, or null. */
  selectedLayerId: number | null;
}

export type StudioAction =
  | { type: 'ADD_LAYER'; layer: StudioLayer }
  | { type: 'REMOVE_LAYER'; id: number }
  | { type: 'SELECT_LAYER'; id: number | null }
  | { type: 'REORDER_LAYER'; id: number; newZOrder: number }
  | { type: 'SET_LAYER_OPACITY'; layerId: number; opacity: number }
  | { type: 'SET_LAYER_BLEND_MODE'; layerId: number; blendMode: string }
  | { type: 'SET_LAYER_EFFECT_TYPE'; layerId: number; effectType: string }
  | { type: 'SET_DIMENSIONS'; width: number; height: number }
  | { type: 'RESET' };
