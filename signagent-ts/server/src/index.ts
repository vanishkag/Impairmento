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
type Ctx = { token?: string; email?: string; log: any[] };
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

const system = () => `You are SignAgent, an enterprise AI assistant for Deaf, speech-disabled, and hard-of-hearing professionals. Messages come from sign-language recognition, attached sign language video clips, or typing: they may be gloss-style, ALL CAPS, fingerspelled or contain recognition errors.
Now: ${new Date().toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' })} (${TZ}). Resolve relative dates ("coming Sunday") from this, and use ISO 8601 with the timezone offset.
When a sign language video clip is provided, watch the clip carefully, interpret the sign gestures and intent, and use the active workspace context to disambiguate pronouns and references. Users may sign in Indian Sign Language (ISL) or American Sign Language (ASL), including two-handed or one-handed manual alphabets and gestures; recognize both ISL and ASL accurately.
Use tools to do what the user asks; chain several tools for multi-step requests (e.g. trip planning = note + calendar event + directions).
If a required detail is missing or you are unsure what was signed, ask ONE short question instead of guessing. Never invent email addresses.
Reply in one or two plain, simple sentences saying what was done.`;

async function gen(opts: any) {
  let err: any;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-2.5-flash,gemini-1.5-flash').split(',');
  for (const m of [MODEL, ...fallbacks].map((s) => s.trim()).filter(Boolean))
    for (let a = 0; a < 3; a++) {
      try { return await ai.generate({ ...opts, model: googleAI.model(m), tools }); }
      catch (e: any) {
        err = e;
        if (!/503|429|UNAVAILABLE/.test(String(e))) throw e;
        await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
      }
    }
  throw err;
}

const S = new Map<string, { messages: any[]; pending?: any[] }>(); // in-memory sessions (no database)

async function serve(req: express.Request, res: express.Response, build: (s: { messages: any[]; pending?: any[] }) => Promise<any>) {
  const { sessionId, userEmail } = req.body;
  const s = S.get(sessionId) ?? { messages: [{ role: 'system', content: [{ text: system() }] }] };
  S.set(sessionId, s);
  const ctx: Ctx = { token: req.headers.authorization?.replace('Bearer ', ''), email: userEmail, log: [] };
  try {
    const r = await als.run(ctx, () => build(s));
    s.messages = r.messages;
    s.pending = r.interrupts?.length ? r.interrupts : undefined;
    res.json(s.pending
      ? { status: 'needs_confirmation', message: 'Please confirm this action.',
          confirmations: s.pending.map((i: any) => ({ name: i.toolRequest.name, input: i.toolRequest.input })) }
      : { status: 'done', message: r.text, actions: ctx.log });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ status: 'error', message: String(e?.message ?? e) });
  }
}

const app = express();
app.use(cors(), express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));
app.get('/health', (_q, r) => r.json({ ok: true, model: MODEL, dryRun: process.env.DRY_RUN === 'true' }));
app.post('/api/translate', async (req, res) => {
  const { videoDataUrl, workspaceContext } = req.body ?? {};
  if (!videoDataUrl || typeof videoDataUrl !== 'string') {
    return res.status(400).json({ error: 'No video provided' });
  }

  const prompt = `You are an expert sign language interpreter for Deaf, speech-disabled, and hard-of-hearing professionals.
Watch the attached sign language video clip carefully. The signer may be using Indian Sign Language (ISL) or American Sign Language (ASL).
${workspaceContext ? `Active Workspace Context: ${workspaceContext}\n` : ''}
Translate the sign gestures and intent into a natural, direct English command or sentence representing exactly what the user signed (e.g. "Schedule a meeting tomorrow at 3 PM", "Email me a packing list for Goa", "Directions to Bangalore airport").
Output ONLY the clean translated English sentence, with no conversational filler, quotes, or markdown explanations.`;

  try {
    const response = await ai.generate({
      model: googleAI.model(MODEL),
      prompt: [
        { text: prompt },
        { media: { url: videoDataUrl } },
      ],
      config: { temperature: 0.1 },
    });

    const translation = response.text?.trim()?.replace(/^["']|["']$/g, '') || '';
    res.json({ translation });
  } catch (e: any) {
    console.error('Translation error:', e);
    const fallbacks = (process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-2.5-flash,gemini-1.5-flash').split(',');
    for (const m of fallbacks.map((s) => s.trim()).filter(Boolean)) {
      try {
        const response = await ai.generate({
          model: googleAI.model(m),
          prompt: [
            { text: prompt },
            { media: { url: videoDataUrl } },
          ],
          config: { temperature: 0.1 },
        });
        const translation = response.text?.trim()?.replace(/^["']|["']$/g, '') || '';
        return res.json({ translation });
      } catch {}
    }
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

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
