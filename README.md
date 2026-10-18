<<<<<<< HEAD
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
=======
# SignAgent 🤟

An AI-powered assistant designed for Deaf, speech-disabled, and hard-of-hearing professionals. **SignAgent** interprets sign language video clips—supporting both **Indian Sign Language (ISL)** and **American Sign Language (ASL)**—as well as natural text commands, bridging communication by executing enterprise workflows across Google Workspace (Google Calendar, Gmail, Google Tasks, Google Docs, and Google Maps) using Google Gemini and Genkit.

---

## Features

- **Hands-Free Automatic Sign Recording**: Uses client-side MediaPipe Hand Tracking to detect when hands are raised. Video recording starts automatically and sends the clip as soon as you lower your hands upon finishing your signs.
- **Multimodal Video Interpretation**: Directly feeds recorded sign language video clips and active workspace context into Google Gemini.
- **Tool Orchestration with Human-in-the-Loop Confirmation**: Risky actions (like sending an email or creating a calendar event) pause for explicit user confirmation in the UI before execution.
- **Privacy-Preserving & Low Latency**: Hand detection and skeleton tracking run locally in the browser using preloaded WebAssembly and local models.

---

## Project Structure

```text
gemini-sign/
├── signagent-ts/
│   ├── server/          # Express + Genkit backend (API & tool execution)
│   │   ├── src/index.ts # Agent server, Genkit tools, and multimodal endpoints
│   │   ├── .env         # Backend environment variables
│   │   └── package.json
│   └── web/             # React + Vite frontend (UI & camera hand detection)
│       ├── public/      # Local MediaPipe WASM and model assets
│       ├── src/
│       │   ├── App.tsx          # Main chat & camera interface
│       │   ├── handDetector.ts  # MediaPipe HandLandmarker integration
│       │   └── firebase.ts      # Google Auth / Firebase initialization
│       └── package.json
└── README.md
```

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Gemini API Key**: Get a key from [Google AI Studio](https://aistudio.google.com/)
- A working webcam for sign video recording

---

## Local Setup Guide

Follow these steps to set up and run both the backend server and frontend client locally.

### 1. Clone the Repository

```bash
git clone https://github.com/vanishkag/Impairmento.git
cd gemini-sign
```

---

### 2. Set Up the Backend Server

1. **Navigate to the server directory**:
   ```bash
   cd signagent-ts/server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in `signagent-ts/server/`:
   ```env
   # Required: Google Gemini API Key
   GEMINI_API_KEY="your-gemini-api-key-here"

   # Optional Server Settings
   PORT=8080
   TIMEZONE="Asia/Kolkata"
   GEMINI_MODEL="gemini-2.5-flash"
   GEMINI_FALLBACK_MODEL="gemini-1.5-flash"

   # Set DRY_RUN=true to simulate Google Workspace tool actions without live API credentials
   DRY_RUN=true
   ```

4. **Start the server**:
   ```bash
   npm run dev
   ```
   The backend will start and listen on `http://localhost:8080`.

---

### 3. Set Up the Web Frontend

1. **Open a new terminal and navigate to the web directory**:
   ```bash
   cd signagent-ts/web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **(Optional) Configure Firebase Authentication**:
   - By default, SignAgent runs in **Demo Mode**, simulating tool execution with dry-run support without requiring Google OAuth login.
   - To enable real Google Workspace actions, update [`signagent-ts/web/src/firebase.ts`](file:///c:/Users/vanis/repos/gemini-sign/signagent-ts/web/src/firebase.ts) with your Firebase project credentials.

4. **Start the frontend development server**:
   ```bash
   npm run dev
   ```
   Vite will host the web client at `http://localhost:5173`.

---

### 4. Using SignAgent

1. Open your browser and navigate to `http://localhost:5173`.
2. Allow webcam access when prompted.
3. Click the **Camera icon** in the input bar to open the camera viewport.
4. **Sign your command**:
   - Raise your hands in front of the camera: **Recording starts automatically** (`🔴 Recording`).
   - Sign your command (e.g. *“Schedule a meeting tomorrow at 3 PM”*).
   - Lower your hands when finished: SignAgent detects hand departure and automatically finishes recording (`⏳ Hands lowered...`) and submits the clip to Gemini.
5. If the request involves scheduling or sending communications, review the parameters in the confirmation box and click **Confirm**.

---

## Environment Variables Reference

### Backend (`signagent-ts/server/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Required**. Google Gemini API key from Google AI Studio. | `""` |
| `PORT` | Local port for Express API server. | `8080` |
| `TIMEZONE` | Timezone identifier for resolving relative dates (e.g. "coming Sunday"). | `Asia/Kolkata` |
| `GEMINI_MODEL` | Primary model identifier. | `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL`| Comma-separated fallback models. | `gemini-1.5-flash` |
| `DRY_RUN` | When set to `true`, tool calls return simulated results. | `false` |

### Frontend (`signagent-ts/web/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of the backend API (useful when deploying to separate domains). | `""` (proxied by Vite) |

---

## Production Build

To build the client for production:

```bash
cd signagent-ts/web
npm run build
```

This compiles static assets into `signagent-ts/web/dist/`, including all bundled WebAssembly and MediaPipe model files, ready for deployment to **Firebase Hosting**, **Vercel**, or **Cloud Run**.

>>>>>>> ea3f6f43da6980f9030f4c8aafb67ad69d985b5c
