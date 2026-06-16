/**
 * 简单 VAD：基于音量阈值检测用户是否正在说话
 * 用于 UI 反馈（麦克风波形、"正在听..."指示）
 */

export interface VADEvent {
  type: 'speech-start' | 'speech-end' | 'volume';
  volume?: number; // 0.0 - 1.0
}

export function createVAD(
  onEvent: (e: VADEvent) => void,
  threshold = 0.05,
  silenceMs = 800,
) {
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let animationId = 0;
  let speaking = false;
  let lastSoundTime = 0;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const volume = Math.min(avg / 128, 1);

      onEvent({ type: 'volume', volume });

      const now = Date.now();
      if (volume > threshold) {
        lastSoundTime = now;
        if (!speaking) {
          speaking = true;
          onEvent({ type: 'speech-start' });
        }
      } else if (speaking && now - lastSoundTime > silenceMs) {
        speaking = false;
        onEvent({ type: 'speech-end' });
      }

      animationId = requestAnimationFrame(tick);
    };
    tick();
  }

  function stop() {
    cancelAnimationFrame(animationId);
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close();
    stream = null;
    analyser = null;
    audioCtx = null;
    speaking = false;
  }

  return { start, stop };
}
