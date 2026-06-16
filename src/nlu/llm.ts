/**
 * LLM NLU 客户端 — 调用 Python FastAPI LangChain 服务
 * 规则引擎未匹配时作为兜底
 */

import type { NLUResult } from './types';

const LLM_API_BASE = '/api/nlu';

/** 调用 LLM 做 NLU 解析 */
export async function parseWithLLM(transcript: string): Promise<NLUResult> {
  const res = await fetch(LLM_API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: transcript }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error: ${res.status}`);
  }

  return res.json();
}

/** 带超时和重试的 LLM 调用 */
export async function parseWithLLMRetry(
  transcript: string,
  timeoutMs = 3000,
  retries = 1,
): Promise<NLUResult> {
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(LLM_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (i === retries) throw err;
    }
  }
  throw new Error('LLM unreachable');
}
