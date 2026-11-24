// Firebase setup: app, AI Logic backend, App Check, Remote Config.
// All config comes from .env (see .env.example). No secrets here — these
// are public client identifiers, but they still stay out of git.

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import {
  fetchAndActivate,
  getNumber,
  getRemoteConfig,
  getString,
} from 'firebase/remote-config';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE'),
  );
}

let app = null;
let ai = null;
let remoteConfig = null;

export function initFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (app) return { app, ai };

  app = initializeApp(firebaseConfig);

  // App Check is enforced for AI Logic since July 2026.
  // Local development: VITE_APPCHECK_DEBUG=true makes the SDK use a debug
  // token (printed in the browser console — register it in the console:
  // App Check > Apps > Manage debug tokens). Debug tokens are accepted in
  // #BuildHybridAI 2026 submissions.
  // Production: set VITE_RECAPTCHA_ENTERPRISE_KEY (free tier exists).
  try {
    if (import.meta.env.VITE_APPCHECK_DEBUG === 'true') {
      // Prefer the registered debug token when one is configured; otherwise
      // `true` makes the SDK generate one and print it in the console.
      self.FIREBASE_APPCHECK_DEBUG_TOKEN =
        import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(
        import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY || 'debug-token-mode',
      ),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // App Check failing must not brick the UI; the AI call will surface
    // the real error. Log clearly so setup problems are visible.
    console.warn('[CekAman] App Check init failed:', err);
  }

  // Gemini Developer API backend: free tier, no billing required.
  // (The Vertex AI backend would need billing — we deliberately do not use it.)
  ai = getAI(app, { backend: new GoogleAIBackend() });

  remoteConfig = getRemoteConfig(app);
  remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1h
  remoteConfig.defaultConfig = {
    // Tunable without redeploy. Defaults keep the app working even before
    // any Remote Config values are published in the console.
    cloud_model: 'gemini-3.5-flash-lite',
    escalate_min_score: 40,
    escalate_max_score: 79,
    danger_min_score: 80,
    safe_max_score: 20,
    prompt_version: 'v1',
  };
  // Fire-and-forget: defaults apply if fetch fails (offline / not set up).
  fetchAndActivate(remoteConfig).catch((err) =>
    console.warn('[CekAman] Remote Config fetch failed, using defaults:', err),
  );

  return { app, ai };
}

export function getAIInstance() {
  if (!ai) initFirebase();
  return ai;
}

// Remote Config values actually in effect (defaults if never fetched).
export function getRemoteConfigValues() {
  if (!remoteConfig) {
    return {
      cloudModel: 'gemini-3.5-flash-lite',
      escalateMin: 40,
      escalateMax: 79,
      dangerMin: 80,
      safeMax: 20,
      promptVersion: 'v1',
    };
  }
  return {
    cloudModel: getString(remoteConfig, 'cloud_model') || 'gemini-3.5-flash-lite',
    escalateMin: getNumber(remoteConfig, 'escalate_min_score') || 40,
    escalateMax: getNumber(remoteConfig, 'escalate_max_score') || 79,
    dangerMin: getNumber(remoteConfig, 'danger_min_score') || 80,
    safeMax: getNumber(remoteConfig, 'safe_max_score') || 20,
    promptVersion: getString(remoteConfig, 'prompt_version') || 'v1',
  };
}
