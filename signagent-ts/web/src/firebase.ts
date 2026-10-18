import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/documents',
];

export async function signIn() {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((s) => provider.addScope(s));
  // Explicitly prompt for consent so Google requests all OAuth scopes (Calendar, Gmail, Tasks, Docs)
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline',
  });
  const result = await signInWithPopup(getAuth(app), provider);
  const cred = GoogleAuthProvider.credentialFromResult(result);
  console.log('[Auth] Signed in user:', result.user.email, 'Token available:', !!cred?.accessToken);
  return { email: result.user.email ?? '', token: cred?.accessToken ?? '' };
}
