import { useEffect, useRef, useState, useCallback } from 'react';
import { initEngine, execute } from '@/engine';
import type { EngineContext } from '@/engine';
import { createSpeechRecognizer } from '@/voice';
import type { ASRResult } from '@/voice';
import { parse, isLowConfidence } from '@/nlu';
import { parseToCommand } from '@/parser';

type FeedbackState = 'idle' | 'listening' | 'processing' | 'done' | 'error';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<EngineContext | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [message, setMessage] = useState('点击下方按钮授权麦克风');
  const [micReady, setMicReady] = useState(false);

  // 初始化 Engine
  useEffect(() => {
    if (canvasRef.current && !ctxRef.current) {
      ctxRef.current = initEngine(canvasRef.current);
    }
  }, []);

  // 处理语音识别结果
  const handleResult = useCallback(async (asr: ASRResult) => {
    setTranscript(asr.transcript);
    setFeedback('processing');
    setMessage(`听到了: "${asr.transcript}"`);

    try {
      const nlu = await parse(asr.transcript);
      if (isLowConfidence(nlu)) {
        setMessage('没理解，请换种说法');
        setFeedback('error');
        return;
      }

      const cmd = parseToCommand(nlu);

      if (ctxRef.current) {
        execute(ctxRef.current, cmd);
        setMessage(`完成: ${cmd.action} → ${cmd.target}`);
        setFeedback('done');
      }
    } catch {
      setMessage('处理出错了，请重试');
      setFeedback('error');
    }
  }, []);

  // 语音识别器（懒创建：权限就绪后才初始化）
  const recognizerRef = useRef<ReturnType<typeof createSpeechRecognizer> | null>(null);

  const ensureRecognizer = useCallback(() => {
    if (!recognizerRef.current) {
      recognizerRef.current = createSpeechRecognizer({
        onResult: (r) => { handleResult(r); },
        onInterim: (t) => { setInterim(t); },
        onStateChange: (s) => {
          if (s === 'listening') {
            setFeedback('listening');
            setMessage('正在听...（再按空格结束）');
          } else {
            listeningRef.current = false;
          }
        },
        onError: (e) => {
          setMessage(`语音识别错误: ${e}`);
          setFeedback('error');
        },
      });
    }
    return recognizerRef.current;
  }, [handleResult]);

  // 请求麦克风权限（必须由用户点击触发）
  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 权限已获取，立即释放流（SpeechRecognition 自己会用麦克风）
      stream.getTracks().forEach((t) => t.stop());
      setMicReady(true);
      setMessage('麦克风就绪 — 按空格键开始说话');
    } catch {
      setMessage('麦克风权限被拒绝，请在浏览器设置中允许');
      setFeedback('error');
    }
  }, []);

  // 监听状态 ref（避免闭包陈旧问题）
  const listeningRef = useRef(false);

  // 开始/停止语音识别（空格键切换）
  const toggleListening = useCallback(() => {
    if (!micReady) return;
    const rec = ensureRecognizer();

    if (listeningRef.current) {
      rec.stop();
      listeningRef.current = false;
      setFeedback('idle');
      setMessage('已停止 — 按空格键重新开始');
    } else {
      rec.start();
      listeningRef.current = true;
    }
  }, [micReady, ensureRecognizer]);

  // 空格键触发
  useEffect(() => {
    if (!micReady) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [micReady, toggleListening]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 状态栏 */}
      <div style={{
        padding: '12px 24px',
        background: feedback === 'error' ? '#FEE2E2'
          : feedback === 'listening' ? '#DBEAFE'
          : feedback === 'processing' ? '#FEF3C7'
          : '#F3F4F6',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{
          width: 12, height: 12, borderRadius: '50%',
          background: feedback === 'listening' ? '#3B82F6'
            : feedback === 'processing' ? '#F59E0B'
            : feedback === 'error' ? '#EF4444'
            : '#9CA3AF',
        }} />
        <span>{message}</span>
        {interim && <span style={{ color: '#6B7280', fontStyle: 'italic' }}>{interim}</span>}
      </div>

      {/* 画布 */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, width: '100%', border: '1px solid #E5E7EB' }}
      />

      {/* 底部操作栏 */}
      <div style={{ padding: '12px 24px', textAlign: 'center' }}>
        {!micReady ? (
          <button
            onClick={requestMic}
            style={{
              padding: '12px 32px',
              fontSize: 16,
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            授权麦克风
          </button>
        ) : (
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>
            按空格键开始说话 | 试试: "画一个红色的圆" "把它改成蓝色" "撤销" "导出为PNG"
          </span>
        )}
      </div>
    </div>
  );
}
