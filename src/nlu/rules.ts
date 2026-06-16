/**
 * 规则引擎 — 精确指令快速匹配 (<5ms)
 * 仅覆盖 MVP 高频指令（见 specs/API.md §5 [MVP] 标记项）
 * 未匹配的指令交由 LLM 兜底
 */

import type { NLUResult, RuleMatch, RuleFn } from './types';

// ─── 颜色关键词 → Hex 映射 ───
const COLOR_MAP: Record<string, string> = {
  '红': '#EF4444', '红色': '#EF4444',
  '橙': '#F97316', '橙色': '#F97316',
  '黄': '#EAB308', '黄色': '#EAB308',
  '绿': '#22C55E', '绿色': '#22C55E',
  '蓝': '#3B82F6', '蓝色': '#3B82F6',
  '紫': '#A855F7', '紫色': '#A855F7',
  '粉': '#EC4899', '粉色': '#EC4899',
  '黑': '#000000', '黑色': '#000000',
  '白': '#FFFFFF', '白色': '#FFFFFF',
  '灰': '#6B7280', '灰色': '#6B7280',
  '青': '#06B6D4', '青色': '#06B6D4',
  '棕': '#92400E', '棕色': '#92400E',
};

const SHAPE_NAMES: Record<string, string> = {
  '圆': 'circle', '圆形': 'circle',
  '矩形': 'rect', '长方形': 'rect', '正方形': 'rect',
  '三角形': 'triangle',
  '直线': 'line', '线': 'line',
  '箭头': 'arrow',
};

// ─── 规则集 ───

/** 规则: 画 [颜色] 的 [形状] / 画一个 [颜色] [形状] */
const createColoredShape: RuleFn = (t) => {
  const m = t.match(
    /画(?:一个)?(?:(\S{1,3})(?:色|的))?\s*(\S{1,3})(?:形)?/,
  );
  if (!m) return null;
  const [, colorWord, shapeWord] = m;
  const shape = shapeWord ? SHAPE_NAMES[shapeWord] || null : null;
  if (!shape) return null;
  const color = colorWord ? COLOR_MAP[colorWord] || '#000000' : '#000000';
  return {
    ruleName: 'createColoredShape',
    result: {
      intent: 'CREATE_SHAPE',
      confidence: 0.95,
      slots: { shape_type: shape as NLUResult['slots']['shape_type'], fill_color: color },
    },
  };
};

/** 规则: 把填充色改成/变成 [颜色] */
const modifyColor: RuleFn = (t) => {
  const m = t.match(/(?:把(?:填充色|颜色|它)?(?:改成|变成|设为))\s*(\S{1,3})(?:色)?/);
  if (!m) return null;
  const color = COLOR_MAP[m[1]] || null;
  if (!color) return null;
  return {
    ruleName: 'modifyColor',
    result: {
      intent: 'MODIFY_OBJECT',
      confidence: 0.95,
      slots: { property: 'color', value: color },
    },
  };
};

/** 规则: 删除 / 删除 [对象] */
const deleteObject: RuleFn = (t) => {
  if (!/^(删除|去掉|移除)/.test(t)) return null;
  return {
    ruleName: 'deleteObject',
    result: {
      intent: 'DELETE_OBJECT',
      confidence: 0.95,
      slots: {},
    },
  };
};

/** 规则: 撤销 / 回退 */
const undo: RuleFn = (t) => {
  // 匹配 "撤销"/"回退" + 可选步数
  const m = t.match(/^(撤销|回退|撤回)(?:最近的?\s*(\d+)\s*步)?/);
  if (!m) {
    // 也匹配纯粹 "撤销N步" 形式
    const m2 = t.match(/^撤销\s*(\d+)\s*步/);
    if (m2) {
      return {
        ruleName: 'undoN',
        result: {
          intent: 'FILE_OPERATION',
          confidence: 0.98,
          slots: { file_action: 'undo', value: Number(m2[1]) },
        },
      };
    }
    return null;
  }
  return {
    ruleName: 'undo',
    result: {
      intent: 'FILE_OPERATION',
      confidence: 0.98,
      slots: { file_action: 'undo', value: m[2] ? Number(m[2]) : 1 },
    },
  };
};

/** 规则: 重做 */
const redo: RuleFn = (t) => {
  if (!/^(重做|恢复)/.test(t)) return null;
  return {
    ruleName: 'redo',
    result: {
      intent: 'FILE_OPERATION',
      confidence: 0.98,
      slots: { file_action: 'redo' },
    },
  };
};

/** 规则: 放大/缩小 + 可选比例 */
const zoom: RuleFn = (t) => {
  const m = t.match(/^(放大|缩小)(?:[到至]\s*(\d+)%?)?/);
  if (!m) return null;
  const dir = m[1] === '放大' ? 1 : -1;
  const level = m[2] ? Number(m[2]) / 100 : null;
  return {
    ruleName: 'zoom',
    result: {
      intent: 'NAVIGATE',
      confidence: 0.98,
      slots: {
        zoom_level: level ?? (dir > 0 ? 1.5 : 0.67),
      },
    },
  };
};

/** 规则: 平移 */
const pan: RuleFn = (t) => {
  const m = t.match(/^(向左|向右|向上|向下)\s*(?:平移|移动|挪)?\s*(\d+)?\s*(?:像素|px)?/);
  if (!m) return null;
  const dirMap: Record<string, string> = { '向左': 'left', '向右': 'right', '向上': 'up', '向下': 'down' };
  return {
    ruleName: 'pan',
    result: {
      intent: 'NAVIGATE',
      confidence: 0.95,
      slots: {
        pan_direction: dirMap[m[1]] as NLUResult['slots']['pan_direction'],
        pan_distance: m[2] ? Number(m[2]) : 200,
      },
    },
  };
};

/** 规则: 保存 / 导出 / 新建画布 / 清空 */
const fileOperations: RuleFn = (t) => {
  if (/^保存/.test(t))
    return { ruleName: 'save', result: { intent: 'FILE_OPERATION', confidence: 0.98, slots: { file_action: 'save' } } };
  if (/^导出为?\s*(PNG|SVG)/i.test(t)) {
    const m = t.match(/PNG|SVG/i);
    return { ruleName: 'export', result: { intent: 'FILE_OPERATION', confidence: 0.98, slots: { file_action: 'export', format: m![0].toLowerCase() as 'png' | 'svg' } } };
  }
  if (/^导出/.test(t))
    return { ruleName: 'exportDefault', result: { intent: 'FILE_OPERATION', confidence: 0.95, slots: { file_action: 'export', format: 'png' } } };
  if (/^(新建画布|新建)/.test(t))
    return { ruleName: 'newCanvas', result: { intent: 'FILE_OPERATION', confidence: 0.95, slots: { file_action: 'new' } } };
  if (/^清空(画布)?/.test(t))
    return { ruleName: 'clearCanvas', result: { intent: 'FILE_OPERATION', confidence: 0.98, slots: { file_action: 'new' } } };
  return null;
};

/** 规则: 适应窗口 / 重置视图 */
const resetView: RuleFn = (t) => {
  if (/^(适应窗口|重置视图|适合窗口)/.test(t)) {
    return { ruleName: 'resetView', result: { intent: 'NAVIGATE', confidence: 0.98, slots: { zoom_level: 1 } } };
  }
  return null;
};

// ─── 规则链 ───
const rules: RuleFn[] = [
  undo,
  redo,
  zoom,
  pan,
  resetView,
  createColoredShape,
  modifyColor,
  deleteObject,
  fileOperations,
];

/** 尝试所有规则，返回第一个匹配结果 */
export function matchRules(transcript: string): RuleMatch | null {
  const trimmed = transcript.trim();
  for (const rule of rules) {
    const match = rule(trimmed);
    if (match) return match;
  }
  return null;
}
