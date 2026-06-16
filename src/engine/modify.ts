/**
 * 图形修改 — 修改/删除 Fabric.js 对象
 */

import * as fabric from 'fabric';
import type { DrawCommand } from '@/parser/types';

/**
 * 在 canvas 上查找对象
 * target === 'last' → 最后添加的对象
 * target === 'selected' → 选中对象
 * target === obj_id → 按 ID 查找
 */
export function findTarget(
  canvas: fabric.Canvas,
  target: string,
  lastId: string | null,
  selectedIds: string[],
): fabric.FabricObject | null {
  const objects = canvas.getObjects();

  if (target === 'last' && lastId) {
    return objects.find(
      (o) => ((o as unknown as Record<string, unknown>).voiceDrawId as string) === lastId,
    ) ?? null;
  }

  if (target === 'selected' && selectedIds.length > 0) {
    return objects.find(
      (o) => ((o as unknown as Record<string, unknown>).voiceDrawId as string) === selectedIds[0],
    ) ?? null;
  }

  // 按 ID 查找
  return objects.find(
    (o) => ((o as unknown as Record<string, unknown>).voiceDrawId as string) === target,
  ) ?? null;
}

/**
 * 执行修改指令
 */
export function applyModify(
  canvas: fabric.Canvas,
  cmd: DrawCommand,
  lastId: string | null,
  selectedIds: string[],
): boolean {
  const target = findTarget(canvas, cmd.target, lastId, selectedIds);
  if (!target) return false;

  const property = cmd.params.property as string;
  const value = cmd.params.value;

  switch (property) {
    case 'color':
    case 'fill':
      target.set('fill', value);
      break;
    case 'stroke':
      target.set('stroke', value);
      break;
    case 'size':
    case 'scale':
      if (typeof value === 'number') {
        target.scale(value);
      }
      break;
    case 'position': {
      const v = value as { dx?: number; dy?: number } | undefined;
      if (v?.dx) target.set('left', (target.left ?? 0) + v.dx);
      if (v?.dy) target.set('top', (target.top ?? 0) + v.dy);
      break;
    }
    case 'rotation':
      target.set('angle', (target.angle ?? 0) + (typeof value === 'number' ? value : 0));
      break;
    default:
      return false;
  }

  target.setCoords();
  canvas.requestRenderAll();
  return true;
}

/**
 * 执行删除指令
 */
export function applyDelete(
  canvas: fabric.Canvas,
  cmd: DrawCommand,
  lastId: string | null,
  selectedIds: string[],
): boolean {
  const target = findTarget(canvas, cmd.target, lastId, selectedIds);
  if (!target) return false;
  canvas.remove(target);
  canvas.requestRenderAll();
  return true;
}
