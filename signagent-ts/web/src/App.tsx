import { useEffect, useRef, useState } from 'react';
import { signIn } from './firebase';
import { startSignToText } from './signToText';

type Msg = { role: 'user' | 'assistant'; text: string; actions?: { tool: string; input: any; result: any }[] };
type Conf = { name: string; input: Record<string, any> };
const IDEAS = ['Add in my calendar a trip to Goa on coming Sunday', 'Email me a packing list for Goa', 'Add task: renew passport', 'Directions to Bangalore airport'];
const label = (n: unknown) => String(n ?? 'action').replace(/_/g, ' ');

function Camera({ onText, onClose }: { onText: (t: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | undefined;
    let handle: { stop: () => void } | undefined;
    navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
      stream = s;
      if (video.current) { video.current.srcObject = s; handle = startSignToText(video.current, onText); }
    }).catch(() => setErr('Camera blocked. Allow camera access in your browser.'));
    return () => { handle?.stop(); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="cam">
      <video ref={video} autoPlay muted playsInline />
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="ghost" onClick={() => onText('ADD IN MY CALENDAR TRIP TO GOA COMING SUNDAY')}>Test: simulate a sign</button>
        <button className="ghost" onClick={onClose}>Close camera</button>
      </div>
    </div>
  );
}

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Conf[] | null>(null);
  const [cam, setCam] = useState(false);
  const [user, setUser] = useState<{ email: string; token: string } | null>(null);
  const sid = useRef(crypto.randomUUID());
  const end = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  useEffect(() => {
  end.current?.scrollIntoView({ behavior: 'smooth' });
}, [msgs, pending, busy]);

  const add = (m: Msg) => setMsgs((x) => [...x, m]);

  async function post(path: string, body: object) {
    busyRef.current = true; setBusy(true);
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({ sessionId: sid.current, userEmail: user?.email, ...body }),
      });
      const j = await r.json();
      console.log('agent response', j);
      if (j.status === 'needs_confirmation') setPending(j.confirmations);
      else { setPending(null); add({ role: 'assistant', text: j.message, actions: j.actions }); }
    } catch (e: any) {
      add({ role: 'assistant', text: `Could not reach the agent: ${e.message}` });
    } finally { busyRef.current = false; setBusy(false); }
  }

  // Typed text AND sign-to-text output both enter the agentic flow here.
  function send(text = input) {
    const t = text.trim();
    if (!t || busyRef.current || pending) return;
    setInput(''); add({ role: 'user', text: t }); post('/api/chat', { text: t });
  }
  function decide(approved: boolean) {
    add({ role: 'user', text: approved ? 'Approved' : 'Cancelled' });
    post('/api/confirm', { approved });
  }
  async function login() {
    try { setUser(await signIn()); } catch (e: any) { add({ role: 'assistant', text: `Sign-in failed: ${e.message}` }); }
  }

  return (
    <div className="app">
      <header>
        <b>SignAgent</b>
        {user ? <span className="pill">{user.email}</span>
          : <><span className="pill warn">Demo mode: actions are simulated</span><button className="ghost" onClick={login}>Sign in with Google</button></>}
      </header>

      <main>
        {msgs.length === 0 && (
          <div className="empty">
            <h1>Sign it or type it. SignAgent does it.</h1>
            <div className="ideas">{IDEAS.map((i) => <button key={i} className="ghost" onClick={() => send(i)}>{i}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p>{m.text}</p>
            {m.actions?.map((a, k) => (
              <div key={k} className="act">
                <b>{label(a.tool)}</b>
                {a.result?.simulated && <i> (simulated)</i>}
                {a.result?.error && <span className="err"> {a.result.error}</span>}
                {(a.result?.url || a.result?.htmlLink) && <> <a href={a.result.url ?? a.result.htmlLink} target="_blank" rel="noreferrer">open</a></>}
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
                {Object.entries(c.input ?? {}).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
              </dl>
            ))}
            <div className="row">
              <button className="go" disabled={busy} onClick={() => decide(true)}>Confirm</button>
              <button className="ghost" disabled={busy} onClick={() => decide(false)}>Cancel</button>
            </div>
          </div>
        )}
        {busy && !pending && <div className="msg assistant"><p className="dots">Working…</p></div>}
        <div ref={end} />
      </main>

      {cam && <Camera onText={send} onClose={() => setCam(false)} />}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={pending ? 'Confirm or cancel above first' : 'Type a command, or open the camera'} />
        <button type="button" className={`icon ${cam ? 'on' : ''}`} aria-label="Toggle camera for sign input" onClick={() => setCam(!cam)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m15 10 6-3v10l-6-3" /></svg>
        </button>
        <button className="icon send" aria-label="Send" disabled={!input.trim() || busy || !!pending}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
    </div>
  );
}
