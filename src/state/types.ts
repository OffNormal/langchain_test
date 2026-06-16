/** 绘图对象基础属性 */
export interface DrawObject {
  id: string;
  type: 'circle' | 'rect' | 'triangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'text';
  layerId: string;
  // Fabric.js 序列化的对象数据
  fabricData: Record<string, unknown>;
}

/** 图层 */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  objects: string[]; // object IDs
}

/** 操作历史记录 */
export interface HistoryEntry {
  action: string;
  timestamp: number;
  snapshot: string; // JSON serialized canvas state
}

/** 对话上下文 */
export interface DrawContext {
  lastReferencedId: string | null;
  lastAction: string | null;
}

/** 全局画布状态 */
export interface DrawingState {
  canvas: {
    width: number;
    height: number;
    zoom: number;
    panX: number;
    panY: number;
  };
  layers: Layer[];
  activeLayerId: string;
  objects: DrawObject[];
  selectedIds: string[];
  history: {
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
  };
  context: DrawContext;
}

/** 初始状态 */
export const initialDrawingState: DrawingState = {
  canvas: {
    width: 1920,
    height: 1080,
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  layers: [
    {
      id: 'layer-1',
      name: '图层 1',
      visible: true,
      locked: false,
      objects: [],
    },
  ],
  activeLayerId: 'layer-1',
  objects: [],
  selectedIds: [],
  history: {
    undoStack: [],
    redoStack: [],
  },
  context: {
    lastReferencedId: null,
    lastAction: null,
  },
};
