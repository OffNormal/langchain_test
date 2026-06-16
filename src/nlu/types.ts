/** NLU 意图类型 */
export type IntentType =
  | 'CREATE_SHAPE'
  | 'MODIFY_OBJECT'
  | 'DELETE_OBJECT'
  | 'NAVIGATE'
  | 'FILE_OPERATION'
  | 'QUERY';

/** 形状类型 */
export type ShapeType =
  | 'circle'
  | 'rect'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'ellipse'
  | 'polygon'
  | 'text';

/** NLU 解析结果 */
export interface NLUResult {
  intent: IntentType;
  confidence: number;
  slots: {
    // CREATE_SHAPE
    shape_type?: ShapeType;
    radius?: number;
    width?: number;
    height?: number;
    position?: {
      x: number | 'center' | 'left' | 'right';
      y: number | 'center' | 'top' | 'bottom';
    };
    fill_color?: string;
    stroke_color?: string;
    stroke_width?: number;

    // MODIFY_OBJECT
    target_ref?: string;
    property?: 'color' | 'size' | 'position' | 'rotation' | 'text';
    value?: string | number;

    // DELETE_OBJECT
    delete_target?: string;

    // NAVIGATE
    zoom_level?: number;
    pan_direction?: 'left' | 'right' | 'up' | 'down';
    pan_distance?: number;

    // FILE_OPERATION
    file_action?: 'save' | 'export' | 'new' | 'open' | 'undo' | 'redo';
    format?: 'png' | 'svg';
    filename?: string;
  };
}

/** 规则引擎匹配结果 */
export interface RuleMatch {
  result: NLUResult;
  ruleName: string;
}

/** 规则函数签名 */
export type RuleFn = (transcript: string) => RuleMatch | null;
