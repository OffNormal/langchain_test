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
  const [message, setMessage] = useState('按空格键开始说话');

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
      // NLU 解析
      const nlu = await parse(asr.transcript);
      if (isLowConfidence(nlu)) {
        setMessage('没理解，请换种说法');
        setFeedback('error');
        return;
      }

      // Command Parser
      const cmd = parseToCommand(nlu);

      // Drawing Engine
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

  // 语音识别器
  const recognizerRef = useRef(
    createSpeechRecognizer({
      onResult: (r) => { handleResult(r); },
      onInterim: (t) => { setInterim(t); },
      onStateChange: (s) => {
        if (s === 'listening') {
          setFeedback('listening');
          setMessage('正在听...');
        }
      },
      onError: (e) => {
        setMessage(`语音识别错误: ${e}`);
        setFeedback('error');
      },
    }),
  );

  // 键盘：空格键开始语音识别
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && ctxRef.current) {
        e.preventDefault();
        recognizerRef.current.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

      {/* 底部提示 */}
      <div style={{ padding: '8px 24px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
        按空格键开始说话 | 试试: "画一个红色的圆" "把它改成蓝色" "撤销" "导出"
      </div>
    </div>
  );
}
