/**
 * 坐标解析 — 相对位置词汇 → 绝对坐标
 */

import type { Point } from './types';
import { CANVAS_DEFAULT } from './types';

const W = CANVAS_DEFAULT.width;
const H = CANVAS_DEFAULT.height;

const CENTER: Point = { x: W / 2, y: H / 2 };

/** 位置词汇 → 坐标映射 */
export function resolvePosition(
  pos: string | null | undefined,
  offsetX = 0,
  offsetY = 0,
): Point {
  if (!pos) return CENTER;

  const map: Record<string, Point> = {
    '中心': CENTER,
    '居中': CENTER,
    'center': CENTER,
    '左上': { x: 200, y: 200 },
    '左上角': { x: 200, y: 200 },
    '右上': { x: W - 200, y: 200 },
    '右上角': { x: W - 200, y: 200 },
    '左下': { x: 200, y: H - 200 },
    '左下角': { x: 200, y: H - 200 },
    '右下': { x: W - 200, y: H - 200 },
    '右下角': { x: W - 200, y: H - 200 },
    '左': { x: 200, y: CENTER.y },
    '左边': { x: 200, y: CENTER.y },
    '右': { x: W - 200, y: CENTER.y },
    '右边': { x: W - 200, y: CENTER.y },
    '上': { x: CENTER.x, y: 200 },
    '上面': { x: CENTER.x, y: 200 },
    '顶部': { x: CENTER.x, y: 200 },
    '下': { x: CENTER.x, y: H - 200 },
    '下面': { x: CENTER.x, y: H - 200 },
    '底部': { x: CENTER.x, y: H - 200 },
  };

  const pt = map[pos];
  if (pt) return { x: pt.x + offsetX, y: pt.y + offsetY };
  return CENTER;
}

/** 从 NLU slots 的 position 对象解析坐标 */
export function resolvePositionFromSlots(
  pos: { x?: number | string; y?: number | string } | null | undefined,
): Point {
  const x = typeof pos?.x === 'number' ? pos.x : CENTER.x;
  const y = typeof pos?.y === 'number' ? pos.y : CENTER.y;
  return { x, y };
}
