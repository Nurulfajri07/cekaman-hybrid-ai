# CekAman — Crypto Scam Checker (Firebase AI Logic, Hybrid Inference)

**#BuildHybridAI 2026** · Web (Chrome) track · Solo entry by Nurul (Devpost: fn549980)

CekAman checks a suspicious crypto link or message **before you click it**.
Paste the text, get a verdict card: **AMAN / MERAGUKAN / BERBAHAYA**,
a 0–100 risk score, reasons in Indonesian, and what the AI actually saw.

## How the hybrid works (the whole point)

Two-tier routing on top of Firebase AI Logic hybrid inference:

1. **Stage 1 — Triage, on-device first.** One hybrid model with
   `InferenceMode.PREFER_ON_DEVICE`. The SDK tries **Gemini Nano** in
   Chrome; if Nano is unavailable it falls back to the cloud model
   automatically. Fast, private, free. Structured JSON output on **both**
   paths (`inCloudParams.responseSchema` + `onDeviceParams.responseConstraint`).
2. **Stage 2 — Deep analysis, cloud only.** Runs **only** when Stage 1 is
   uncertain (verdict `MERAGUKAN`, middle score band, or low confidence),
   or when the user taps "Analisis mendalam". A second model instance
   (plain cloud model, richer prompt) makes the final call. Decisive
   Stage 1 verdicts never touch the cloud.

The UI always shows **where the answer came from** — `📱 di perangkat
(Gemini Nano)` vs `☁️ di cloud (Gemini)` — read from
`response.inferenceSource`. The hybrid behaviour is visible, not claimed.

On top of the SDK, the app runs **deterministic local checks first**
(punycode domains, IP-literal hosts, URL shorteners, suspicious TLDs,
brand-lookalike domains, scam keywords). They never decide the verdict
alone — they feed the AI prompts as context and are shown in the UI.

## Stack (pinned, verified 2026-11-18)

| Piece | Version / name | Notes |
|---|---|---|
| `firebase` (JS SDK) | **13.4.0** (exact) | Hybrid on-device needs SDK v12.5.0+ |
| `vite` | ^8.0.0 (8.3.8 installed) | Dev server + build |
| Cloud model | `gemini-3.8-flash` (stable) | Set via Remote Config `cloud_model`; verify against the models page at build time — model names move fast |
| On-device model | Gemini Nano 4 (Chrome Prompt API) | Chrome Desktop 139+, flag + download (below) |
| Backend | Gemini Developer API (`GoogleAIBackend`) | Free tier, **no billing**. Vertex AI backend is deliberately NOT used (needs billing) |
| App Check | Enforced by AI Logic setup | Debug provider locally; reCAPTCHA Enterprise in production |
| Remote Config | `cloud_model`, score thresholds, `prompt_version` | Tunable without redeploy; defaults keep the app working with zero console setup |

## Quick start

### 1. Prerequisites

- Node.js 20+ and npm
- Google Chrome Desktop **139+** (for on-device Nano; any modern browser works for cloud-only)

### 2. Create the Firebase project (once)

1. [Firebase console](https://console.firebase.google.com) → Add project.
2. **AI Services → AI Logic → Get started.** Choose **Gemini Developer API**
   as the provider (free, no billing). This step auto-enforces App Check.
3. Register a **Web app** in the project and copy its config.
4. Copy `.env.example` to `.env` and paste the config values.
5. **App Check debug token (local dev):** run the app, open DevTools console,
   copy the printed `AppCheck debug token`, then in the console go to
   **App Check → Apps → Manage debug tokens** and register it.
   (Debug tokens are accepted in #BuildHybridAI 2026 submissions.)
6. Optional: in **Remote Config**, publish the defaults from
   `src/firebase.js` (`cloud_model`, thresholds, `prompt_version`).

### 3. Enable Gemini Nano in Chrome (for the on-device path)

1. Update Chrome (chrome://settings/help) — needs v139+.
2. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Restart.
3. In DevTools console, run `await LanguageModel.availability()` — expect
   `available`, `downloading`, or `downloadable`. If `downloadable`, run
   `await LanguageModel.create()` once to start the download.

Without this, the app still works: the SDK falls back to the cloud model.

### 4. Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

### 5. Deploy (for the judges)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # point it at dist/
firebase deploy
```

## How judges run it

1. Open the hosted URL (or `npm run dev` locally).
2. Click a sample chip (e.g. 🎁 "Menang airdrop") or paste any text.
3. Click **Periksa** — watch the on-device model initialise (progress shown),
   then the verdict card with the source badge.
4. Try the three modes: **Otomatis** (hybrid), **Hanya di perangkat**,
   **Hanya cloud**. The source badge and stage line show exactly which
   path answered.

## Project structure

```
index.html                  Indonesian-first UI skeleton
src/main.js                 UI wiring, examples, history rendering
src/firebase.js             App init, App Check, Remote Config defaults
src/styles.css              Dark, mobile-first CSS (no framework)
src/history.js              localStorage history (last 10, on-device only)
src/ai/hybrid.js            Hybrid engine: models, routing, parsing
src/ai/prompts.js           Indonesian triage + deep prompts
src/ai/localChecks.js       Deterministic URL/keyword heuristics
BUILD-PLAN.md               Ordered remaining steps + checklist
ARCHITECTURE.md             Design doc: routing, criteria mapping, risks
```

## Privacy

- Stage 1 runs on-device when Nano is available: the pasted text never
  leaves the device.
- The cloud is used only for uncertain cases (or when the user picks
  cloud mode / taps deep analysis). The UI says so before and after.
- History is stored only in the browser's localStorage. No analytics,
  no accounts, no server of our own.

## License

Apache-2.0 — see [LICENSE](LICENSE).
