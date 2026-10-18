import { useEffect, useRef, useState } from 'react';
import { signIn } from './firebase';
import { preloadHandLandmarker, getHandLandmarker, DrawingUtils, HandLandmarker } from './handDetector';

type Msg = {
  role: 'user' | 'assistant';
  text: string;
  videoUrl?: string;
  busy?: boolean;
  actions?: { tool: string; input: any; result: any }[];
};
type Conf = { name: string; input: Record<string, any> };
const IDEAS = [
  'Add in my calendar a trip to Goa on coming Sunday',
  'Email me a packing list for Goa',
  'Add task: renew passport',
  'Directions to Bangalore airport'
];
const label = (n: unknown) => String(n ?? 'action').replace(/_/g, ' ');

function Camera({
  onVideo,
  onClose,
  disabled
}: {
  onVideo: (videoDataUrl: string) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // State refs for animation loop
  const isRecordingRef = useRef(false);
  const handsLostTimerRef = useRef<any>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const consecutiveHandFramesRef = useRef<number>(0);
  const isProcessingRef = useRef(false);

  // React state for UI HUD
  const [err, setErr] = useState('');
  const [uiStatus, setUiStatus] = useState<'loading' | 'waiting' | 'recording' | 'countdown' | 'processing'>('loading');
  const [recordSecs, setRecordSecs] = useState(0);

  // Stop recording and send
  const finishRecording = () => {
    if (handsLostTimerRef.current) {
      clearTimeout(handsLostTimerRef.current);
      handsLostTimerRef.current = null;
    }

    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    const elapsed = Date.now() - recordingStartTimeRef.current;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error(e);
      }
    }

    // Ignore if recording duration was too brief (< 800ms)
    if (elapsed < 800) {
      setUiStatus('waiting');
      return;
    }

    setUiStatus('processing');
  };

  // Start recording
  const beginRecording = () => {
    if (isRecordingRef.current || isProcessingRef.current || !streamRef.current || disabled) return;

    recordedChunksRef.current = [];
    try {
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) =>
        MediaRecorder.isTypeSupported(t)
      );
      const mr = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        if (recordedChunksRef.current.length === 0) {
          setUiStatus('waiting');
          return;
        }
        const blob = new Blob(recordedChunksRef.current, { type: mr.mimeType || 'video/webm' });
        const reader = new FileReader();
        isProcessingRef.current = true;
        reader.onloadend = () => {
          isProcessingRef.current = false;
          if (typeof reader.result === 'string') {
            onVideo(reader.result);
          }
          setUiStatus('waiting');
        };
        reader.readAsDataURL(blob);
      };

      mr.start(100);
      mediaRecorderRef.current = mr;
      isRecordingRef.current = true;
      recordingStartTimeRef.current = Date.now();
      setUiStatus('recording');
      setRecordSecs(0);
    } catch (e: any) {
      setErr(`Recording error: ${e.message}`);
    }
  };

  // Active recording timer
  useEffect(() => {
    let interval: any;
    if (uiStatus === 'recording' || uiStatus === 'countdown') {
      interval = setInterval(() => {
        setRecordSecs(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
      }, 500);
    } else {
      setRecordSecs(0);
    }
    return () => clearInterval(interval);
  }, [uiStatus]);

  // Main setup: Stream + MediaPipe Landmarker + Detection Loop
  useEffect(() => {
    let active = true;
    let animId: number;
    let landmarkerInstance: any = null;
    let lastVideoTime = -1;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        landmarkerInstance = await getHandLandmarker();
        if (!active) return;
        setUiStatus('waiting');

        const detectFrame = () => {
          if (!active) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video && video.readyState >= 2 && landmarkerInstance) {
            if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
            }

            if (video.currentTime !== lastVideoTime) {
              lastVideoTime = video.currentTime;
              const results = landmarkerInstance.detectForVideo(video, performance.now());

              const ctx = canvas?.getContext('2d');
              if (ctx && canvas) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (results.landmarks && results.landmarks.length > 0) {
                  const drawingUtils = new DrawingUtils(ctx);
                  for (const landmarks of results.landmarks) {
                    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                      color: '#10b981',
                      lineWidth: 3,
                    });
                    drawingUtils.drawLandmarks(landmarks, {
                      color: '#6366f1',
                      lineWidth: 1,
                      radius: 4,
                    });
                  }
                }
              }

              const hasHands = results.landmarks && results.landmarks.length > 0;

              if (hasHands) {
                if (handsLostTimerRef.current) {
                  clearTimeout(handsLostTimerRef.current);
                  handsLostTimerRef.current = null;
                  setUiStatus('recording');
                }

                if (!isRecordingRef.current && !isProcessingRef.current) {
                  consecutiveHandFramesRef.current++;
                  if (consecutiveHandFramesRef.current >= 3) {
                    beginRecording();
                  }
                }
              } else {
                consecutiveHandFramesRef.current = 0;
                if (isRecordingRef.current && !handsLostTimerRef.current) {
                  setUiStatus('countdown');
                  handsLostTimerRef.current = setTimeout(() => {
                    finishRecording();
                  }, 1500);
                }
              }
            }
          }

          animId = requestAnimationFrame(detectFrame);
        };

        animId = requestAnimationFrame(detectFrame);
      } catch (err: any) {
        if (active) setErr(`Camera or hand tracker error: ${err.message}`);
      }
    }

    init();

    return () => {
      active = false;
      cancelAnimationFrame(animId);
      if (handsLostTimerRef.current) clearTimeout(handsLostTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="cam">
      <div className="cam-viewport">
        <video ref={videoRef} autoPlay muted playsInline />
        <canvas ref={canvasRef} />
        <div className="cam-hud">
          {uiStatus === 'loading' && (
            <span className="cam-badge">⏳ Loading hand tracker...</span>
          )}
          {uiStatus === 'waiting' && (
            <span className="cam-badge ready">👋 Show hands to sign</span>
          )}
          {uiStatus === 'recording' && (
            <span className="cam-badge rec">🔴 Recording ({recordSecs}s)</span>
          )}
          {uiStatus === 'countdown' && (
            <span className="cam-badge countdown">⏳ Hands lowered (finishing...)</span>
          )}
          {uiStatus === 'processing' && (
            <span className="cam-badge">⚙️ Sending video...</span>
          )}
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="cam-footer">
        <span className="cam-hint">
          {uiStatus === 'recording'
            ? 'Signing in progress. Lower your hands when finished.'
            : 'Raise your hands into view to start recording automatically.'}
        </span>
        <div className="row">
          {(uiStatus === 'recording' || uiStatus === 'countdown') && (
            <button className="go stop-btn" onClick={finishRecording} disabled={disabled}>
              Stop & Send Now
            </button>
          )}
          <button className="ghost" onClick={onClose} disabled={uiStatus === 'processing'}>
            Close Camera
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [workspaceContext, setWorkspaceContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Conf[] | null>(null);
  const [cam, setCam] = useState(false);
  const [user, setUser] = useState<{ email: string; token: string } | null>(null);
  const sid = useRef(crypto.randomUUID());
  const end = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const lastReq = useRef<{ path: string; body: object } | null>(null);

  useEffect(() => {
    preloadHandLandmarker();
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, pending, busy, note]);

  const add = (m: Msg) => setMsgs((x) => [...x, m]);

  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

  // While waiting, ask the server what it is doing (retrying / switching to a backup model).
  useEffect(() => {
    if (!busy) {
      setNote('');
      return;
    }
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/status?sessionId=${sid.current}`);
        setNote((await r.json()).note ?? '');
      } catch {}
    }, 1200);
    return () => clearInterval(id);
  }, [busy]);

  async function post(path: string, body: object) {
    if (path === '/api/chat') lastReq.current = { path, body };
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {})
        },
        body: JSON.stringify({ sessionId: sid.current, userEmail: user?.email, ...body }),
      });
      const j = await r.json();
      console.log('agent response', j);
      if (j.detail) console.warn(j.detail);
      if (j.status === 'needs_confirmation') setPending(j.confirmations);
      else if (j.status === 'busy') {
        // Keep any pending confirmation so the Confirm button can be tried again.
        add({ role: 'assistant', text: j.message, busy: true });
      } else {
        setPending(null);
        add({ role: 'assistant', text: j.message, actions: j.actions });
      }
    } catch (e: any) {
      add({ role: 'assistant', text: `Could not reach the agent: ${e.message}` });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Typed text AND sign-to-text output both enter the agentic flow here.
  function send(text = input) {
    const t = text.trim();
    if (!t || busyRef.current || pending) return;
    setInput('');
    add({ role: 'user', text: t });
    post('/api/chat', { text: t, workspaceContext: workspaceContext.trim() || undefined });
  }

  // Multimodal sign video clip (sent for this turn only; the server drops it from history afterwards)
  function sendVideo(videoDataUrl: string) {
    if (busyRef.current || pending) return;
    add({ role: 'user', text: '📹 Sign language video clip', videoUrl: videoDataUrl });
    post('/api/chat', { videoDataUrl, workspaceContext: workspaceContext.trim() || undefined });
  }

  function decide(approved: boolean) {
    add({ role: 'user', text: approved ? 'Approved' : 'Cancelled' });
    post('/api/confirm', { approved });
  }

  function retry() {
    if (lastReq.current && !busyRef.current) post(lastReq.current.path, lastReq.current.body);
  }

  async function login() {
    try {
      setUser(await signIn());
    } catch (e: any) {
      add({ role: 'assistant', text: `Sign-in failed: ${e.message}` });
    }
  }

  return (
    <div className="app">
      <header>
        <b>SignAgent</b>
        <button
          type="button"
          className={`pill-btn ${workspaceContext.trim() ? 'active' : ''}`}
          onClick={() => setShowContext(!showContext)}
          title="Toggle active workspace context"
        >
          {workspaceContext.trim() ? 'Context: Active' : '+ Context'}
        </button>
        {user ? (
          <span className="pill">{user.email}</span>
        ) : (
          <>
            <span className="pill warn">Demo mode: actions are simulated</span>
            <button className="ghost" onClick={login}>
              Sign in with Google
            </button>
          </>
        )}
      </header>

      <main>
        {msgs.length === 0 && (
          <div className="empty">
            <h1>Sign it or type it. SignAgent does it.</h1>
            <div className="ideas">
              {IDEAS.map((i) => (
                <button key={i} className="ghost" onClick={() => send(i)}>
                  {i}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.videoUrl && (
              <div className="video-thumb">
                <video src={m.videoUrl} controls playsInline />
              </div>
            )}
            <p>{m.text}</p>
            {m.busy && !pending && !busy && i === msgs.length - 1 && (
              <button className="ghost" onClick={retry}>
                Try again
              </button>
            )}
            {m.actions?.map((a, k) => (
              <div key={k} className="act">
                <b>{label(a.tool)}</b>
                {a.result?.simulated && <i> (simulated)</i>}
                {a.result?.error && <span className="err"> {a.result.error}</span>}
                {(a.result?.url || a.result?.htmlLink) && (
                  <> <a href={a.result.url ?? a.result.htmlLink} target="_blank" rel="noreferrer">open</a></>
                )}
              </div>
            ))}
          </div>
        ))}

        {pending && (
          <div className="confirm">
            <b>Confirm before I do this</b>
            {pending.map((c, i) => (
              <dl key={i}>
                <dt className="what">{label(c.name)}</dt>
                {Object.entries(c.input ?? {}).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            ))}
            <div className="row">
              <button className="go" disabled={busy} onClick={() => decide(true)}>
                Confirm
              </button>
              <button className="ghost" disabled={busy} onClick={() => decide(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {busy && (
          <div className="msg assistant">
            <p className="dots">{note || 'Working…'}</p>
          </div>
        )}
        <div ref={end} />
      </main>

      {showContext && (
        <div className="context-box">
          <label>Active Workspace Context (e.g. Jira issue, meeting notes, screen text):</label>
          <input
            value={workspaceContext}
            onChange={(e) => setWorkspaceContext(e.target.value)}
            placeholder="e.g. Active tab: Jira Issue PROJ-42, PR review, or meeting notes"
          />
        </div>
      )}

      {cam && (
        <Camera
          onVideo={sendVideo}
          onClose={() => setCam(false)}
          disabled={busy || !!pending}
        />
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? 'Confirm or cancel above first' : 'Type a command, or open the camera'}
        />
        <button
          type="button"
          className={`icon ${cam ? 'on' : ''}`}
          aria-label="Toggle camera for sign input"
          onClick={() => setCam(!cam)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="m15 10 6-3v10l-6-3" />
          </svg>
        </button>
        <button
          className="icon send"
          aria-label="Send"
          disabled={!input.trim() || busy || !!pending}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}