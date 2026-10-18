# SignAgent

Sign language in, real tasks out. SignAgent turns signed (or typed) commands into actions in Google Calendar, Gmail, Tasks and Docs, using a Gemini-powered agent built with Genkit.

```
Camera → sign-to-text model → text ─┐
Typed message ──────────────────────┴→ Chat UI → /api/chat → Genkit agent (Gemini + tools)
                                                   risky tool? → Confirm card → /api/confirm
```

- **`web/`**: React + TypeScript + Vite chat UI with a camera button and a confirm card.
- **`server/`**: Express + Genkit agent. Gemini decides which tools to call, and risky ones (send email, create calendar event) pause until the user approves.
- **No database.** Chat sessions live in server memory and are lost on restart.

## Prerequisites

- **Node.js 20 or newer** (`node -v`). Install the LTS from nodejs.org. Open a new terminal afterwards so `npm` is found.
- A **Gemini API key** from https://aistudio.google.com/apikey
- *(Only for real Google actions)* a Google Cloud / Firebase project, see [Real mode](#real-mode-actually-create-events-and-send-emails).

On Windows PowerShell, if `npm` is blocked by script policy, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first.

## Quick start (demo mode, no Google setup)

In demo mode the agent really runs on Gemini, but tools only simulate their actions, so nothing touches anyone's Google account.

**1. Server** (terminal 1)

```bash
cd server
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

Edit `server/.env`, set `GEMINI_API_KEY`, and keep `DRY_RUN=true`. Then:

```bash
npm run dev
```

Check http://localhost:8080/health. It should return `"ok": true`.

**2. Web** (terminal 2)

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 and try:

- "Add in my calendar a trip to Goa on coming Sunday": a confirm card appears. Click **Confirm** and the action shows as *(simulated)*.
- "Add task: renew passport": runs without a confirm card.
- "Email" with no details: the agent asks who to email.
- Click the camera icon, then **Test: simulate a sign** to try the sign-input path without a model.

## Environment variables

### `server/.env`

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini key from AI Studio. |
| `GEMINI_MODEL` | Main model, for example `gemini-3.8-flash`. Model names change, so see below to list yours. |
| `GEMINI_FALLBACK_MODEL` | Comma-separated backups tried if the main model returns 503/429, for example `gemini-3.5-flash,gemini-3.1-flash-lite`. |
| `TIMEZONE` | Used to resolve dates like "coming Sunday". Default `Asia/Kolkata`. |
| `DRY_RUN` | `true` = tools only simulate. `false` = real Google API calls (needs sign-in). |
| `PORT` | Server port. Default `8080`. |

Restart the server after editing `.env`. `tsx watch` only reloads on source changes.

To list the models your key can use (use ones with tool-calling; skip `preview`, `tts`, `image`):

```bash
# macOS/Linux
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```
```powershell
# Windows PowerShell, from the server folder
$k = (Select-String -Path .env -Pattern '^GEMINI_API_KEY=(.*)$').Matches.Groups[1].Value
(Invoke-RestMethod "https://generativelanguage.googleapis.com/v1beta/models?key=$k").models |
  Where-Object { $_.supportedGenerationMethods -contains 'generateContent' } | ForEach-Object { $_.name }
```

### `web/.env`

Only needed for real Google sign-in. Vite reads it at startup, so restart `npm run dev` after changes.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
```

## Real mode (actually create events and send emails)

1. **Firebase project.** At console.firebase.google.com, create a project (ideally reuse your Google Cloud project). Under *Authentication → Sign-in method*, enable **Google**.
   If you can't see *Build*, open the *Product categories* group in the left sidebar or use *All products*.
2. **Register a web app.** *Project settings (gear) → General → Your apps → `</>`.* Don't tick Hosting. Copy `apiKey`, `authDomain` and `projectId` into `web/.env`.
3. **Enable APIs** in Google Cloud Console (*APIs & Services → Library*): Google Calendar API, Gmail API, Google Tasks API, Google Docs API.
4. **OAuth consent screen** (*Google Auth Platform*): while it is in **Testing**, only listed **test users** can sign in. Add each teammate's Gmail under *Audience → Test users*, or click **Publish app** so any Google account can sign in (a sensitive-scope "unverified app" warning will appear; users click *Advanced → Continue*). Make sure these scopes are listed under *Data access*: `gmail.send`, `calendar.events`, `tasks`, `documents`.
5. **Authorized domains.** In Firebase *Authentication → Settings → Authorized domains*, make sure `localhost` is present (and your deployed domain later).
6. Set `DRY_RUN=false` in `server/.env`, restart the server and the web dev server.
7. Open the app, click **Sign in with Google**, approve the permissions. Your email appears in the header, and tool rows no longer say *(simulated)*.

Each person signs in with **their own** Google account, so actions happen in their own calendar and mailbox. Nothing is stored on the server. The token lives only in browser memory (about 1 hour, lost on refresh).

## Tools the agent can use

| Tool | Needs confirm | Google API |
|---|---|---|
| `create_calendar_event` | Yes | Calendar |
| `send_email` (use `to: "me"` for the signed-in user) | Yes | Gmail |
| `add_task` | No | Tasks |
| `create_note_doc` | No | Docs |
| `get_directions` | No | Maps link, no API needed |

To add a tool, add a `tool(...)` entry in `server/src/index.ts`. Pass `true` as the last argument to require confirmation.

## API

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/chat` | `{ sessionId, text, userEmail }` | `{ status: "done", message, actions[] }` or `{ status: "needs_confirmation", confirmations: [{ name, input }] }` |
| `POST /api/confirm` | `{ sessionId, approved }` | Same shape as `/api/chat` |
| `GET /health` | none | `{ ok, model, dryRun }` |

Send the user's Google access token as `Authorization: Bearer <token>`. Without it, tools simulate.

## Plugging in the sign-to-text model

Everything goes through `web/src/signToText.ts`. Replace the body of `startSignToText(video, onText)`: attach your model to the `<video>` element and call `onText("RECOGNISED TEXT")` whenever a command is finished. That text is sent into the agent exactly like typed text. Don't put API keys in browser code. Use a server endpoint or short-lived tokens if the model calls Gemini.

## Project layout

```
server/src/index.ts     Genkit setup, tools, agent loop, Express routes
web/src/App.tsx         Chat UI, confirm card, camera panel
web/src/signToText.ts   Sign-to-text integration point
web/src/firebase.ts     Google sign-in and scopes
web/src/main.tsx        Entry point with an error boundary
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm` not recognized | Install Node.js LTS, then open a **new** terminal. |
| `Tool interrupts are a beta feature` | `server/src/index.ts` must import `genkit` from `genkit/beta`. |
| 503 `high demand` from Gemini | Set `GEMINI_FALLBACK_MODEL` (comma-separated), restart the server, and wait a few minutes. |
| 404 model not found | That model isn't available to your key. List models with the commands above. |
| Page goes blank after sending | Open the browser console (`F12`). The error boundary also prints the error on the page. |
| `auth/operation-not-allowed` | Enable Google sign-in in Firebase Authentication. |
| `auth/unauthorized-domain` | Add `localhost` (or your domain) to Firebase Authorized domains. |
| "Access blocked ... has not completed verification" | Add your account as a test user, or publish the consent screen. |
| Red row: "API has not been used in project" | Enable that API in Google Cloud and retry after a minute. |
| Red row: 401 | The Google token expired (about 1 hour). Sign in again. |
| Red row: 403 insufficient scopes | Sign in again and approve every permission; check scopes under *Data access*. |
| Env changes ignored | Restart the server, or the web dev server for `web/.env`. |

## Known limitations

- Sessions are in memory. If you deploy, use a single instance (for example Cloud Run `--max-instances 1`).
- The server does not yet verify Firebase ID tokens, so anyone who can reach it can use your Gemini quota. Add verification before sharing the URL widely.
- Genkit tool interrupts are a beta API. Pin versions and avoid `npm update` right before a demo.
- Smart home and spoken replies are not implemented.

## Security

Never commit `.env` files or API keys. The `.gitignore` already excludes them. The Gemini key stays on the server only.
