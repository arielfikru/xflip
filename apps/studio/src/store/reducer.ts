import { identityPose } from '@xflip/core';
import type { PoseKeyframe, StudioAction, StudioLayer, StudioProject } from './types.js';

export const INITIAL_PROJECT: StudioProject = {
  width: 480,
  height: 672,
  layers: [],
  selectedLayerId: null,
  activePoseCell: 4, // center of 3×3 grid
  gridSize: 3,
  previewNx: 0,
  previewNy: 0,
};

export function studioReducer(state: StudioProject, action: StudioAction): StudioProject {
  switch (action.type) {
    case 'ADD_LAYER':
      return {
        ...state,
        layers: [...state.layers, action.layer],
        selectedLayerId: action.layer.id,
      };

    case 'REMOVE_LAYER': {
      const layers = state.layers.filter((l) => l.id !== action.id);
      const selectedLayerId = state.selectedLayerId === action.id ? null : state.selectedLayerId;
      return { ...state, layers, selectedLayerId };
    }

    case 'SELECT_LAYER':
      return { ...state, selectedLayerId: action.id };

    case 'REORDER_LAYER':
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.id ? { ...l, zOrder: action.newZOrder } : l,
        ),
      };

    case 'SET_LAYER_POSE_CELL': {
      return {
        ...state,
        layers: state.layers.map((l) => {
          if (l.id !== action.layerId) return l;
          const keyframes = [...l.pose.keyframes] as PoseKeyframe[];
          keyframes[action.cellIndex] = action.keyframe;
          return { ...l, pose: { ...l.pose, keyframes } };
        }),
      };
    }

    case 'SET_LAYER_OPACITY':
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.layerId ? { ...l, opacity: action.opacity } : l,
        ),
      };

    case 'SET_LAYER_BLEND_MODE':
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.layerId ? { ...l, blendMode: action.blendMode } : l,
        ),
      };

    case 'SET_LAYER_EFFECT_TYPE':
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.layerId ? { ...l, effectType: action.effectType } : l,
        ),
      };

    case 'SET_LAYER_POSE_ENABLED':
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.layerId ? { ...l, poseEnabled: action.enabled } : l,
        ),
      };

    case 'SET_ACTIVE_POSE_CELL':
      return { ...state, activePoseCell: action.cellIndex };

    case 'SET_PREVIEW_TILT':
      return { ...state, previewNx: action.nx, previewNy: action.ny };

    case 'SET_DIMENSIONS':
      return { ...state, width: action.width, height: action.height };

    case 'RESET':
      return INITIAL_PROJECT;

    default:
      return state;
  }
}

let _nextId = 1;

export function createLayer(blob: Blob, url: string, zOrder: number, gridSize: 3 | 5): StudioLayer {
  return {
    id: _nextId++,
    name: blob instanceof File ? (blob as File).name.replace(/\.[^.]+$/, '') : `Layer ${zOrder}`,
    imageBlob: blob,
    imageUrl: url,
    zOrder,
    opacity: 255,
    blendMode: 'normal',
    effectType: 'base',
    poseEnabled: true,
    pose: identityPose(gridSize),
  };
}
