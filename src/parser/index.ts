/**
 * Command Parser — NLUResult → DrawCommand
 * 坐标解析 + 颜色映射 + 默认值填充 + 幂等键生成
 */

import type { NLUResult } from '@/nlu/types';
import type { DrawCommand } from './types';
import { CANVAS_DEFAULT } from './types';
import { resolveColor } from './colors';
import { resolvePositionFromSlots, resolvePosition } from './coords';
import { getShapeDefaults } from './defaults';

let _cmdSeq = 0;
function idempotencyKey(): string {
  return `cmd_${Date.now()}_${++_cmdSeq}`;
}

/** NLUResult → DrawCommand */
export function parseToCommand(nlu: NLUResult): DrawCommand {
  const base = { idempotency_key: idempotencyKey() };

  switch (nlu.intent) {
    // ── 创建图形 ──
    case 'CREATE_SHAPE': {
      const shape = nlu.slots.shape_type || 'circle';
      const defaults = getShapeDefaults(shape);
      const pos = resolvePositionFromSlots(nlu.slots.position);
      const color = nlu.slots.fill_color
        ? resolveColor(nlu.slots.fill_color)
        : (defaults.fill as string) ?? '#000000';

      const params: Record<string, unknown> = { ...defaults, fill: color };
      if (nlu.slots.radius) params.r = nlu.slots.radius;
      if (nlu.slots.width) params.width = nlu.slots.width;
      if (nlu.slots.height) params.height = nlu.slots.height;
      params.cx = pos.x;
      params.cy = pos.y;

      return { ...base, action: 'draw', target: shape, params };
    }

    // ── 修改图形 ──
    case 'MODIFY_OBJECT': {
      const params: Record<string, unknown> = {};
      if (nlu.slots.property) params.property = nlu.slots.property;
      if (nlu.slots.value !== undefined) {
        params.value = nlu.slots.property === 'color'
          ? resolveColor(String(nlu.slots.value))
          : nlu.slots.value;
      }
      return {
        ...base,
        action: 'modify',
        target: (nlu.slots.target_ref as string) || 'last',
        params,
      };
    }

    // ── 删除 ──
    case 'DELETE_OBJECT':
      return {
        ...base,
        action: 'delete',
        target: (nlu.slots.delete_target as string) || 'last',
        params: {},
      };

    // ── 导航 ──
    case 'NAVIGATE': {
      const params: Record<string, unknown> = {};
      if (nlu.slots.zoom_level != null) {
        params.zoom = nlu.slots.zoom_level === 1 ? 'reset' : nlu.slots.zoom_level;
      }
      if (nlu.slots.pan_direction) {
        const dist = nlu.slots.pan_distance || 200;
        const dir = nlu.slots.pan_direction;
        params.pan = {
          dx: dir === 'left' ? -dist : dir === 'right' ? dist : 0,
          dy: dir === 'up' ? -dist : dir === 'down' ? dist : 0,
        };
      }
      return { ...base, action: 'navigate', target: 'canvas', params };
    }

    // ── 文件操作 / 撤销重做 ──
    case 'FILE_OPERATION': {
      const action = nlu.slots.file_action;
      if (action === 'undo') {
        return { ...base, action: 'undo', target: 'history', params: { steps: nlu.slots.value ?? 1 } };
      }
      if (action === 'redo') {
        return { ...base, action: 'redo', target: 'history', params: { steps: 1 } };
      }
      if (action === 'save' || action === 'export' || action === 'new') {
        return {
          ...base,
          action: 'file',
          target: action,
          params: {
            format: nlu.slots.format || 'png',
            name: nlu.slots.filename,
            width: CANVAS_DEFAULT.width,
            height: CANVAS_DEFAULT.height,
          },
        };
      }
      // 未识别的文件操作，默认保存
      return { ...base, action: 'file', target: 'save', params: {} };
    }

    // ── QUERY ──
    default:
      return { ...base, action: 'file', target: 'help', params: {} };
  }
}
