# ARCHITECTURE — CekAman

## Problem and audience

Crypto phishing in Indonesia targets exactly people like Nurul: airdrop
farmers who click dozens of unfamiliar links a day. The scams are
well-known patterns (fake airdrops, lookalike domains, "verify your
wallet", seed-phrase theft, wallet drainers) — but spotting them takes
seconds of attention per link, and one miss can drain a wallet.

CekAman gives a fast second opinion in Indonesian, in the browser, with
privacy by default: the text is checked on-device first and only goes to
the cloud when the local check is unsure.

## Product flow

```
paste link/message
      │
      ▼
deterministic local checks (instant, no AI)
  punycode · IP hosts · shorteners · suspicious TLDs
  brand-lookalike domains · scam keywords
      │
      ▼
Stage 1 — TRIAGE (hybrid model, PREFER_ON_DEVICE)
  Gemini Nano on-device if available,
  else automatic cloud fallback (same call, same JSON schema)
      │
      ├─ decisive (BERBAHAYA ≥80, or AMAN ≤20, high confidence)
      │     → show verdict, never touched the cloud
      │
      └─ uncertain (MERAGUKAN, score 40–79, low confidence)
            → Stage 2 — DEEP (cloud-only model, richer prompt)
                  → final verdict
      │
      ▼
verdict card: badge + score bar + reasons + signals
+ source badge (📱 perangkat / ☁️ cloud) + stage line
+ history (localStorage) + copy result
```

## Why this routing (the architectural rationale)

Most hybrid demos just call the SDK and let it pick a path. CekAman adds
a **decision layer on top of the SDK**:

| Decision | Rationale |
|---|---|
| Nano does triage, not the final word | Nano is small and fast but weaker at reasoning. A short, constrained triage prompt (JSON-only, 1–3 reasons) plays to its strengths; the cloud handles the hard cases. |
| Escalate on uncertainty, not on every request | Keeps most checks private, free, and instant; spends cloud inference only where it changes the answer. |
| Same JSON schema on both paths | `inCloudParams.responseSchema` + `onDeviceParams.responseConstraint` use the identical `verdictSchema`, so the UI never branches on the path — only the source badge changes. |
| Local heuristics feed the prompts | Deterministic signals (e.g. "domain contains 'binance' but is not binance.com") are cheap facts the small model might miss. They are context, never the verdict. |
| User-visible source badge | Judges (and users) can *see* the hybrid working: the badge and stage line report `response.inferenceSource` for every check. |
| Mode toggle (auto / device-only / cloud-only) | Makes the routing explorable and gives privacy-conscious users a real choice. |

## Firebase products used — and why

| Product | Used for | Why it earns its place |
|---|---|---|
| **AI Logic** (required) | All inference, hybrid routing, structured output | The core of the hackathon. |
| **App Check** (required) | Protecting the Gemini API from abuse | Auto-enforced by the AI Logic setup; debug tokens for local/judges. |
| **Remote Config** | Cloud model name, escalation thresholds, prompt version | Model names change fast; thresholds are tuning, not code. Lets us fix a renamed model without redeploying. |
| Firestore | — (not in v1) | Deliberately out: history lives in localStorage. A shared community-reports feed is a Phase 2 idea, not needed for the demo. |
| Authentication | — (not in v1) | No accounts needed. Anonymous auth would only be needed if Firestore sharing is added. |

Scope discipline: three Firebase products, each with a real job. Adding
Firestore/Auth "because the hackathon lists them" would add setup,
rules, and failure modes with zero demo value.

## Data flow and privacy

- Stage 1 on-device: pasted text never leaves the device.
- Stage 2 cloud: text is sent to Gemini only for uncertain cases, or
  when the user explicitly picks cloud/deep analysis. The UI states this
  before the check and the source badge states it after.
- No user accounts, no analytics, no server of our own. History is
  localStorage-only. The Firebase config in `.env` holds public client
  identifiers, not secrets.

## Judging criteria — how this maps

- **Technological Implementation**: hybrid SDK used properly — mode
  selection, `initializeDeviceModel()` on user activation with progress,
  `inferenceSource` surfaced, structured output on both paths, App Check
  enforced, Remote Config driving the model name and thresholds.
- **Design**: a complete product, not a demo stub — paste → verdict →
  reasons → actions → history, mobile-first, Indonesian-first UI, three
  sample cases, three analysis modes.
- **Potential Impact**: crypto phishing is a real, costly problem for a
  real audience (Indonesian airdrop/crypto users); the tool is free and
  works offline for the common case.
- **Quality of the Idea**: two-tier routing (fast on-device triage +
  uncertainty-triggered cloud escalation) is a non-obvious use of hybrid
  inference, with a visible rationale — most entries will just call the
  SDK once.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Gemini Nano unavailable (wrong browser, no flag, no download) | SDK falls back to cloud automatically; app demos fully in cloud mode; README gives exact Chrome setup steps. |
| Model names change before submission | Cloud model is one Remote Config value; re-check the models page in BUILD-PLAN Phase 1 step 6. |
| Hybrid API is Public Preview | `firebase` pinned to exactly 13.4.0; API surface re-verified against the installed SDK (see BUILD-PLAN status). |
| Nano returns malformed JSON | Defensive parser: extract first `{...}`, validate fields, fall back to MERAGUKAN / score 50 with an honest message. |
| Free-tier quota | Demo traffic is tiny; no load testing; thresholds keep most checks on-device. |
| App Check blocks judges | Debug tokens accepted in submissions; README documents registration step by step. |

## What is deliberately NOT in v1

- Screenshot/image input (Nano supports JPEG/PNG, but text covers the
  scam patterns and keeps scope tight).
- Firestore community feed / Auth (Phase 2 idea).
- Multi-turn chat (not supported on-device; single-turn verdicts only).
- Any server-side component (no Cloud Functions — the client SDK is the
  whole backend, which is the point of the hybrid story).
