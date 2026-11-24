// Prompts for the scam checker (Indonesian). Two tiers:
//  - TRIAGE: short, for the on-device model (Gemini Nano is small — keep it
//    tight, one job, JSON only).
//  - DEEP: richer, for the cloud model when the triage is uncertain.
// Both must answer ONLY with JSON matching the verdict schema (see
// src/ai/hybrid.js). The model must never guess: unsure => MERAGUKAN.

export function buildTriagePrompt(input, localSignals) {
  const signals =
    localSignals.length > 0
      ? `\nSinyal otomatis dari pemeriksa lokal:\n${localSignals
          .map((s) => `- ${s}`)
          .join('\n')}`
      : '\nTidak ada sinyal otomatis yang ditemukan.';
  return `Kamu adalah analis keamanan crypto. Nilai teks/link berikut: apakah ini penipuan (phishing, airdrop palsu, wallet drainer, support palsu) atau aman?

Aturan:
- Jawab HANYA dengan JSON sesuai skema (verdict, score 0-100, confidence, reasons, signals).
- verdict: AMAN jika jelas resmi/aman, BERBAHAYA jika jelas penipuan, MERAGUKAN jika tidak yakin.
- score: 0 = aman, 100 = sangat berbahaya. Beri skor tengah (40-79) kalau ragu.
- reasons: 1-3 alasan singkat dalam Bahasa Indonesia.
- Kalau tidak yakin, pilih MERAGUKAN dengan confidence "rendah" — jangan menebak.
${signals}

Teks yang dinilai:
"""${input}"""`;
}

export function buildDeepPrompt(input, localSignals, triage) {
  const signals =
    localSignals.length > 0
      ? `\nSinyal otomatis dari pemeriksa lokal:\n${localSignals
          .map((s) => `- ${s}`)
          .join('\n')}`
      : '\nTidak ada sinyal otomatis yang ditemukan.';
  return `Kamu adalah analis keamanan crypto senior. Lakukan analisis MENDALAM terhadap teks/link berikut. Pemeriksaan cepat di perangkat menghasilkan verdict ${triage.verdict} (skor ${triage.score}) dan belum meyakinkan, jadi kamu yang memutuskan.

Periksa pola-pola ini:
1. Domain tiruan: nama brand terkenal (Binance, Indodax, MetaMask, Trust Wallet, Telegram) tapi domainnya bukan domain resmi, atau ada subdomain menipu (contoh: binance.com.evil.com).
2. Janji hadiah/airdrop: "menang", "klaim gratis", "giveaway", jumlah besar tanpa syarat jelas.
3. Meminta seed phrase, private key, atau 12 kata rahasia — ini SELALU penipuan.
4. Desakan waktu: "segera", "1 jam lagi", "kuota terbatas".
5. Meminta connect wallet ke situs tidak dikenal (risiko wallet drainer).
6. Shortener link (bit.ly, s.id, t.co) yang menyembunyikan tujuan asli.
7. Bahasa tidak profesional, typo aneh, atau akun support palsu.

Aturan:
- Jawab HANYA dengan JSON sesuai skema (verdict, score 0-100, confidence, reasons, signals).
- verdict: AMAN / MERAGUKAN / BERBAHAYA. score: 0 = aman, 100 = sangat berbahaya.
- reasons: 2-4 alasan singkat dalam Bahasa Indonesia, sebutkan bukti spesifik dari teks.
- Kalau bukti tidak cukup, pilih MERAGUKAN — jangan menebak.
${signals}

Teks yang dinilai:
"""${input}"""`;
}
