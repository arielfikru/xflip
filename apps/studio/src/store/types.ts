import type { PoseKeyframe, XflipPose } from '@xflip/core';

export type { PoseKeyframe, XflipPose };

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
  /** Whether to include a pOse chunk for this layer. */
  poseEnabled: boolean;
  pose: XflipPose;
}

/** Studio project: flat + layered card state. */
export interface StudioProject {
  /** Canvas dimensions in pixels. */
  width: number;
  height: number;
  layers: StudioLayer[];
  /** Currently selected layer id, or null. */
  selectedLayerId: number | null;
  /** Active pose cell index [0, gridSize²). */
  activePoseCell: number;
  /** Grid size for all layers. */
  gridSize: 3 | 5;
  /** Preview tilt as normalized [-1, +1]. */
  previewNx: number;
  previewNy: number;
}

export type StudioAction =
  | { type: 'ADD_LAYER'; layer: StudioLayer }
  | { type: 'REMOVE_LAYER'; id: number }
  | { type: 'SELECT_LAYER'; id: number | null }
  | { type: 'REORDER_LAYER'; id: number; newZOrder: number }
  | { type: 'SET_LAYER_POSE_CELL'; layerId: number; cellIndex: number; keyframe: PoseKeyframe }
  | { type: 'SET_LAYER_POSE_ENABLED'; layerId: number; enabled: boolean }
  | { type: 'SET_ACTIVE_POSE_CELL'; cellIndex: number }
  | { type: 'SET_PREVIEW_TILT'; nx: number; ny: number }
  | { type: 'SET_DIMENSIONS'; width: number; height: number }
  | { type: 'RESET' };
