/**
 * Drawing Engine — DrawCommand 主入口
 * 调度 create/modify/delete/navigate/undo/redo/file 操作
 */

import * as fabric from 'fabric';
import type { DrawCommand } from '@/parser/types';
import { createShape } from './shapes';
import { applyModify, applyDelete } from './modify';
import { createHistoryManager } from './history';
import type { HistoryManager } from './history';

export type { HistoryManager };

export interface EngineContext {
  canvas: fabric.Canvas;
  history: HistoryManager;
  lastCreatedId: string | null;
  selectedIds: string[];
}

/**
 * 初始化 Drawing Engine
 */
export function initEngine(canvasEl: HTMLCanvasElement): EngineContext {
  const canvas = new fabric.Canvas(canvasEl, {
    width: 1920,
    height: 1080,
    backgroundColor: '#ffffff',
  });

  return {
    canvas,
    history: createHistoryManager(),
    lastCreatedId: null,
    selectedIds: [],
  };
}

/**
 * 执行单条 DrawCommand
 */
export function execute(ctx: EngineContext, cmd: DrawCommand): string | null {
  // 非导航/撤销/重做的修改类操作前保存快照
  const needsSnapshot =
    !['navigate', 'undo', 'redo'].includes(cmd.action);

  if (needsSnapshot) {
    ctx.history.push(ctx.canvas);
  }

  let newId: string | null = null;

  switch (cmd.action) {
    case 'draw': {
      const result = createShape(cmd);
      if (result) {
        ctx.canvas.add(result.object);
        ctx.canvas.requestRenderAll();
        newId = result.id;
        ctx.lastCreatedId = result.id;
      }
      break;
    }

    case 'modify': {
      const ok = applyModify(ctx.canvas, cmd, ctx.lastCreatedId, ctx.selectedIds);
      if (!ok) throw new Error(`找不到要修改的对象 (target: ${cmd.target})`);
      break;
    }

    case 'delete': {
      const ok = applyDelete(ctx.canvas, cmd, ctx.lastCreatedId, ctx.selectedIds);
      if (!ok) throw new Error(`找不到要删除的对象 (target: ${cmd.target})`);
      break;
    }

    case 'navigate': {
      const p = cmd.params;
      if (p.zoom === 'reset') {
        ctx.canvas.setZoom(1);
        ctx.canvas.absolutePan(new fabric.Point(0, 0));
      } else if (typeof p.zoom === 'number') {
        const z = ctx.canvas.getZoom() * (p.zoom as number);
        ctx.canvas.setZoom(Math.max(0.1, Math.min(5, z)));
      }
      if (p.pan) {
        const pan = p.pan as { dx: number; dy: number };
        const vpt = ctx.canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
        vpt[4] += pan.dx;
        vpt[5] += pan.dy;
        ctx.canvas.requestRenderAll();
      }
      break;
    }

    case 'undo': {
      const steps = (cmd.params.steps as number) ?? 1;
      for (let i = 0; i < steps; i++) {
        ctx.history.undo(ctx.canvas);
      }
      break;
    }

    case 'redo': {
      const steps = (cmd.params.steps as number) ?? 1;
      for (let i = 0; i < steps; i++) {
        ctx.history.redo(ctx.canvas);
      }
      break;
    }

    case 'file': {
      if (cmd.target === 'export') {
        const format = (cmd.params.format as string) ?? 'png';
        const dataURL =
          format === 'svg'
            ? ctx.canvas.toSVG()
            : ctx.canvas.toDataURL({ format: 'png', multiplier: 2 });
        if (typeof dataURL === 'string') {
          const link = document.createElement('a');
          link.download = `drawing.${format}`;
          link.href = dataURL as string;
          link.click();
        }
      } else if (cmd.target === 'new') {
        ctx.canvas.clear();
        ctx.canvas.backgroundColor = '#ffffff';
        ctx.canvas.requestRenderAll();
      }
      break;
    }
  }

  return newId;
}
