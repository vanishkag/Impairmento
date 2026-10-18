# SignAgent 🤟
> **Enterprise Multimodal Sign-Language Assistant for Deaf & Hard-of-Hearing Professionals**
> *Powered by Google Gemini 3, Genkit, and MediaPipe On-Device Vision*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%203-8E75B2.svg)](https://ai.google.dev/)
[![Genkit](https://img.shields.io/badge/Orchestration-Genkit-FF6F00.svg)](https://firebase.google.com/docs/genkit)
[![MediaPipe](https://img.shields.io/badge/Vision-MediaPipe%20WASM-0097A7.svg)](https://developers.google.com/mediapipe)

---

## 🌟 Executive Summary

In fast-paced enterprise environments, workplace collaboration tools (Google Calendar, Gmail, Google Tasks, Google Docs) are built almost exclusively around spoken language or typed text. For **over 70 million Deaf and hard-of-hearing individuals worldwide**, communicating complex thoughts in written English is often slower than signing, as sign languages (such as **Indian Sign Language (ISL)** and **American Sign Language (ASL)**) have distinct grammars, spatial references, and non-verbal syntax.

**SignAgent** bridges this gap. It provides a hands-free, real-time sign language interpreter and intelligent assistant that translates natural sign gestures into structured enterprise actions. 

Instead of treating sign language as an isolated classification task, SignAgent uses **multimodal visual reasoning combined with active workspace context** to understand user intent, chain multi-step workflows, and execute actions across Google Workspace with human-in-the-loop safety controls.

---

## 🚀 Key Innovations

### 1. Hands-Free Ambient Sign Detection
* **Zero Button Clicks**: Powered by on-device **MediaPipe HandLandmarker** running via WebAssembly (WASM).
* **Smart Session Triggers**: Recording begins automatically when your hands enter the frame and finalizes dynamically when hands are lowered.
* **Persistent Two-Hand Tracking**: Optimized for ISL and ASL with low-confidence hysteresis (`0.25` tracking confidence, 5-frame debounce), ensuring overlapping or touching hands during two-handed signs never drop tracking.
* **100% Client-Side Privacy**: Skeletal hand landmark tracking executes locally in the browser; raw camera video is only captured during active signing.

### 2. High-Speed Studio Interface & Live Typewriter Translation
* **Side-by-Side Studio Layout**: A dedicated camera viewport sits alongside the assistant feed with real-time HUD status badges (`✌️ 2 Hands Tracked`, `🔴 Recording`, `⚡ Translating`).
* **Clean Real-Time Typewriter Stream**: Rather than cluttering the conversation with raw video recordings, sign clips are processed in **~1.2–2.0 seconds** via `gemini-3.1-flash-lite`, animated via a live typewriter effect into the input composer, and submitted directly into the agent.

### 3. Context-Aware Visual Grounding
* Enterprise signs are often ambiguous or refer to screen items (e.g., signing *“Schedule meeting with him”* or *“Email this list”*).
* **Workspace Context Bar**: Users can pin their active task, Jira ticket, meeting notes, or open email. Gemini fuses the visual gestures with the workspace context to disambiguate pronouns, names, and relative dates.

### 4. Enterprise Workflow Orchestration with Human-in-the-Loop Safety
* Built on **Google Genkit** with native tool calling:
  * 📅 **Google Calendar**: Creates events with intelligent timezone resolution (`Asia/Kolkata` default).
  * ✉️ **Gmail**: Composes and dispatches emails.
  * 📝 **Google Docs**: Generates formatted notes and summaries.
  * ✅ **Google Tasks**: Manages daily action items and deadlines.
  * 🗺️ **Google Maps**: Generates directions and transit routes.
* **Genkit Interrupt Safety Cards**: Consequential actions (booking calendar events, sending emails) pause the execution loop with interactive UI confirmation cards. Users can review, confirm, or cancel actions with full audit visibility.

---

## 🏗️ System Architecture

```text
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │                                CLIENT (BROWSER)                                │
 │                                                                                │
 │   Webcam Stream ──> MediaPipe HandLandmarker (Local WASM)                      │
 │                             │                                                  │
 │                     Hands Raised / Lowered                                     │
 │                             ▼                                                  │
 │                 Lightweight Video Clip (360p, 200kbps)                         │
 └─────────────────────────────┬──────────────────────────────────────────────────┘
                               │ POST /api/translate (Video + Workspace Context)
                               ▼
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │                             SIGNAGENT BACKEND                                  │
 │                                                                                │
 │   1. Visual Sign Translation                                                   │
 │      Google Gemini 3.1 Flash Lite ──> Interprets ISL / ASL Gestures            │
 │                                                                                │
 │   2. Agentic Workflow Orchestration                                            │
 │      Google Gemini 3.5 Flash + Genkit Tools                                    │
 │                             │                                                  │
 │          ┌──────────────────┴──────────────────┐                               │
 │          │                                     │                               │
 │   Safe Tool (Tasks, Maps)             Risky Tool (Calendar, Gmail)             │
 │          │                                     │                               │
 │          │                               Genkit Interrupt                      │
 │          │                           (Requires User Approval)                  │
 │          │                                     │                               │
 │          ▼                                     ▼                               │
 │   Google Workspace APIs             Interactive Confirmation Card              │
 └────────────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Multimodal Vision & AI** | Google Gemini 3.1 Flash Lite (Sign Translation), Gemini 3.5 Flash (Agent Reasoning) |
| **Agent Framework** | Google Genkit (`genkit/beta`), `@genkit-ai/google-genai` |
| **Computer Vision (Client)**| MediaPipe Tasks Vision (`@mediapipe/tasks-vision`), WebAssembly |
| **Frontend UI** | React 18, TypeScript, Vite, Atkinson Hyperlegible Typography |
| **Backend API** | Node.js (v20+), Express, TypeScript, AsyncLocalStorage |
| **Authentication & Cloud** | Google Cloud Platform, Firebase Auth (OAuth 2.0 with Calendar/Gmail/Docs scopes) |

---

## ⚡ Quick Start Guide (For Judges)

SignAgent is designed to run locally in **less than 2 minutes**. It features a built-in **Demo / Simulation Mode** that allows full testing of sign recognition and agent workflows without requiring private Google credentials.

### Prerequisites
* **Node.js**: v20 or newer (`node -v`)
* **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/app/apikey)
* A laptop webcam or USB camera

---

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/vanishkag/Impairmento.git
cd gemini-sign

# Install backend dependencies
cd signagent-ts/server
npm install

# Install frontend dependencies
cd ../web
npm install
```

---

### 2. Configure Environment

1. In `signagent-ts/server/`, create or edit `.env`:
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
> **Note**: `DRY_RUN=true` enables safe simulation mode. Actions (Calendar, Gmail, Docs) simulate their execution with full fidelity without touching external accounts.

---

### 3. Start the Application

**Terminal 1 (Backend Server):**
```bash
cd signagent-ts/server
npm run dev
```
*Server starts on `http://localhost:8080` (verify health at `http://localhost:8080/health`).*

**Terminal 2 (Frontend Client):**
```bash
cd signagent-ts/web
npm run dev
```
*Frontend opens at `http://localhost:5173`.*

---

## 🧪 Evaluation & Demo Walkthrough

Once opened at `http://localhost:5173`:

### Test 1: Hands-Free Sign Language Input
1. Click the **Camera Icon** in the composer bar to open the studio panel.
2. Allow camera access. The HUD will indicate: `👋 Show hands to sign`.
3. **Raise both hands** into the camera view:
   * Tracking points appear over hand joints (`✌️ 2 Hands`).
   * The status turns red: `🔴 Recording`.
4. Perform an **ISL or ASL sign** (e.g., greeting, meeting, scheduling, waving, or spelling).
5. **Lower your hands**:
   * SignAgent automatically detects hand lowering (`⚡ Processing gestures...`).
   * Within ~1.5s, the translation types into the composer via typewriter effect.
   * The command automatically dispatches to the agentic workflow.

### Test 2: Google Calendar Scheduling with Human-in-the-Loop Confirmation
* **Input**: *"Add in my calendar a meeting with John coming Sunday at 4 PM"*
* **Behavior**:
  * Agent resolves relative dates using local timezone context (`Asia/Kolkata`).
  * Because calendar creation is consequential, an interactive **Confirmation Card** appears displaying title, start/end ISO timestamps, and description.
  * Click **Confirm** to execute, or **Cancel** to abort (with clean cancellation feedback).

### Test 3: Workspace Context Grounding
1. Click the **`+ Context`** button in the header.
2. Enter: `Active Project: Flight Booking to Goa, Flight 6E-204`.
3. Sign or type: *"Email me the packing list and itinerary"*
4. **Behavior**: The agent fuses the active context into its prompt and generates a personalized checklist relevant to Goa travel.

### Test 4: Real Google Account Integration (Optional)
* Click **Sign in with Google** in the top header.
* Authorize permissions to switch from Demo Simulation to live Google Workspace execution.

---

## 🔒 Security & Safety Controls

1. **Human-in-the-Loop Guardrails**: Reversible actions (like adding tasks or generating Google Maps links) execute directly. Irreversible actions (sending emails, modifying calendars) strictly halt via Genkit interrupts until approved.
2. **Cancellation Verification**: If a user cancels an action, the agent receives an explicit cancellation signal, preventing false claims of task completion.
3. **Zero Video Storage**: Video clips are streamed as transient base64 payloads to Gemini over HTTPS and are never written to disk.
4. **Credential Isolation**: Client tokens exist only in transient browser session memory and are never persisted to databases.

---

## 👥 Project Information & License

* **Project**: SignAgent
* **Category**: AI for Accessibility / Multimodal Agentic Systems
* **License**: MIT License
