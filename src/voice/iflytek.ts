/**
 * 讯飞流式语音转写 (IAT) — WebSocket ASR 客户端
 *
 * 替代浏览器内置 SpeechRecognition，绕过 Edge/Chrome 云服务可用性问题。
 * 架构: 浏览器 → WebSocket → 讯飞 IAT API → 流式返回识别结果
 *
 * 前置条件:
 *   1. api/iflytek_auth.py 已启动
 *   2. 环境变量: IFLYTEK_APP_ID / IFLYTEK_API_KEY / IFLYTEK_API_SECRET
 *   3. 讯飞控制台已开通「语音听写」服务
 */

import type { ASRResult, ASRState, ASREventHandler } from './speech';

interface AuthPayload {
  url: string;
  app_id: string;
}

interface IflytekResponse {
  code: number;
  message: string;
  sid: string;
  data?: {
    result?: {
      sn: number;
      ls: boolean;
      bg: number;
      ed: number;
      ws: Array<{
        bg: number;
        ed: number;
        cw: Array<{ w: string; wp: string; sc: number }>;
      }>;
    };
  };
}

/** Int16Array → Base64 字符串，分块编码避免大数组导致栈溢出 */
function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, end)));
  }
  return btoa(binary);
}

interface IatWordSegment {
  bg: number;
  ed: number;
  cw: Array<{ w: string; wp: string; sc: number }>;
}

/** 从 ws 数组提取识别的文本 (pgs 模式下无重叠，直接拼接) */
function wsToText(ws: IatWordSegment[]): string {
  if (!ws || ws.length === 0) return '';
  return ws
    .filter((seg) => seg.cw.length > 0)
    .map((seg) => seg.cw[0].w)
    .join('');
}

export function createIflytekRecognizer(handler: ASREventHandler) {
  let state: ASRState = 'idle';
  let ws: WebSocket | null = null;
  let audioCtx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let gainNode: GainNode | null = null;
  let appId = '';

  // 识别结果
  let finalTranscript = '';
  let interimTranscript = '';
  let gotFirstResult = false;
  let resultSent = false;

  const setState = (s: ASRState) => {
    state = s;
    handler.onStateChange?.(s);
  };

  /** 调用后端生成带签名的 WebSocket URL */
  async function fetchAuth(): Promise<AuthPayload> {
    const resp = await fetch('/api/iflytek/auth');
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`讯飞鉴权失败 (${resp.status}): ${body}`);
    }
    return resp.json();
  }

  /**
   * 解析讯飞返回的 JSON 结果。
   * pgs 模式下每个响应携带当前完整识别文本，直接提取使用，
   * 不做跨响应的句子缓冲（避免 wpgs 模式下 sn 乱序导致的文本污染）。
   */
  function handleMessage(json: IflytekResponse): void {
    if (json.code !== 0) {
      console.warn('[iflytek:error]', json.code, json.message);
      return;
    }

    const result = json.data?.result;
    if (!result?.ws) return;

    const text = wsToText(result.ws);
    if (!text) return;

    // 忽略纯标点/空白帧 — 讯飞可能将句尾标点（。！？）作为独立最终帧返回，
    // 若不加过滤会覆盖掉前序正确的 interimTranscript
    if (!/[^\s。！？.!?，,、；;：:…]/.test(text)) {
      console.log('[iflytek:skip] punctuation-only frame, ignored:', text);
      // 若这是最终帧但却没有内容，回退到已经收到的 interimTranscript
      if (result.ls && interimTranscript && !finalTranscript) {
        finalTranscript = interimTranscript;
        console.log('[iflytek:final] fallback to interim:', finalTranscript);
      }
      return;
    }

    interimTranscript = text;
    gotFirstResult = true;

    if (result.ls) {
      // 最终结果
      finalTranscript = text;
      console.log('[iflytek:final]', finalTranscript);
    } else {
      // 流式中间结果 → UI 实时回显
      handler.onInterim?.(text);
      console.log('[iflytek:interim]', text);
    }
  }

  /** 构造并发送一个 JSON 帧 */
  function sendFrame(status: 0 | 1 | 2, audioBase64: string = '') {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const frame = {
      common: { app_id: appId },
      business: {
        language: 'zh_cn',
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 5000,
        dwa: 'pgs',
      },
      data: {
        status,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: audioBase64,
      },
    };
    ws.send(JSON.stringify(frame));
  }

  function cleanupAudio() {
    if (processor) {
      processor.disconnect();
      processor = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function cleanupWebSocket() {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      ws = null;
    }
  }

  function deliverResult() {
    if (resultSent) return;
    resultSent = true;
    cleanupAudio();
    cleanupWebSocket();
    setState('idle');

    if (finalTranscript) {
      handler.onResult?.({ transcript: finalTranscript, confidence: 0.9 });
    } else if (gotFirstResult && interimTranscript) {
      handler.onResult?.({ transcript: interimTranscript, confidence: 0.85 });
    } else {
      handler.onError?.('no-speech');
    }
  }

  async function start() {
    if (state === 'listening') return;
    cleanupWebSocket();
    cleanupAudio();

    gotFirstResult = false;
    resultSent = false;
    finalTranscript = '';
    interimTranscript = '';
    appId = '';

    setState('listening');

    // ── 获取鉴权 URL ──
    let auth: AuthPayload;
    try {
      auth = await fetchAuth();
      appId = auth.app_id;
    } catch (e) {
      setState('error');
      handler.onError?.(e instanceof Error ? e.message : '讯飞鉴权请求失败');
      return;
    }

    // ── 连接 WebSocket ──
    ws = new WebSocket(auth.url);

    ws.onopen = async () => {
      console.log('[iflytek:ws] connected');
      try {
        await captureMicrophone();
      } catch (e) {
        setState('error');
        handler.onError?.(e instanceof Error ? e.message : '麦克风采集失败');
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const json: IflytekResponse = JSON.parse(event.data);
        handleMessage(json);

        // 讯飞服务端 VAD 判定说话结束，返回 ls=true
        if (json.code === 0 && json.data?.result?.ls) {
          deliverResult();
        }
      } catch {
        /* 非 JSON 消息忽略 */
      }
    };

    ws.onerror = () => {
      console.error('[iflytek:ws] error');
    };

    ws.onclose = (event: CloseEvent) => {
      console.log('[iflytek:ws] closed', { code: event.code, reason: event.reason });
      if (state === 'listening' && !resultSent) {
        deliverResult();
      }
    };
  }

  async function captureMicrophone() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: { ideal: 16000 } },
    });

    const trackSettings = stream.getAudioTracks()[0]?.getSettings();
    const deviceRate = trackSettings?.sampleRate || 48000;
    audioCtx = new AudioContext({ sampleRate: deviceRate });
    console.log('[iflytek:audio]', { deviceRate, contextRate: audioCtx.sampleRate });

    const source = audioCtx.createMediaStreamSource(stream);

    processor = audioCtx.createScriptProcessor(1024, 1, 1);

    // 零音量 GainNode，避免处理器音频输出到扬声器
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;

    source.connect(processor);
    processor.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const resampleRatio = audioCtx.sampleRate / 16000;
    let isFirstFrame = true;

    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (state !== 'listening') return;

      const input = event.inputBuffer.getChannelData(0);
      let pcm: Int16Array;

      if (resampleRatio <= 1.001 && resampleRatio >= 0.999) {
        pcm = float32ToInt16(input);
      } else {
        const targetLen = Math.floor(input.length / resampleRatio);
        pcm = new Int16Array(targetLen);
        for (let i = 0; i < targetLen; i++) {
          const srcIdx = Math.round(i * resampleRatio);
          const s = Math.max(-1, Math.min(1, input[srcIdx]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
      }

      sendFrame(isFirstFrame ? 0 : 1, pcmToBase64(pcm));
      isFirstFrame = false;
    };
  }

  function stop() {
    if (state !== 'listening') return;
    // 发送结束帧
    sendFrame(2);
    // 给服务器短暂时间返回最终结果
    setTimeout(() => {
      if (!resultSent) {
        deliverResult();
      }
    }, 400);
  }

  return { start, stop, getState: () => state };
}

/** Float32Array [-1, 1] → Int16Array [-32768, 32767] */
function float32ToInt16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}
