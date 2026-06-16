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
  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

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

    if (result.isFinal) {
      setState('idle');
      handler.onResult?.({ transcript, confidence });
    } else {
      handler.onInterim?.(transcript);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    // "no-speech" 和 "aborted" 是正常情况，不当作错误
    if (event.error === 'no-speech' || event.error === 'aborted') {
      setState('idle');
    } else {
      setState('error');
      handler.onError?.(event.error);
    }
  };

  recognition.onend = () => {
    if (state === 'listening') {
      setState('idle');
    }
  };

  return {
    start() {
      clearTimer();
      // 强制 abort 重置浏览器内部状态
      try { recognition.abort(); } catch { /* ignore */ }
      setState('listening');
      try {
        recognition.start();
      } catch {
        // 如果仍然失败，说明浏览器还没准备好，延迟重试
        setTimeout(() => {
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
          try { recognition.abort(); } catch { /* ignore */ }
          setState('idle');
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
