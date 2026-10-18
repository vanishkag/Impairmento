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
signagent-ts/
├── server/          # Express + Genkit backend (API & tool execution)
│   ├── src/index.ts # Agent server, Genkit tools, and multimodal endpoints
│   ├── .env         # Backend environment variables
│   └── package.json
└── web/             # React + Vite frontend (UI & camera hand detection)
    ├── public/      # Local MediaPipe WASM and model assets
    ├── src/
    │   ├── App.tsx          # Main chat & camera interface
    │   ├── handDetector.ts  # MediaPipe HandLandmarker integration
    │   └── firebase.ts      # Google Auth / Firebase initialization
    └── package.json
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

### 1. Set Up the Backend Server

1. **Navigate to the server directory**:
   ```bash
   cd server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in `server/`:
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

### 2. Set Up the Web Frontend

1. **Open a new terminal and navigate to the web directory**:
   ```bash
   cd web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **(Optional) Configure Firebase Authentication**:
   - By default, SignAgent runs in **Demo Mode**, simulating tool execution with dry-run support without requiring Google OAuth login.
   - To enable real Google Workspace actions, update [`src/firebase.ts`](file:///c:/Users/vanis/repos/gemini-sign/signagent-ts/web/src/firebase.ts) with your Firebase project credentials.

4. **Start the frontend development server**:
   ```bash
   npm run dev
   ```
   Vite will host the web client at `http://localhost:5173`.

---

### 3. Using SignAgent

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

### Backend (`server/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Required**. Google Gemini API key from Google AI Studio. | `""` |
| `PORT` | Local port for Express API server. | `8080` |
| `TIMEZONE` | Timezone identifier for resolving relative dates (e.g. "coming Sunday"). | `Asia/Kolkata` |
| `GEMINI_MODEL` | Primary model identifier. | `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL`| Comma-separated fallback models. | `gemini-1.5-flash` |
| `DRY_RUN` | When set to `true`, tool calls return simulated results. | `false` |

### Frontend (`web/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of the backend API (useful when deploying to separate domains). | `""` (proxied by Vite) |

---

## Production Build

To build the client for production:

```bash
cd web
npm run build
```

This compiles static assets into `web/dist/`, including all bundled WebAssembly and MediaPipe model files, ready for deployment to **Firebase Hosting**, **Vercel**, or **Cloud Run**.

