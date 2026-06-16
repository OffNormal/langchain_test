/**
 * 图形创建 — DrawCommand → Fabric.js 对象
 */

import * as fabric from 'fabric';
import type { DrawCommand } from '@/parser/types';

export type ShapeFactoryResult = {
  object: fabric.FabricObject;
  id: string;
};

let _objSeq = 0;
function nextId(): string {
  return `obj_${Date.now()}_${++_objSeq}`;
}

/**
 * 根据 DrawCommand 创建 Fabric.js 对象
 */
export function createShape(cmd: DrawCommand): ShapeFactoryResult | null {
  const id = cmd.params.id as string || nextId();
  const p = cmd.params;

  let obj: fabric.FabricObject | null = null;

  switch (cmd.target) {
    case 'circle': {
      const cx = (p.cx as number) ?? 400;
      const cy = (p.cy as number) ?? 300;
      const r = (p.r as number) ?? 100;
      obj = new fabric.Circle({
        left: cx - r,
        top: cy - r,
        radius: r,
        fill: (p.fill as string) ?? '#000000',
        stroke: (p.stroke as string) ?? 'transparent',
        strokeWidth: (p.strokeWidth as number) ?? 2,
      });
      break;
    }

    case 'rect': {
      const x = (p.x as number) ?? ((p.cx as number) ?? 400) - ((p.width as number) ?? 150);
      const y = (p.y as number) ?? ((p.cy as number) ?? 300) - ((p.height as number) ?? 100);
      obj = new fabric.Rect({
        left: x,
        top: y,
        width: (p.width as number) ?? 300,
        height: (p.height as number) ?? 200,
        rx: (p.rx as number) ?? 0,
        ry: (p.rx as number) ?? 0,
        fill: (p.fill as string) ?? '#000000',
        stroke: (p.stroke as string) ?? 'transparent',
      });
      break;
    }

    case 'triangle': {
      const cx = (p.cx as number) ?? 400;
      const cy = (p.cy as number) ?? 300;
      const size = (p.size as number) ?? 150;
      obj = new fabric.Triangle({
        left: cx,
        top: cy,
        width: size,
        height: size,
        fill: (p.fill as string) ?? '#000000',
        stroke: (p.stroke as string) ?? 'transparent',
        originX: 'center',
        originY: 'center',
      });
      break;
    }

    case 'line': {
      obj = new fabric.Line(
        [(p.x1 as number) ?? 0, (p.y1 as number) ?? 0, (p.x2 as number) ?? 200, (p.y2 as number) ?? 200],
        {
          stroke: (p.stroke as string) ?? '#000000',
          strokeWidth: (p.strokeWidth as number) ?? 2,
        },
      );
      break;
    }

    case 'arrow': {
      // 简单箭头：三角形+线组合
      const fromX = (p.x1 as number) ?? (p.from_x as number) ?? 0;
      const fromY = (p.y1 as number) ?? (p.from_y as number) ?? 0;
      const toX = (p.x2 as number) ?? (p.to_x as number) ?? 200;
      const toY = (p.y2 as number) ?? (p.to_y as number) ?? 0;
      obj = new fabric.Line([fromX, fromY, toX, toY], {
        stroke: (p.stroke as string) ?? '#000000',
        strokeWidth: (p.strokeWidth as number) ?? 2,
      });
      break;
    }

    case 'text': {
      obj = new fabric.Text((p.content as string) ?? '', {
        left: (p.x as number) ?? ((p.cx as number) ?? 400),
        top: (p.y as number) ?? ((p.cy as number) ?? 300),
        fontSize: (p.fontSize as number) ?? 16,
        fontFamily: (p.fontFamily as string) ?? 'sans-serif',
        fill: (p.fill as string) ?? '#000000',
        originX: 'center',
        originY: 'center',
      });
      break;
    }

    default:
      return null;
  }

  if (obj) {
    // 附加自定义属性用于序列化
    (obj as unknown as Record<string, unknown>).voiceDrawId = id;

    // 覆盖 toObject 确保 voiceDrawId 在 canvas.toJSON() 中保留，
    // 否则 undo/redo (loadFromJSON) 会丢失该属性，导致后续 modify 找不到目标
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalToObject = obj.toObject.bind(obj) as (props?: any[]) => Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    obj.toObject = function (this: fabric.FabricObject, ...args: any[]) {
      return {
        ...originalToObject(...args),
        voiceDrawId: (this as unknown as Record<string, unknown>).voiceDrawId,
      };
    };

    return { object: obj, id };
  }

  return null;
}
