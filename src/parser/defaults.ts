/**
 * 形状默认参数 (权威来源: specs/SPEC.md §5.2 形状-参数映射)
 * 当用户指令缺少参数时使用
 */

/** 修饰词映射: "大""小"等 → 尺寸倍率 */
export const SIZE_MODIFIERS: Record<string, number> = {
  '巨大': 3.0,
  '大': 1.5,
  '中': 1.0,
  '中等': 1.0,
  '小': 0.6,
  '微小': 0.3,
  '稍微大': 1.2,
  '稍微小': 0.8,
  '更大': 1.8,
  '更小': 0.5,
};

/** 形状默认参数 */
export const SHAPE_DEFAULTS: Record<string, Record<string, unknown>> = {
  circle:    { r: 100, fill: '#000000', stroke: 'transparent', strokeWidth: 2 },
  rect:      { width: 300, height: 200, rx: 0, fill: '#000000', stroke: 'transparent' },
  triangle:  { size: 150, fill: '#000000', stroke: 'transparent' },
  line:      { x1: 0, y1: 0, x2: 200, y2: 200, stroke: '#000000', strokeWidth: 2 },
  arrow:     { fill: '#000000' },
  ellipse:   { rx: 150, ry: 100, fill: '#000000', stroke: 'transparent' },
  polygon:   { sides: 6, fill: '#000000', stroke: 'transparent' },
  text:      { fontSize: 16, fontFamily: 'sans-serif', fill: '#000000' },
};

/** 获取形状默认参数 */
export function getShapeDefaults(
  shapeType: string,
): Record<string, unknown> {
  return { ...SHAPE_DEFAULTS[shapeType] ?? { fill: '#000000' } };
}
