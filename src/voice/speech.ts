/**
 * 浏览器 SpeechRecognition API 封装
 * MVP 使用浏览器内置语音识别，V1.0+ 可替换为讯飞流式 ASR
 *
 * 已知浏览器差异：
 * - Chrome：使用 Google 云语音服务，onresult 可靠触发
 * - Edge：使用 Microsoft 云语音服务，speechstart/speechend 能触发，
 *   但云服务不可用时 onresult 永不触发，Edge 自发 abort 且无明确错误码
 *   解决：检测"检测到语音但无结果即 abort"模式，提示用户检查 Windows 在线语音识别设置
 */

export interface ASRResult {
  transcript: string;
  confidence: number;
}

export type ASRState = 'idle' | 'listening' | 'error';

export interface ASREventHandler {
  onResult?: (result: ASRResult) => void;
  onInterim?: (text: string) => void;
  onStateChange?: (state: ASRState) => void;
  onError?: (error: string) => void;
}

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export function createSpeechRecognizer(handler: ASREventHandler) {
  if (!SpeechRecognition) {
    return {
      start: () => handler.onError?.('浏览器不支持语音识别，请使用 Chrome 或 Edge'),
      stop: () => {},
      getState: (): ASRState => 'error' as const,
    };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let state: ASRState = 'idle';
  /** 递增 session id，标记当前活跃的识别会话 */
  let sessionId = 0;
  /** 最近一次主动调用 abort() 的时间戳，用于区分"我们的清理 abort"和"Edge 自发 abort" */
  let intentionalAbortAt = 0;
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  /** 本轮是否收到过至少一个 onresult（含 interim） */
  let gotAnyResult = false;
  /** 本轮是否触发过 onspeechstart（用户确实说话了） */
  let gotSpeechStart = false;

  const clearTimer = () => {
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
  };

  const setState = (s: ASRState) => {
    state = s;
    if (s !== 'listening') clearTimer();
    handler.onStateChange?.(s);
  };

  /**
   * 判断 onerror('aborted') 是否来自我们自己的清理 abort()
   * 如果在 200ms 内我们主动调过 abort()，这就是预期的清理事件，不需要报错
   */
  const isIntentionalAbort = () => Date.now() - intentionalAbortAt < 200;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript;
    const confidence = result[0].confidence;

    gotAnyResult = true;
    console.log('[voice:result]', { transcript, isFinal: result.isFinal, confidence, sessionId });

    if (result.isFinal) {
      setState('idle');
      handler.onResult?.({ transcript, confidence });
    } else {
      handler.onInterim?.(transcript);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    console.log('[voice:error]', { error: event.error, message: event.message, sessionId, gotSpeechStart, gotAnyResult });

    if (event.error === 'no-speech') {
      // 用户没说话或环境太安静，正常情况
      setState('idle');
      return;
    }

    if (event.error === 'aborted') {
      if (isIntentionalAbort()) {
        // 我们在 start()/stop() 中主动 abort，正常清理，忽略
        setState('idle');
        return;
      }
      // Edge 自发 abort：浏览器检测到语音但云服务无法返回结果
      // 这不是用户的问题，是浏览器/系统语音服务配置问题
      setState('error');
      if (gotSpeechStart && !gotAnyResult) {
        // 明确模式：检测到语音 → 无结果 → abort，Edge 云服务不可用
        handler.onError?.('recognition-service-unavailable');
      } else if (!gotAnyResult) {
        handler.onError?.('no-result');
      }
      return;
    }

    // 其他错误：network / not-allowed / audio-capture / service-not-allowed
    setState('error');
    handler.onError?.(event.error);
  };

  recognition.onend = () => {
    console.log('[voice:end]', { state, gotAnyResult, gotSpeechStart, sessionId });
    if (state === 'listening') {
      // 自然结束（continuous=false 时用户停止说话，正常完成）
      setState('idle');
      if (!gotAnyResult) {
        handler.onError?.('no-result');
      }
    }
    // state 已是 idle/error：由 onerror 或 stop() 先处理了，不再重复通知
  };

  // 调试事件：帮助排查不同浏览器下语音采集的行为差异
  recognition.onspeechstart = () => {
    gotSpeechStart = true;
    console.log('[voice:speechstart]', { sessionId });
  };
  recognition.onspeechend = () => console.log('[voice:speechend]', { sessionId });
  recognition.onaudiostart = () => console.log('[voice:audiostart]', { sessionId });
  recognition.onaudioend = () => console.log('[voice:audioend]', { sessionId });
  recognition.onsoundstart = () => console.log('[voice:soundstart]', { sessionId });
  recognition.onsoundend = () => console.log('[voice:soundend]', { sessionId });

  return {
    start() {
      clearTimer();
      const curSession = ++sessionId;
      gotAnyResult = false;
      gotSpeechStart = false;

      // 强制 abort 重置浏览器内部状态（修复 InvalidStateError）
      intentionalAbortAt = Date.now();
      try { recognition.abort(); } catch { /* ignore */ }

      setState('listening');
      try {
        recognition.start();
      } catch {
        // 浏览器还没准备好，延迟重试一次
        setTimeout(() => {
          if (sessionId !== curSession) return;
          intentionalAbortAt = Date.now();
          try { recognition.abort(); } catch { /* ignore */ }
          try {
            setState('listening');
            recognition.start();
          } catch {
            setState('error');
            handler.onError?.('语音识别启动失败');
          }
        }, 150);
        return;
      }

      // 安全网：如果浏览器既不触发 onresult 也不触发 onerror，
      // 5 秒后自动停止，避免永远卡在 listening 状态
      autoStopTimer = setTimeout(() => {
        // 只清理当前 session，忽略已过期的 timer
        if (sessionId !== curSession || state !== 'listening') return;
        console.log('[voice:timeout] 5s 兜底超时', { sessionId: curSession });
        intentionalAbortAt = Date.now();
        try { recognition.abort(); } catch { /* ignore */ }
        setState('idle');
        if (!gotAnyResult) {
          handler.onError?.('no-result');
        }
      }, 5000);
    },

    stop() {
      clearTimer();
      intentionalAbortAt = Date.now();
      try { recognition.abort(); } catch { /* ignore */ }
      setState('idle');
    },

    getState: () => state,
  };
}
