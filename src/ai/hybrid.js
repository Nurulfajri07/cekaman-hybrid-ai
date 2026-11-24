// Hybrid scam-check engine.
//
// Two-tier routing on top of Firebase AI Logic hybrid inference:
//
//   Stage 1 — TRIAGE (on-device first): one hybrid model instance with
//   InferenceMode.PREFER_ON_DEVICE. The SDK tries Gemini Nano in Chrome;
//   if Nano is unavailable it falls back to the cloud model automatically.
//   Fast, private, free. Structured JSON output on BOTH paths
//   (inCloudParams.responseSchema + onDeviceParams.responseConstraint).
//
//   Stage 2 — DEEP (cloud only, on demand): a second model instance with
//   InferenceMode.ONLY_IN_CLOUD (same cloud model, richer prompt). Runs
//   ONLY when Stage 1 is uncertain (MERAGUKAN, middle score band, or low
//   confidence) or when the user explicitly asks for a deep analysis.
//   Decisive Stage 1 verdicts never touch the cloud.
//
// The UI always shows WHERE the answer came from via
// response.inferenceSource ('on_device' | 'in_cloud') — the hybrid
// behaviour is visible, not just claimed.
//
// NOTE (verified against the installed SDK, firebase@13.4.0):
// getGenerativeModel takes `ModelParams | HybridParams` — a UNION.
// `model` (the cloud model name) and `mode` can NOT be combined at the
// top level. The cloud model goes inside `inCloudParams: { model, ... }`.
// HybridParams = { mode, onDeviceParams?, inCloudParams? }.

import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
} from 'firebase/ai';
import { getAIInstance, getRemoteConfigValues } from '../firebase.js';
import { buildDeepPrompt, buildTriagePrompt } from './prompts.js';
import { localChecks } from './localChecks.js';

// JSON contract for both models, on both paths.
export const verdictSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({
      enum: ['AMAN', 'MERAGUKAN', 'BERBAHAYA'],
      description: 'Verdict: AMAN (safe), MERAGUKAN (unsure), BERBAHAYA (scam).',
    }),
    score: Schema.integer({
      description: 'Risk score 0-100. 0 = safe, 100 = very dangerous.',
    }),
    confidence: Schema.enumString({
      enum: ['rendah', 'sedang', 'tinggi'],
      description: 'How confident the model is in this verdict.',
    }),
    reasons: Schema.array({
      items: Schema.string({
        description: 'Short reason in Indonesian.',
      }),
    }),
    signals: Schema.array({
      items: Schema.string({
        description: 'Specific suspicious signals found in the text.',
      }),
    }),
  },
  optionalProperties: ['signals'],
});

const models = { triage: null, deviceOnly: null, cloudOnly: null };

function cloudModelName() {
  return getRemoteConfigValues().cloudModel;
}

function triageModel(ai) {
  if (!models.triage) {
    models.triage = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: cloudModelName(),
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: verdictSchema,
        },
      },
      onDeviceParams: {
        promptOptions: { responseConstraint: verdictSchema },
      },
    });
  }
  return models.triage;
}

function deviceOnlyModel(ai) {
  if (!models.deviceOnly) {
    models.deviceOnly = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      // A cloud model name is still required per mode even though this
      // mode never calls the cloud.
      inCloudParams: { model: cloudModelName() },
      onDeviceParams: {
        promptOptions: { responseConstraint: verdictSchema },
      },
    });
  }
  return models.deviceOnly;
}

function cloudOnlyModel(ai) {
  if (!models.cloudOnly) {
    // Plain (non-hybrid) model = cloud-only by definition; no `mode`.
    models.cloudOnly = getGenerativeModel(ai, {
      model: cloudModelName(),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: verdictSchema,
      },
    });
  }
  return models.cloudOnly;
}

// Must be called after/on a user interaction (button click) and before the
// first prompt, per the Firebase docs. Shows Nano download progress.
// Safe to call repeatedly; resolves even if Nano is unavailable (the SDK
// then falls back to cloud for PREFER_ON_DEVICE).
export async function ensureDeviceModel(onProgress) {
  const ai = getAIInstance();
  const model = triageModel(ai);
  try {
    await model.initializeDeviceModel((p) =>
      onProgress?.(Math.round(p * 100)),
    );
    return true;
  } catch (err) {
    console.warn('[CekAman] initializeDeviceModel failed, cloud fallback:', err);
    return false;
  }
}

// Best-effort Nano availability probe for the status pill. Uses the raw
// Chrome Prompt API when present; returns 'available' | 'downloading' |
// 'downloadable' | 'unavailable' | 'unknown'.
export async function checkNanoAvailability() {
  try {
    const LM = globalThis.LanguageModel;
    if (!LM?.availability) return 'unknown';
    return await LM.availability();
  } catch {
    return 'unknown';
  }
}

// Retry a generateContent call once on transient server errors (503/500,
// fetch failures, deadline-expired). The cloud backend occasionally returns
// a 503 that succeeds on an immediate retry — without this, one flaky call
// fails the whole check after minutes of waiting. Never retries on
// client/permission errors (400/401/403) or on device-only failures.
function isTransientError(err) {
  const msg = String(err?.message || err || '');
  return /503|500|502|504|fetch-error|Deadline expired|UNAVAILABLE|Failed to fetch|NetworkError/i.test(
    msg,
  );
}

async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientError(err)) throw err;
    console.warn(`[CekAman] ${label} failed transiently, retrying once:`, err);
    await new Promise((r) => setTimeout(r, 2000));
    return await fn();
  }
}

function clampScore(n) {
  const v = Number.isFinite(n) ? Math.round(n) : 50;
  return Math.min(100, Math.max(0, v));
}

// The model is instructed to return JSON, but Nano can be sloppy: extract
// the first {...} block and validate the fields defensively.
function parseVerdict(rawText) {
  const fallback = {
    verdict: 'MERAGUKAN',
    score: 50,
    confidence: 'rendah',
    reasons: ['Model mengembalikan jawaban yang tidak bisa dipahami.'],
    signals: [],
  };
  try {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return fallback;
    const obj = JSON.parse(rawText.slice(start, end + 1));
    const verdict = ['AMAN', 'MERAGUKAN', 'BERBAHAYA'].includes(obj.verdict)
      ? obj.verdict
      : 'MERAGUKAN';
    return {
      verdict,
      score: clampScore(obj.score),
      confidence: ['rendah', 'sedang', 'tinggi'].includes(obj.confidence)
        ? obj.confidence
        : 'rendah',
      reasons: Array.isArray(obj.reasons) && obj.reasons.length > 0
        ? obj.reasons.slice(0, 4).map(String)
        : ['Tidak ada alasan yang diberikan model.'],
      signals: Array.isArray(obj.signals)
        ? obj.signals.slice(0, 6).map(String)
        : [],
    };
  } catch {
    return fallback;
  }
}

// Main entry point.
// mode: 'auto' | 'device' | 'cloud' (from the UI toggle).
// forceDeep: true when the user taps "Analisis mendalam (cloud)".
// onProgress(percent), onStage('triage' | 'deep') drive the UI.
export async function analyzeScam(input, { mode = 'auto', forceDeep = false, onProgress, onStage } = {}) {
  const ai = getAIInstance();
  if (!ai) throw new Error('Firebase belum dikonfigurasi.');
  const cfg = getRemoteConfigValues();
  const signals = localChecks(input);

  // Stage 1 — triage on the selected path.
  const stage1Model =
    mode === 'device'
      ? deviceOnlyModel(ai)
      : mode === 'cloud'
        ? cloudOnlyModel(ai)
        : triageModel(ai);

  onStage?.('triage');
  const r1 = await withRetry(
    () => stage1Model.generateContent(buildTriagePrompt(input, signals)),
    'triage',
  );
  const v1 = parseVerdict(r1.response.text());
  const source1 = r1.response.inferenceSource || 'in_cloud';
  const stages = [{ name: 'triage', ...v1, source: source1 }];

  // Escalation decision (auto mode only; decisive verdicts stay local).
  const uncertain =
    v1.verdict === 'MERAGUKAN' ||
    (v1.score >= cfg.escalateMin && v1.score <= cfg.escalateMax) ||
    v1.confidence === 'rendah';
  const mayUseCloud = mode !== 'device';

  if ((forceDeep || (mode === 'auto' && uncertain)) && mayUseCloud) {
    onStage?.('deep');
    const r2 = await withRetry(
      () => cloudOnlyModel(ai).generateContent(buildDeepPrompt(input, signals, v1)),
      'deep',
    );
    const v2 = parseVerdict(r2.response.text());
    stages.push({
      name: 'deep',
      ...v2,
      source: r2.response.inferenceSource || 'in_cloud',
    });
    return { ...v2, source: 'in_cloud', stages, localSignals: signals };
  }

  return { ...v1, source: source1, stages, localSignals: signals };
}
