'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'watching' | 'thinking' | 'error';

export default function Page() {
  const [started, setStarted] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [setupError, setSetupError] = useState('');
  const [starting, setStarting] = useState(false);
  const [answer, setAnswer] = useState('Initializing camera…');
  const [answerThinking, setAnswerThinking] = useState(true);
  const [status, setStatus] = useState<Status>('watching');
  const [toast, setToast] = useState('');
  const [toastShown, setToastShown] = useState(false);
  const [paused, setPaused] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const keyRef = useRef('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendNowRef = useRef(false);

  async function begin() {
    const key = apiKey.trim();
    if (!key) {
      setSetupError('API key required.');
      return;
    }
    setSetupError('');
    setStarting(true);
    keyRef.current = key;
    try {
      // mount the video element by flipping started first; small tick so ref is live
      setStarted(true);
      await new Promise(r => requestAnimationFrame(() => r(null)));
      await startCamera();
      runningRef.current = true;
      loop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setSetupError('Camera access failed: ' + msg);
      setStarted(false);
      setStarting(false);
    }
  }

  async function startCamera() {
    // First pass: get permission and enumerate devices to find ultra-wide
    const initial = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoCameras = devices.filter(d => d.kind === 'videoinput');
    console.log('[Glance] cameras found:', videoCameras.map(d => `${d.label} (${d.deviceId.slice(0, 8)}…)`));
    const ultraWide = videoCameras.find(d => /ultra.?wide/i.test(d.label));
    console.log('[Glance] ultra-wide:', ultraWide ? ultraWide.label : 'not found — using default rear camera');
    // If ultra-wide found, stop initial stream and re-open with that deviceId
    if (ultraWide) {
      initial.getTracks().forEach(t => t.stop());
    }
    const stream = ultraWide
      ? await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: ultraWide.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      : initial;

    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await new Promise<void>(resolve => {
      video.onloadedmetadata = () => resolve();
    });
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext('2d');
  }

  function captureFrame(): string {
    const ctx = ctxRef.current!;
    const canvas = canvasRef.current!;
    const video = videoRef.current!;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
  }

  async function ask(b64: string): Promise<string> {
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyRef.current, image: b64 }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j?.error || '';
      } catch {
        detail = await res.text();
      }
      throw new Error(`${res.status} · ${detail.slice(0, 160)}`);
    }
    const data = await res.json();
    return (data.text as string) || '';
  }

  function showToast(msg: string) {
    setToast(msg);
    setToastShown(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastShown(false), 4500);
  }

  async function loop() {
    while (runningRef.current) {
      if (pausedRef.current && !sendNowRef.current) {
        await sleep(200);
        continue;
      }
      sendNowRef.current = false;
      try {
        setStatus('thinking');
        const b64 = captureFrame();
        const a = await ask(b64);
        if (a && runningRef.current) {
          setAnswer(a);
          setAnswerThinking(false);
        }
        setStatus('watching');
      } catch (e) {
        setStatus('error');
        const msg = e instanceof Error ? e.message : 'Unknown error';
        showToast(msg.slice(0, 140));
        await sleep(2500);
      }
      // Wait up to 15s but bail early if sendNow is pressed
      for (let i = 0; i < 75; i++) {
        if (sendNowRef.current || !runningRef.current) break;
        await sleep(200);
      }
    }
  }

  function togglePause() {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  }

  function sendNow() {
    sendNowRef.current = true;
  }

  function stop() {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach(t => t.stop());
    location.reload();
  }

  useEffect(() => {
    function onVisChange() {
      if (document.hidden) {
        runningRef.current = false;
      } else if (keyRef.current && streamRef.current && !runningRef.current && started) {
        runningRef.current = true;
        loop();
      }
    }
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  if (!started) {
    return (
      <section className="setup">
        <div className="brand">
          <span className="brand-mark" />
          <span>Glance · v1</span>
        </div>

        <div className="hero">
          <h1>
            see it,
            <br />
            <em>say it.</em>
          </h1>
          <p>Your camera, narrated continuously by Claude. Point. Watch. No taps required.</p>
        </div>

        <div className="form">
          <div className="field">
            <label htmlFor="token">Anthropic API Key</label>
            <input
              id="token"
              type="password"
              placeholder="sk-ant-…"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') begin();
              }}
            />
          </div>
          <button className="start" onClick={begin} disabled={starting}>
            {starting ? 'Connecting…' : 'Begin Watching'}
          </button>
          <p className="err-msg">{setupError}</p>
          <p className="footnote">
            Key proxied through your server · <span>nothing stored</span>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="app">
      <video ref={videoRef} className="video" autoPlay playsInline muted />

      <div className="hud-top">
        <div className="pill" data-state={status}>
          {status === 'thinking' ? <span className="spinner" /> : <span className="dot" />}
          <span>{status === 'thinking' ? 'Looking' : status === 'error' ? 'Error' : paused ? 'Paused' : 'Watching'}</span>
        </div>
        <div className="hud-actions">
          <button className="stop-btn" onClick={sendNow}>Send</button>
          <button className="stop-btn" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
          <button className="stop-btn" onClick={stop}>Stop</button>
        </div>
      </div>

      <div className="caption">
        <div className="caption-meta">Claude · Live</div>
        <div className={`answer${answerThinking ? ' thinking' : ''}`}>{answer}</div>
      </div>

      <div className={`toast${toastShown ? ' show' : ''}`}>{toast}</div>
    </section>
  );
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
