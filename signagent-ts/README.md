# SignAgent 🤟
> **Enterprise Multimodal Sign-Language Assistant for Deaf & Hard-of-Hearing Professionals**
> *Powered by Google Gemini 3, Genkit, and MediaPipe On-Device Vision*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%203-8E75B2.svg)](https://ai.google.dev/)
[![Genkit](https://img.shields.io/badge/Orchestration-Genkit-FF6F00.svg)](https://firebase.google.com/docs/genkit)
[![MediaPipe](https://img.shields.io/badge/Vision-MediaPipe%20WASM-0097A7.svg)](https://developers.google.com/mediapipe)

---

## 🌟 Overview

**SignAgent** is an AI assistant designed for Deaf, speech-disabled, and hard-of-hearing professionals. It interprets sign language video clips—supporting both **Indian Sign Language (ISL)** and **American Sign Language (ASL)**—as well as natural text commands, bridging communication barriers by executing enterprise workflows across Google Workspace (Google Calendar, Gmail, Google Tasks, Google Docs, and Google Maps) using Google Gemini and Genkit.

---

## 🚀 Key Features

* **Hands-Free Ambient Sign Detection**: Real-time on-device MediaPipe hand landmark tracking (2-hand support, local WASM, zero latency, privacy-preserving). Automatic start on hands-up, automatic finish on hands-lowered.
* **Multimodal Video Interpretation**: Directly feeds recorded sign language video clips and active workspace context into Google Gemini 3.1 Flash Lite in ~1-2 seconds.
* **Side-by-Side Studio Interface**: Real-time typewriter effect streaming recognized signs directly into the chat composer.
* **Workspace Context Injection**: Resolves ambiguous gestures and pronouns using active context (e.g., open email, Jira issue, meeting notes).
* **Enterprise Tool Orchestration**: Multi-step workflows across Google Calendar, Gmail, Tasks, Docs, and Maps.
* **Human-in-the-Loop Confirmation**: Consequential actions (like sending emails or creating calendar events) pause for explicit user confirmation in the UI before execution.

---

## 🏗️ Architecture

```text
Camera (Webcam)
   │
   ▼
MediaPipe HandLandmarker (WASM, Browser) ──> Detects Hands Raised/Lowered
   │
   ▼
WebM Video Stream (360p @ 15fps, 200kbps)
   │
   ▼
POST /api/translate ──> Google Gemini 3.1 Flash Lite ──> Real-Time Typewriter Translation
   │
   ▼
POST /api/chat ───────> Google Gemini 3.5 Flash + Genkit Tools
   │
   ├──> Safe Tools (Tasks, Docs, Maps) ──────────> Executed Directly
   │
   └──> Risky Tools (Calendar, Gmail) ───────────> Confirmation Card ──> User Approval
```

---

## ⚡ Quick Start

### 1. Set Up the Backend Server

```bash
cd server
npm install
```

Configure `server/.env`:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
GEMINI_MODEL=gemini-3.5-flash
GEMINI_TRANSLATE_MODEL=gemini-3.1-flash-lite
GEMINI_TRANSLATE_TEMPERATURE=0.2
GEMINI_TRANSLATE_TOP_P=0.85
TIMEZONE=Asia/Kolkata
DRY_RUN=true
PORT=8080
```

Start the backend:
```bash
npm run dev
```

### 2. Set Up the Web Frontend

```bash
cd ../web
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Evaluation & Demo

1. Click the **Camera icon** in the composer bar to open the studio panel.
2. Raise your hands in front of the camera: **Recording starts automatically** (`🔴 Recording`).
3. Sign your command in **ISL** or **ASL** (e.g. *“Schedule a meeting tomorrow at 3 PM”*).
4. Lower your hands: SignAgent detects hand lowering, finalizes the recording, interprets the sign via Gemini, and types the result into the composer.
5. Review the interactive confirmation card and click **Confirm** to execute.

---

## 👥 License

MIT License
