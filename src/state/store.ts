import { create } from 'zustand';
import type { DrawingState, DrawObject, Layer, HistoryEntry } from './types';
import { initialDrawingState } from './types';

export interface DrawingStore extends DrawingState {
  // 画布
  setCanvasSize: (width: number, height: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;

  // 对象
  addObject: (obj: DrawObject) => void;
  updateObject: (id: string, updates: Partial<DrawObject>) => void;
  removeObject: (id: string) => void;
  setSelected: (ids: string[]) => void;

  // 图层
  addLayer: (layer: Layer) => void;
  setActiveLayer: (id: string) => void;

  // 撤销/重做
  pushUndo: (entry: HistoryEntry) => void;
  popUndo: () => HistoryEntry | undefined;
  pushRedo: (entry: HistoryEntry) => void;
  popRedo: () => HistoryEntry | undefined;

  // 上下文
  setContext: (ctx: Partial<DrawingState['context']>) => void;
}

export const useStore = create<DrawingStore>((set) => ({
  ...initialDrawingState,

  setCanvasSize: (width, height) =>
    set((s) => ({ canvas: { ...s.canvas, width, height } })),

  setZoom: (zoom) =>
    set((s) => ({ canvas: { ...s.canvas, zoom } })),

  setPan: (panX, panY) =>
    set((s) => ({ canvas: { ...s.canvas, panX, panY } })),

  addObject: (obj) =>
    set((s) => ({
      objects: [...s.objects, obj],
      layers: s.layers.map((l) =>
        l.id === obj.layerId
          ? { ...l, objects: [...l.objects, obj.id] }
          : l
      ),
    })),

  updateObject: (id, updates) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, ...updates } : o
      ),
    })),

  removeObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),

  setSelected: (ids) => set({ selectedIds: ids }),

  addLayer: (layer) =>
    set((s) => ({ layers: [...s.layers, layer] })),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  pushUndo: (entry) =>
    set((s) => ({
      history: {
        undoStack: [...s.history.undoStack.slice(-99), entry],
        redoStack: [],
      },
    })),

  popUndo: () => {
    let popped: HistoryEntry | undefined;
    set((s) => {
      if (s.history.undoStack.length === 0) return s;
      popped = s.history.undoStack[s.history.undoStack.length - 1];
      return {
        history: {
          undoStack: s.history.undoStack.slice(0, -1),
          redoStack: [...s.history.redoStack, popped],
        },
      };
    });
    return popped;
  },

  pushRedo: (entry) =>
    set((s) => ({
      history: { ...s.history, redoStack: [...s.history.redoStack, entry] },
    })),

  popRedo: () => {
    let popped: HistoryEntry | undefined;
    set((s) => {
      if (s.history.redoStack.length === 0) return s;
      popped = s.history.redoStack[s.history.redoStack.length - 1];
      return {
        history: {
          ...s.history,
          redoStack: s.history.redoStack.slice(0, -1),
        },
      };
    });
    return popped;
  },

  setContext: (ctx) =>
    set((s) => ({ context: { ...s.context, ...ctx } })),
}));
