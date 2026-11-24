// CekAman UI wiring.

import { getAIInstance, initFirebase, isFirebaseConfigured } from './firebase.js';
import {
  analyzeScam,
  checkNanoAvailability,
  ensureDeviceModel,
} from './ai/hybrid.js';
import { addHistory, loadHistory } from './history.js';

const $ = (id) => document.getElementById(id);

const EXAMPLES = {
  scam: 'Selamat! Kamu menang 500 USDT dari Binance Giveaway! Klaim hadiahmu sekarang di binance-airdrop-claim.com sebelum 1 jam, hubungkan dompet dan verifikasi seed phrase kamu.',
  phishing:
    'Perhatian: akun Binance kamu akan diblokir. Verifikasi segera di binance-login-security.xyz atau hubungi support via Telegram @binance_helpdesk99.',
  legit:
    'Pengumuman resmi dari Binance: maintenance terjadwal pada 20 November 2026 pukul 02.00-04.00 UTC. Cek detailnya di binance.com/en/blog.',
};

const VERDICT_LABEL = {
  AMAN: '✅ AMAN',
  MERAGUKAN: '⚠️ MERAGUKAN',
  BERBAHAYA: '🚨 BERBAHAYA',
};

const VERDICT_CLASS = { AMAN: 'safe', MERAGUKAN: 'warn', BERBAHAYA: 'danger' };

let lastResult = null;
let lastInput = '';

function setProgress(msg) {
  const el = $('progress');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

function renderHistory() {
  const list = loadHistory();
  $('history').innerHTML = list.length
    ? list
        .map(
          (h) =>
            `<li>${VERDICT_LABEL[h.verdict] || h.verdict} (skor ${h.score}) — ${escapeHtml(h.snippet)} <small>· ${new Date(h.time).toLocaleString('id-ID')}</small></li>`,
        )
        .join('')
    : '<li>Belum ada pemeriksaan.</li>';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderResult(result, input) {
  lastResult = result;
  lastInput = input;
  const r = $('result');
  r.hidden = false;

  const badge = $('verdict-badge');
  badge.textContent = VERDICT_LABEL[result.verdict] || result.verdict;
  badge.className = `verdict-badge ${VERDICT_CLASS[result.verdict] || 'warn'}`;

  $('source-badge').textContent =
    result.source === 'on_device'
      ? '📱 Dianalisis di perangkat (Gemini Nano)'
      : '☁️ Dianalisis di cloud (Gemini)';

  $('score-num').textContent = `${result.score}/100`;
  const fill = $('score-fill');
  fill.style.width = `${result.score}%`;
  fill.style.background =
    result.score >= 80 ? '#ef4444' : result.score >= 40 ? '#f59e0b' : '#22c55e';

  $('reasons').innerHTML = result.reasons
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join('');
  const allSignals = [...new Set([...(result.signals || []), ...result.localSignals])];
  $('signals').innerHTML = allSignals.length
    ? allSignals.map((x) => `<li>${escapeHtml(x)}</li>`).join('')
    : '<li>Tidak ada sinyal mencurigakan yang terdeteksi.</li>';

  const stageText = result.stages
    .map(
      (s) =>
        `${s.name === 'triage' ? 'Pemeriksaan cepat' : 'Analisis mendalam'}: ${s.verdict} (skor ${s.score}) via ${s.source === 'on_device' ? 'perangkat' : 'cloud'}`,
    )
    .join(' → ');
  $('stage-info').textContent = stageText;

  // Offer the cloud deep-check when Stage 1 was the only stage and the
  // result came from the device.
  $('deep-btn').hidden = result.stages.length > 1 || result.source !== 'on_device';
}

async function runCheck({ forceDeep = false } = {}) {
  const input = $('input-text').value.trim();
  if (!input) {
    setProgress('Tempel dulu link atau pesannya.');
    return;
  }
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'auto';
  const btn = $('check-btn');
  btn.disabled = true;

  try {
    // User activation: initialise the on-device model here (required by
    // the Firebase docs) and show download progress — but ONLY when the
    // device path can actually be used. Calling initializeDeviceModel on
    // every check in cloud mode (or when Nano is absent) made each check
    // take 45–90s while the SDK waited on a model that never comes.
    // PREFER_ON_DEVICE falls back to cloud on its own when Nano is absent.
    if (mode !== 'cloud') {
      const nano = await checkNanoAvailability();
      if (nano === 'available' || nano === 'downloadable' || nano === 'downloading') {
        setProgress('Menyiapkan model di perangkat…');
        await ensureDeviceModel((pct) =>
          setProgress(`Mengunduh model di perangkat… ${pct}%`),
        );
      }
    }

    setProgress('Menganalisis…');
    const result = await analyzeScam(input, {
      mode,
      forceDeep,
      onStage: (stage) =>
        setProgress(
          stage === 'deep'
            ? 'Meragukan — meneruskan ke analisis mendalam di cloud…'
            : mode === 'cloud'
              ? 'Menganalisis di cloud…'
              : 'Menganalisis…',
        ),
    });
    setProgress('');
    renderResult(result, input);
    renderHistory(
      addHistory({
        verdict: result.verdict,
        score: result.score,
        source: result.source,
        snippet: input.slice(0, 80),
      }),
    );
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    setProgress(
      `Gagal menganalisis: ${err.message || err}. Coba mode "Hanya cloud" atau periksa konfigurasi Firebase.`,
    );
  } finally {
    btn.disabled = false;
  }
}

async function refreshNanoStatus() {
  const el = $('nano-status');
  const status = await checkNanoAvailability();
  const labels = {
    available: '✅ Model di perangkat tersedia (Gemini Nano)',
    downloading: '⬇️ Model di perangkat sedang diunduh…',
    downloadable: '⬇️ Model di perangkat bisa diunduh (klik Periksa untuk mulai)',
    unavailable: '☁️ Model di perangkat tidak tersedia — akan memakai cloud',
    unknown: '❓ Status model di perangkat tidak diketahui (bukan Chrome desktop?)',
  };
  el.textContent = labels[status] || labels.unknown;
}

function init() {
  if (!isFirebaseConfigured()) {
    $('setup-warning').hidden = false;
    $('check-btn').disabled = true;
  } else {
    initFirebase();
  }

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('input-text').value = EXAMPLES[chip.dataset.example] || '';
    });
  });

  $('check-btn').addEventListener('click', () => runCheck());
  $('deep-btn').addEventListener('click', () => runCheck({ forceDeep: true }));
  $('copy-btn').addEventListener('click', async () => {
    if (!lastResult) return;
    const text = `CekAman — ${lastResult.verdict} (skor ${lastResult.score}/100, via ${lastResult.source === 'on_device' ? 'perangkat' : 'cloud'})\nAlasan: ${lastResult.reasons.join('; ')}\nTeks: ${lastInput.slice(0, 200)}`;
    try {
      await navigator.clipboard.writeText(text);
      $('copy-btn').textContent = 'Disalin ✓';
      setTimeout(() => ($('copy-btn').textContent = 'Salin hasil'), 1500);
    } catch {
      $('copy-btn').textContent = 'Gagal menyalin';
    }
  });

  renderHistory();
  refreshNanoStatus();
}

init();
