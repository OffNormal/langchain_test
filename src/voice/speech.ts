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

  const setState = (s: ASRState) => {
    state = s;
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
    setState('error');
    handler.onError?.(event.error);
  };

  recognition.onend = () => {
    if (state === 'listening') {
      setState('idle');
    }
  };

  return {
    start() {
      if (state === 'listening') return;
      setState('listening');
      recognition.start();
    },
    stop() {
      recognition.stop();
      setState('idle');
    },
    getState: () => state,
  };
}
