// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION POINT: sign-to-text model (your friend's code goes here).
//
// Contract: start reading signs from the camera <video> element and call
// onText("RECOGNISED SENTENCE") whenever a sentence/command is finished.
// That text is sent straight into the agentic flow (same as typing it).
// Return an object whose stop() releases anything the model is using.
// ─────────────────────────────────────────────────────────────────────────────
export type SignHandle = { stop: () => void };

export function startSignToText(_video: HTMLVideoElement, _onText: (text: string) => void): SignHandle {
  // TODO(friend): load the model, attach to _video frames, and call _onText(text).
  console.info('[signToText] placeholder: no model attached yet');
  return { stop() {} };
}
