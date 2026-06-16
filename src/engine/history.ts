/**
 * Undo/Redo 历史栈 — 基于 Canvas JSON 快照
 */

import * as fabric from 'fabric';

const MAX_HISTORY = 100;

export interface HistoryManager {
  push(canvas: fabric.Canvas): void;
  undo(canvas: fabric.Canvas): boolean;
  redo(canvas: fabric.Canvas): boolean;
  readonly undoSize: number;
  readonly redoSize: number;
}

export function createHistoryManager(): HistoryManager {
  const undoStack: string[] = [];
  const redoStack: string[] = [];

  async function restore(canvas: fabric.Canvas, json: string): Promise<void> {
    return new Promise((resolve) => {
      canvas.loadFromJSON(JSON.parse(json), () => {
        canvas.requestRenderAll();
        resolve();
      });
    });
  }

  return {
    push(canvas) {
      const snapshot = JSON.stringify(canvas.toJSON());
      undoStack.push(snapshot);
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0; // 新操作清空 redo
    },

    undo(canvas) {
      if (undoStack.length === 0) return false;
      redoStack.push(JSON.stringify(canvas.toJSON()));
      const json = undoStack.pop()!;
      restore(canvas, json);
      return true;
    },

    redo(canvas) {
      if (redoStack.length === 0) return false;
      undoStack.push(JSON.stringify(canvas.toJSON()));
      const json = redoStack.pop()!;
      restore(canvas, json);
      return true;
    },

    get undoSize() { return undoStack.length; },
    get redoSize() { return redoStack.length; },
  };
}
