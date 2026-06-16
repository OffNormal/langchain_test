/**
 * 颜色名称 → Hex 映射表 (权威来源: specs/SPEC.md §5.1)
 * 仅此文件定义颜色映射，全项目引用此处
 */

const COLOR_HEX_MAP: Record<string, string> = {
  '红': '#EF4444', '红色': '#EF4444',
  '深红': '#991B1B',
  '橙': '#F97316', '橙色': '#F97316',
  '浅橙': '#FDBA74',
  '黄': '#EAB308', '黄色': '#EAB308',
  '金黄': '#F59E0B',
  '绿': '#22C55E', '绿色': '#22C55E',
  '浅绿': '#86EFAC',
  '蓝': '#3B82F6', '蓝色': '#3B82F6',
  '浅蓝': '#93C5FD',
  '紫': '#A855F7', '紫色': '#A855F7',
  '浅紫': '#D8B4FE',
  '粉': '#EC4899', '粉色': '#EC4899',
  '浅粉': '#F9A8D4',
  '黑': '#000000', '黑色': '#000000',
  '灰': '#6B7280', '灰色': '#6B7280',
  '浅灰': '#D1D5DB',
  '白': '#FFFFFF', '白色': '#FFFFFF',
  '青': '#06B6D4', '青色': '#06B6D4',
  '深蓝': '#1E3A5F',
  '棕': '#92400E', '棕色': '#92400E',
  '透明': 'transparent',
};

/**
 * 将颜色字符串解析为 Hex 值
 * 支持: "#EF4444" / "红色" / "红" / "#EF4444FF"
 */
export function resolveColor(input: string): string {
  // 已是 hex 格式
  if (/^#[0-9A-Fa-f]{6}$/.test(input)) return input;
  if (/^#[0-9A-Fa-f]{3}$/.test(input)) {
    return '#' + input[1] + input[1] + input[2] + input[2] + input[3] + input[3];
  }
  // 口语名称查找
  const hex = COLOR_HEX_MAP[input];
  if (hex) return hex;
  // 回退默认
  return '#000000';
}
