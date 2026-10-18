import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'genkit';
import { genkit } from 'genkit/beta';
import { googleAI } from '@genkit-ai/google-genai';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
const TZ = process.env.TIMEZONE ?? 'Asia/Kolkata';
const ai = genkit({ plugins: [googleAI()] });

// Per-request context (the signed-in user's Google token + a log of what tools did)
type Ctx = { token?: string; email?: string; log: any[]; sid?: string };
const als = new AsyncLocalStorage<Ctx>();

async function G(url: string, body: unknown): Promise<any> {
  const c = als.getStore()!;
  if (process.env.DRY_RUN === 'true' || !c.token) return { simulated: true };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  return r.ok ? j : { error: j.error?.message ?? r.statusText };
}

// risky = true -> the tool PAUSES (Genkit interrupt) until the user approves in the UI
const T: Record<string, any> = {};
function tool(name: string, description: string, inputSchema: z.ZodTypeAny, run: (i: any) => Promise<any>, risky = false) {
  return (T[name] = ai.defineTool({ name, description, inputSchema, outputSchema: z.any() }, async (input: any, { interrupt, resumed }: any) => {
    if (risky && !resumed?.approved) interrupt();
    const result = await run(input);
    als.getStore()?.log.push({ tool: name, input, result });
    return result;
  }));
}

const tools = [
  tool('create_calendar_event', 'Create a Google Calendar event. start/end are ISO 8601 with timezone offset.',
    z.object({ title: z.string(), start: z.string(), end: z.string(), description: z.string().optional() }),
    (i) => G('https://www.googleapis.com/calendar/v3/calendars/primary/events',
      { summary: i.title, description: i.description, start: { dateTime: i.start, timeZone: TZ }, end: { dateTime: i.end, timeZone: TZ } }), true),
  tool('send_email', 'Send an email with Gmail. Use to="me" to email the signed-in user. Never invent addresses.',
    z.object({ to: z.string(), subject: z.string(), body: z.string() }),
    (i) => {
      const to = i.to === 'me' ? als.getStore()!.email : i.to;
      const raw = Buffer.from(`To: ${to}\r\nSubject: ${i.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${i.body}`).toString('base64url');
      return G('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw });
    }, true),
  tool('add_task', 'Add a to-do to Google Tasks. due is optional ISO 8601.',
    z.object({ title: z.string(), notes: z.string().optional(), due: z.string().optional() }),
    (i) => G('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', { title: i.title, notes: i.notes, due: i.due })),
  tool('create_note_doc', 'Save a note or document as a Google Doc.',
    z.object({ title: z.string(), content: z.string() }),
    async (i) => {
      const d = await G('https://docs.googleapis.com/v1/documents', { title: i.title });
      if (!d.documentId) return d;
      await G(`https://docs.googleapis.com/v1/documents/${d.documentId}:batchUpdate`,
        { requests: [{ insertText: { location: { index: 1 }, text: i.content } }] });
      return { url: `https://docs.google.com/document/d/${d.documentId}/edit` };
    }),
  tool('get_directions', 'Get a Google Maps directions link.',
    z.object({ destination: z.string(), origin: z.string().optional() }),
    async (i) => ({ url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(i.destination)}${i.origin ? `&origin=${encodeURIComponent(i.origin)}` : ''}` })),
];

const system = () => `You are SignAgent, an assistant for Deaf, speech-disabled, and hard-of-hearing users. Messages come from sign-language recognition, attached sign language video clips, or typing: they may be gloss-style, ALL CAPS, fingerspelled or contain recognition errors.
Now: ${new Date().toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' })} (${TZ}). Resolve relative dates ("coming Sunday") from this, and use ISO 8601 with the timezone offset.
When a sign language video clip is provided, watch the clip carefully, interpret the sign gestures and intent, and use the active workspace context to disambiguate pronouns and references. Users may sign in Indian Sign Language (ISL) or American Sign Language (ASL), including two-handed or one-handed manual alphabets and gestures; recognize both ISL and ASL accurately.
Use tools to do what the user asks; chain several tools for multi-step requests (e.g. trip planning = note + calendar event + directions).
If a required detail is missing or you are unsure what was signed, ask ONE short question instead of guessing. Never invent email addresses.
Reply in one or two plain, simple sentences saying what was done.`;

// In-memory sessions (no database). `note` is a live status line the UI polls while waiting.
const S = new Map<string, { messages: any[]; pending?: any[]; note?: string }>();

// Replace attached video clips with a short placeholder so they are not re-sent to Gemini on every later turn.
const stripMedia = (msgs: any[]) => msgs.map((m) => ({
  ...m,
  content: m.content?.map((p: any) => (p?.media ? { text: '[A sign language video clip was attached here and has already been interpreted.]' } : p)),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isBusy = (e: any) => /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(String(e?.message ?? e));

// Tries each model twice (main first, then fallbacks). Only "busy" errors move on to the next model;
// real errors (bad key, bad request) are thrown immediately.
async function gen(opts: any) {
  const c = als.getStore();
  const note = (t?: string) => { const s = c?.sid ? S.get(c.sid) : undefined; if (s) s.note = t; };
  const fallbacks = (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash,gemini-3.1-flash-lite').split(',');
  const models = [...new Set([MODEL, ...fallbacks].map((s) => s.trim()).filter(Boolean))];
  let err: any;
  for (let mi = 0; mi < models.length; mi++) {
    for (let a = 0; a < 2; a++) {
      try {
        // Testing aid: SIMULATE_BUSY=model1,model2 in .env pretends those models return 503
        if (process.env.SIMULATE_BUSY?.split(',').map((s) => s.trim()).includes(models[mi])) throw new Error('503 UNAVAILABLE (simulated)');
        const r = await ai.generate({ ...opts, model: googleAI.model(models[mi]), tools });
        note(undefined);
        return r;
      } catch (e: any) {
        err = e;
        if (!isBusy(e)) { note(undefined); throw e; }
        console.warn(`[gemini] ${models[mi]} busy (attempt ${a + 1})`);
        if (a === 0) { note('High demand right now. Retrying…'); await sleep(1500); }
      }
    }
    if (mi < models.length - 1) note('Still busy. Switching to a backup model…');
  }
  note(undefined);
  const busy: any = new Error('all models busy');
  busy.busy = true;
  busy.cause = err;
  throw busy;
}

async function serve(req: express.Request, res: express.Response, build: (s: { messages: any[]; pending?: any[]; note?: string }) => Promise<any>) {
  const { sessionId, userEmail } = req.body;
  const s = S.get(sessionId) ?? { messages: [{ role: 'system', content: [{ text: system() }] }] };
  S.set(sessionId, s);
  const ctx: Ctx = { token: req.headers.authorization?.replace('Bearer ', ''), email: userEmail, log: [], sid: sessionId };
  try {
    const r = await als.run(ctx, () => build(s));
    s.pending = r.interrupts?.length ? r.interrupts : undefined;
    // Keep the clip while a confirmation is pending (resume re-sends history once); drop it after the turn completes.
    s.messages = s.pending ? r.messages : stripMedia(r.messages);
    res.json(s.pending
      ? { status: 'needs_confirmation', message: 'Please confirm this action.',
          confirmations: s.pending.map((i: any) => ({ name: i.toolRequest.name, input: i.toolRequest.input })) }
      : { status: 'done', message: r.text, actions: ctx.log });
  } catch (e: any) {
    console.error(e?.busy ? '[gemini] all models busy' : e);
    s.note = undefined;
    if (e?.busy) {
      return res.status(503).json({
        status: 'busy',
        message: 'Gemini is under very high demand right now, so this is taking longer than usual. Nothing was lost. Please try again in a minute.',
      });
    }
    res.status(500).json({ status: 'error', message: 'Something went wrong while handling that. Please try again.', detail: String(e?.message ?? e) });
  }
}

const app = express();
app.use(cors(), express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));
app.get('/health', (_q, r) => r.json({ ok: true, model: MODEL, dryRun: process.env.DRY_RUN === 'true' }));
app.get('/api/status', (q, r) => r.json({ note: S.get(String(q.query.sessionId))?.note ?? '' }));

app.post('/api/chat', (q, r) => serve(q, r, (s) => {
  const { text, videoDataUrl, workspaceContext } = q.body ?? {};
  const promptParts: any[] = [];

  let textPrompt = '';
  if (workspaceContext && typeof workspaceContext === 'string' && workspaceContext.trim()) {
    textPrompt += `Active Workspace Context:\n${workspaceContext.trim()}\n\n`;
  }

  if (text && typeof text === 'string' && text.trim()) {
    textPrompt += text.trim();
  } else if (videoDataUrl) {
    textPrompt += 'Analyze the attached sign language video clip carefully, interpret the sign language gestures and user intent, and use available tools to fulfill the request.';
  }

  if (textPrompt) {
    promptParts.push({ text: textPrompt });
  }

  if (videoDataUrl && typeof videoDataUrl === 'string') {
    promptParts.push({ media: { url: videoDataUrl } });
  }

  const prompt = promptParts.length === 1 && promptParts[0].text ? promptParts[0].text : promptParts;
  return gen({ messages: s.messages, prompt });
}));

app.post('/api/confirm', (q, r) => serve(q, r, async (s) => {
  if (!s.pending) throw new Error('Nothing to confirm');
  const resume = q.body.approved
    ? { restart: s.pending.map((i: any) => T[i.toolRequest.name].restart(i, { approved: true })) }
    : { respond: s.pending.map((i: any) => T[i.toolRequest.name].respond(i, { cancelled: 'User declined' })) };
  return gen({ messages: s.messages, resume });
}));

app.listen(Number(process.env.PORT ?? 8080), () => console.log('SignAgent server on :' + (process.env.PORT ?? 8080)));