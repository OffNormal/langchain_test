/**
 * 浏览器 SpeechRecognition API 封装
 * MVP 使用浏览器内置语音识别，V1.0+ 可替换为讯飞流式 ASR
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
  /** 递增版本号，供异步事件回调判断自己是否来自已废弃的 session */
  let sessionId = 0;
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  /** 本轮是否收到过任何结果（含 interim） */
  let gotAnyResult = false;

  const clearTimer = () => {
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
  };

  const setState = (s: ASRState) => {
    state = s;
    if (s !== 'listening') clearTimer();
    handler.onStateChange?.(s);
  };

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
    console.log('[voice:error]', { error: event.error, message: event.message, sessionId });
    // "no-speech" 和 "aborted" 是正常情况，不当作错误
    if (event.error === 'no-speech' || event.error === 'aborted') {
      setState('idle');
    } else {
      setState('error');
      handler.onError?.(event.error);
    }
  };

  recognition.onend = () => {
    console.log('[voice:end]', { state, gotAnyResult, sessionId });
    const wasListening = state === 'listening';
    if (wasListening) {
      setState('idle');
      // Edge 可能静默失败：start 成功但没触发任何 onresult
      // 识别自然结束时若没有任何结果，通知用户
      if (!gotAnyResult) {
        handler.onError?.('no-result');
      }
    }
  };

  // 调试事件：帮助排查 Edge 下语音采集是否正常工作
  recognition.onspeechstart = () => console.log('[voice:speechstart]', { sessionId });
  recognition.onspeechend = () => console.log('[voice:speechend]', { sessionId });
  recognition.onaudiostart = () => console.log('[voice:audiostart]', { sessionId });
  recognition.onaudioend = () => console.log('[voice:audioend]', { sessionId });
  recognition.onsoundstart = () => console.log('[voice:soundstart]', { sessionId });
  recognition.onsoundend = () => console.log('[voice:soundend]', { sessionId });

  return {
    start() {
      clearTimer();
      // 递增 session，让旧的异步事件可以识别自己是 stale 的
      const curSession = ++sessionId;
      gotAnyResult = false;
      // 强制 abort 重置浏览器内部状态
      try { recognition.abort(); } catch { /* ignore */ }
      setState('listening');
      try {
        recognition.start();
      } catch {
        // 如果仍然失败，说明浏览器还没准备好，延迟重试
        setTimeout(() => {
          // 只在新 session 仍是当前 session 时重试
          if (sessionId !== curSession) return;
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
      // 5 秒兜底超时
      autoStopTimer = setTimeout(() => {
        if (state === 'listening') {
          console.log('[voice:timeout] 5s 超时，自动停止', { sessionId: curSession });
          try { recognition.abort(); } catch { /* ignore */ }
          setState('idle');
          if (!gotAnyResult) {
            handler.onError?.('no-result');
          }
        }
      }, 5000);
    },

    stop() {
      clearTimer();
      try { recognition.abort(); } catch { /* ignore */ }
      setState('idle');
    },

    getState: () => state,
  };
}
