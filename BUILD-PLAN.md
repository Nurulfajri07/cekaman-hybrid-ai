# BUILD-PLAN — CekAman for #BuildHybridAI 2026

Deadline: **Monday 30 Nov 2026, 2:00 PM PT = Tuesday 1 Dec 2026, 05:00 WIB**.
Submit on Devpost before then — aim to finish **29 Nov** to leave a buffer.

## Status

- [x] Research: Firebase AI Logic hybrid docs + Devpost requirements read.
- [x] Architecture designed (see ARCHITECTURE.md).
- [x] Scaffold written: Vite + `firebase@13.4.0`, hybrid engine, UI skeleton.
- [x] `npm install` + `vite build` pass.
- [x] API surface verified against the installed SDK — one real catch
      fixed: `getGenerativeModel` takes `ModelParams | HybridParams`
      (union), so `model` + `mode` can NOT be combined at the top level.
      The cloud model name now lives inside `inCloudParams: { model, ... }`.
      The exact verdict `Schema` was also executed in Node and serialises
      correctly.
- [ ] Everything below.

## Phase 1 — Firebase project (DONE 2026-11-20 ~07:22 WIB)

1. [x] Firebase project created: **CekAman, ID cekaman-c39d9**, Spark plan (free, $0/mo), no Google Analytics, no billing. Console: https://console.firebase.google.com/project/cekaman-c39d9/overview
2. [x] AI Logic enabled with **Gemini Developer API** (free, no billing). App Check enforcement ON ("Firebase AI Logic — Basic - Enforced").
3. [x] Web app registered ("CekAman Web"); config copied into `.env` (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
4. [x] App Check debug token registered in console ("Local development"); value saved in `.env` as VITE_APPCHECK_DEBUG_TOKEN; `src/firebase.js` updated to use it when set.
5. [ ] (Optional) Publish remaining Remote Config defaults (escalate_min_score 40, escalate_max_score 79, danger_min_score 80, safe_max_score 20, prompt_version v1) — only `cloud_model` = gemini-3.8-flash is published (Version 1); the app already falls back to in-code defaults for the rest, so this is polish, not a blocker.
6. [x] Cloud model `gemini-3.8-flash` verified current (Firebase docs, updated 2026-11-18; featured stable general-use model, billing not required).

## Phase 2 — Local dev + on-device test (tested via deployed test URL 2026-11-20 ~07:26–07:40 WIB; Nano NOT available in cloud browser)

7. [x] App deployed to test URL https://dist-nine-ecru-72.vercel.app (Vercel static dist; final hosting per plan is Firebase Hosting) and renders correctly (title, chips, 3-mode toggle, banner, footer).
8. [ ] Nano download test — BLOCKED by environment: cloud browser cannot open chrome://flags or DevTools console, so the flag + `LanguageModel.create()` could not be attempted there. App's own detection says Nano absent ("Model di perangkat tidak tersedia"). The on-device badge shot for the demo video needs a real Chrome Desktop 139+ with the flag + model download — unresolved, flag for Phase 5.
9. [x] Sample chips tested via cloud: airdrop scam BERBAHAYA 100/100, fake Binance link BERBAHAYA 98/100, official announcement AMAN 5/100 (after one 503 retry) — verdict cards, Indonesian reasons, signals, cloud badges all correct. Stage lines triage-only for decisive verdicts.
10. [x] Escalation verified: garbage input triage MERAGUKAN 40 → Stage 2 deep MERAGUKAN 30; ambiguous J&T delivery notice triage BERBAHAYA 95 (no Stage 2 needed — decisive). Badge-flip on-device→cloud could NOT be observed (Nano absent).
11. [x] "Hanya di perangkat" with Nano absent: immediate clear error ("Local LanguageModel API not available…"), no hang. Previous verdict stays visible.
12. [ ] Nano download progress UI — not observable without Nano; code path exists (ensureDeviceModel onProgress).

## Phase 3 — Cloud fallback + robustness (tested 2026-11-20 ~07:26–07:40 WIB)

13. [x] Cloud fallback works end-to-end (5/6 attempts returned verdicts). BUT slow: typically 45–90 s per check; one 503 "Deadline expired" after ~4 min (retry in cloud-only mode succeeded). Root cause found: `runCheck` called `initializeDeviceModel()` on EVERY check even when Nano is absent/cloud mode → SDK waited on a model that never comes. FIXED 2026-11-20 ~07:45 WIB: device init now skipped in cloud mode and when `checkNanoAvailability()` says unavailable/unknown; status text fixed (was "Menganalisis di perangkat…" even in cloud mode); one automatic retry added on transient 503/500/fetch errors (hybrid.js `withRetry`). Fix deployed to the test URL; **RETEST 07:42–07:53 WIB: fix did NOT make checks fast — AUTO airdrop ~70s, AUTO official ~75s (repeat ~70s), cloud-only Binance link ~160s. Verdicts all correct, cloud wording confirmed correct.** So the latency is in the cloud generateContent call itself, not the device init. VM direct curl to generativelanguage.googleapis.com hung (http=000, ~600s) — VM egress to Google APIs degraded; browser path works but slow. NEXT EXPERIMENT: switch Remote Config cloud_model from gemini-3.8-flash to gemini-2.5-flash (known fast model) and retest timing; **DONE 08:15–08:16 WIB — browser task published Remote Config Version 2: cloud_model = gemini-3.5-flash-lite (NOT 2.5-flash: Firebase docs updated 2026-11-18 say Gemini 2.5 models are deprecated/shut down 20 Oct 2026; 3.5-flash-lite is the official replacement, featured "ULTRA FAST", stable general-use, no shutdown date).** In-code default in src/firebase.js also switched to gemini-3.5-flash-lite + redeployed, so the offline fallback uses the fast model too. **DECISIVE RETEST 08:32–08:36 WIB (after the 1h Remote Config cache expired, hard refresh): still SLOW — AUTO airdrop ~45–50s, cloud-only Binance link ~105–115s; verdicts correct. CONCLUSION: the model switch did NOT fix it — latency is in the free-tier cloud call path itself (Firebase AI Logic + Gemini Developer API from this environment), not the model choice. ACCEPTED as a known limitation: cloud checks take ~1–2 min; on-device path (where Nano exists) is fast and is the hackathon's core differentiator. No further latency chasing; focus moves to repo/hosting/video/submission.**
14. [ ] Offline test — not yet run (browser task cannot easily toggle offline); auto mode is expected to fall back gracefully (Remote Config + cloud fetch fail → defaults + error message). Retest later if time allows.
15. [x] Garbage / very long (~5,000 chars) / empty input: no crash. Empty → inline "Tempel dulu link atau pesannya." Garbage → MERAGUKAN 30. Long → AMAN 0. History recorded.
16. [x] No API key/token in visible page text (verdict cards, signals, history, error messages all clean). Limitation: browser console could not be inspected (no DevTools access in the cloud browser) — console half of the check is unverified.

## Phase 4 — Polish + deploy (~1 day)

17. [ ] UI polish pass on a phone viewport (Nurul's Redmi): textarea,
      buttons, verdict card all readable.
18. [ ] `npm run build`, deploy to Firebase Hosting, smoke-test the
      hosted URL end-to-end (both paths).
19. [ ] Decide on Firestore/Auth: **out of scope for v1** (see
      ARCHITECTURE.md). Do not add them last-minute.
20. [ ] Write the repo README "value proposition" section (already in
      README.md — review it once more).

## Phase 5 — Demo video, max 3 min (~half day)

21. [ ] Script (60–90 s is enough): problem (1 line) → paste a scam
      message → on-device verdict with badge → ambiguous case escalates
      to cloud → mode toggle → close with the hosted URL.
22. [ ] Record the screen in Chrome WITH Nano working (badge must say
      "di perangkat" on camera — that is the money shot).
23. [ ] Upload to YouTube (public or unlisted). UI is Indonesian, so add
      **English subtitles** (Devpost requires English or EN subtitles).
24. [ ] Keep it under 3:00 — only the first 3 minutes are judged.

## Phase 6 — Repo + Devpost submission (~half day)

25. [ ] Create the public GitHub repo under **Nurulfajri07**
      (e.g. `cekaman-hybrid-ai`), push this project, confirm the
      Apache-2.0 LICENSE shows in the About section.
26. [ ] Devpost submission text (ALL in English): what it does, how
      Firebase AI Logic hybrid inference is used, features, value
      proposition, hosted URL, repo URL, video URL.
27. [ ] Select platform **Web (Chrome)**.
28. [ ] Submit before **1 Dec 2026, 05:00 WIB**. Verify the submission
      page shows all four items: app URL, repo, video, description.

## Needs Nurul (checklist)

- [x] Devpost registration answers — DONE 2026-11-18 ~23:37 WIB: registration completed, confirmed on Participants page (solo; no Google dev account; AI experience Medium; Firebase AI Logic None; goals Learning + Competition; platform Web; "who told you" blank). (Koreksi 2026-11-20: baris ini sebelumnya tertulis pending — pendaftarannya sudah selesai.)
- [ ] Firebase project under her Google account (Phase 1) — or a browser
      session where she is logged in so the project can be created.
- [ ] GitHub repo created under Nurulfajri07 (Phase 6).
- [ ] Demo video: screen recording is done by the agent; she reviews the
      final cut before upload (her voice is NOT needed — captioned
      screencast is fine).
- [ ] Final go-ahead on the Devpost submission text (English).

## Risks carried from research (do not forget)

- **Gemini Nano availability**: needs Chrome Desktop 139+ AND the flag AND
  a multi-hundred-MB model download. Judges on other browsers see cloud
  fallback only — the app must demo well in that mode too.
- **Model names move fast**: `gemini-3.8-flash` was current on 2026-11-18.
  Re-check the models page before submitting; the cloud model is one
  Remote Config value, so a rename is a 1-minute fix.
- **Hybrid API is Public Preview**: pin `firebase@13.4.0` exactly; do not
  upgrade mid-build without re-running the API checks in Phase 2.
- **Free-tier quotas**: Gemini Developer API free tier has rate limits;
  demo traffic is tiny, but do not run a load test against it.
- **App Check debug tokens**: each machine/browser gets its own token;
  the README tells judges how to register theirs.
