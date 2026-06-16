/**
 * NLU 模块入口
 * 规则引擎优先 (<5ms) → LLM 兜底
 */

import type { NLUResult } from './types';
import { matchRules } from './rules';
import { parseWithLLMRetry } from './llm';

export type { NLUResult, IntentType, ShapeType, RuleMatch } from './types';

/** 置信度阈值：低于此值提示用户重述 */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * 解析用户语音转写文本
 * 1. 规则引擎精确匹配 → 命中直接返回
 * 2. 未命中 → 调用 LLM (带超时+重试)
 * 3. LLM 失败 → 抛出错误，由调用方提示用户
 */
export async function parse(transcript: string): Promise<NLUResult> {
  const trimmed = transcript.trim();
  // 调试：输出原始文本的 charCode 以发现不可见字符
  console.log('[nlu:parse]', {
    raw: transcript,
    trimmed,
    charCodes: [...trimmed].map((c) => `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`),
  });

  // 第1级: 规则引擎
  const ruleMatch = matchRules(trimmed);
  if (ruleMatch) {
    console.log('[nlu:rule] matched:', ruleMatch.ruleName);
    return ruleMatch.result;
  }
  console.log('[nlu:rule] no match, falling back to LLM');

  // 第2级: LLM 兜底
  try {
    const result = await parseWithLLMRetry(trimmed);
    console.log('[nlu:llm] result:', result);
    return result;
  } catch (e) {
    console.error('[nlu:llm] failed:', e);
    // 降级失败 — 返回低置信度结果，由调用方提示重述
    return {
      intent: 'QUERY',
      confidence: 0,
      slots: {},
    };
  }
}

/** 判断 NLU 结果是否需要提示用户（置信度过低） */
export function isLowConfidence(result: NLUResult): boolean {
  return result.confidence < LOW_CONFIDENCE_THRESHOLD;
}
