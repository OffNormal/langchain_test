import { useEffect, useRef, useState, useCallback } from 'react';
import { initEngine, execute } from '@/engine';
import type { EngineContext } from '@/engine';
import { createSpeechRecognizer } from '@/voice';
import type { ASRResult } from '@/voice';
import { parse, isLowConfidence } from '@/nlu';
import { parseToCommand } from '@/parser';

type FeedbackState = 'idle' | 'listening' | 'processing' | 'done' | 'error';
type PipelineStep = 'idle' | 'asr' | 'nlu' | 'parser' | 'engine' | 'error';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<EngineContext | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [message, setMessage] = useState('点击下方按钮授权麦克风');
  const [micReady, setMicReady] = useState(false);
  const [step, setStep] = useState<PipelineStep>('idle');
  const [errors, setErrors] = useState<string[]>([]);

  const addError = useCallback((msg: string) => {
    console.error('[语音绘图]', msg);
    setErrors((prev) => [...prev.slice(-4), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

  // 初始化 Engine
  useEffect(() => {
    if (canvasRef.current && !ctxRef.current) {
      ctxRef.current = initEngine(canvasRef.current);
    }
  }, []);

  // 处理语音识别结果
  const handleResult = useCallback(async (asr: ASRResult) => {
    const text = asr.transcript.trim();
    if (!text) {
      setMessage('没有识别到内容，请再说一次');
      setFeedback('idle');
      return;
    }

    setTranscript(text);
    setFeedback('processing');
    setStep('nlu');
    setMessage(`NLU 解析中: "${text}"`);

    try {
      // ── Step 1: NLU ──
      const nlu = await parse(text);

      if (nlu.confidence === 0) {
        setStep('error');
        setFeedback('error');
        addError(`NLU 失败: "${text}" → 规则未匹配且 LLM 不可用，请确保 Python API 已启动`);
        setMessage('无法理解，请换种说法。提示: 试试 "画一个红色的圆"');
        return;
      }

      if (isLowConfidence(nlu)) {
        setStep('error');
        setFeedback('error');
        setMessage(`没理解 "${text}"，请换种说法 (置信度: ${nlu.confidence.toFixed(2)})`);
        return;
      }

      // ── Step 2: Parser ──
      setStep('parser');
      const cmd = parseToCommand(nlu);

      // ── Step 3: Engine ──
      setStep('engine');
      if (!ctxRef.current) {
        addError('画布未初始化');
        setMessage('画布未就绪，请刷新页面');
        setFeedback('error');
        return;
      }

      execute(ctxRef.current, cmd);
      setStep('idle');
      setMessage(`完成: ${cmd.action} → ${cmd.target}`);
      setFeedback('done');

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      addError(`管道异常 @${step}: ${errMsg}`);
      setStep('error');
      setFeedback('error');
      setMessage(`处理出错: ${errMsg}`);
    }
  }, [step, addError]);

  // 语音识别器
  const recognizerRef = useRef<ReturnType<typeof createSpeechRecognizer> | null>(null);

  const ensureRecognizer = useCallback(() => {
    if (!recognizerRef.current) {
      recognizerRef.current = createSpeechRecognizer({
        onResult: (r) => { handleResult(r); },
        onInterim: (t) => { setInterim(t); setStep('asr'); },
        onStateChange: (s) => {
          if (s === 'listening') {
            setFeedback('listening');
            setStep('asr');
            setMessage('正在听...（再按空格结束）');
          } else if (s === 'error') {
            setStep('error');
            setFeedback('error');
          }
        },
        onError: (e) => {
          addError(`语音识别: ${e}`);
          if (e === 'not-allowed') {
            setMessage('麦克风权限不足，请刷新后重新授权');
          } else if (e === 'no-speech') {
            setMessage('没有检测到语音，请再说一次');
          } else if (e === 'audio-capture') {
            setMessage('找不到麦克风设备');
          } else if (e === 'network') {
            setMessage('语音识别需要联网');
          } else {
            setMessage(`语音识别错误: ${e}`);
          }
          setFeedback('error');
        },
      });
    }
    return recognizerRef.current;
  }, [handleResult, addError]);

  // 请求麦克风权限
  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicReady(true);
      setMessage('麦克风就绪 — 按空格键开始说话');
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      addError(`麦克风权限: ${err}`);
      setMessage('麦克风权限被拒绝，请在浏览器设置中允许');
      setFeedback('error');
    }
  }, [addError]);

  // 空格键切换
  const toggleListening = useCallback(() => {
    if (!micReady) return;
    const rec = ensureRecognizer();

    if (rec.getState() === 'listening') {
      rec.stop();
      setFeedback('idle');
      setStep('idle');
      setMessage('已停止 — 按空格键重新开始');
    } else {
      setTranscript('');
      setInterim('');
      setStep('asr');
      rec.start();
    }
  }, [micReady, ensureRecognizer]);

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

  const stepLabel: Record<PipelineStep, string> = {
    idle: '待命', asr: '听写中', nlu: '理解中', parser: '解析中', engine: '渲染中', error: '异常',
  };

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
        <span style={{ flex: 1 }}>{message}</span>
        <span style={{ fontSize: 12, color: '#9CA3AF', background: '#FFF', padding: '2px 8px', borderRadius: 4 }}>
          {stepLabel[step]}
        </span>
      </div>

      {/* 识别文本回显 */}
      <div style={{
        padding: '8px 24px',
        background: '#FAFAFA',
        borderBottom: '1px solid #E5E7EB',
        minHeight: 28,
        fontSize: 15,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>识别:</span>
        {interim ? (
          <span style={{ color: '#6B7280', fontStyle: 'italic' }}>{interim}...</span>
        ) : transcript ? (
          <span style={{ color: '#1F2937' }}>"{transcript}"</span>
        ) : (
          <span style={{ color: '#D1D5DB' }}>等待语音输入...</span>
        )}
      </div>

      {/* 画布 */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, width: '100%', border: '1px solid #E5E7EB' }}
      />

      {/* 错误日志区 */}
      {errors.length > 0 && (
        <div style={{
          padding: '6px 24px',
          background: '#FEF2F2',
          borderTop: '1px solid #FECACA',
          fontSize: 12,
          color: '#991B1B',
          maxHeight: 80,
          overflowY: 'auto',
        }}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

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
