import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';

let landmarker: HandLandmarker | null = null;
let initPromise: Promise<HandLandmarker> | null = null;

export function preloadHandLandmarker(): void {
  getHandLandmarker().catch((err) => console.warn('[HandLandmarker] Preload notice:', err));
}

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (landmarker) return landmarker;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    // 1. Resolve WASM from local server (fast localhost) with fallback to CDN
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(`${origin}/wasm`);
    } catch {
      vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
    }

    // 2. Load model asset from local server with fallback to Google Cloud Storage
    const localModel = `${origin}/models/hand_landmarker.task`;
    const cdnModel =
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    const tryCreate = async (modelPath: string, delegate: 'GPU' | 'CPU') => {
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate,
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
      });
    };

    // Try local GPU -> local CPU -> CDN GPU
    try {
      landmarker = await tryCreate(localModel, 'GPU');
    } catch {
      try {
        landmarker = await tryCreate(localModel, 'CPU');
      } catch {
        landmarker = await tryCreate(cdnModel, 'GPU');
      }
    }

    return landmarker;
  })();

  return initPromise;
}

export { DrawingUtils, HandLandmarker };
