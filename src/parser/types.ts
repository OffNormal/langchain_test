/** 标准绘图指令 — NLUResult 经 Command Parser 转换后的输出 */
export interface DrawCommand {
  action: 'draw' | 'modify' | 'delete' | 'navigate' | 'file' | 'undo' | 'redo';
  target: string;
  params: Record<string, unknown>;
  idempotency_key: string;
}

/** 坐标 */
export interface Point {
  x: number;
  y: number;
}

/** 画布默认尺寸 */
export const CANVAS_DEFAULT = {
  width: 1920,
  height: 1080,
} as const;
