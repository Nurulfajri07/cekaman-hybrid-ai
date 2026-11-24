// Deterministic, dependency-free checks that run instantly in the browser
// BEFORE any AI call. They never decide the verdict on their own — they
// produce signals that are (a) shown in the UI and (b) fed into the AI
// prompts as context. This makes the app useful even when AI is slow and
// gives the demo deterministic behaviour.
//
// These are heuristics, not a blocklist: a signal means "look closer",
// never "proven scam".

const URL_RE = /(https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+)/gi;

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  's.id',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
]);

const SUSPICIOUS_TLDS = new Set([
  'xyz',
  'top',
  'click',
  'buzz',
  'fit',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'cam',
  'rest',
  'quest',
  'gift',
]);

// Brand name -> official domain. Used only to flag lookalikes, e.g.
// "binance-airdrop-claim.com" contains "binance" but is not binance.com.
const BRANDS = {
  binance: 'binance.com',
  indodax: 'indodax.com',
  tokocrypto: 'tokocrypto.com',
  metamask: 'metamask.io',
  trustwallet: 'trustwallet.com',
  telegram: 'telegram.org',
  whatsapp: 'whatsapp.com',
  coinbase: 'coinbase.com',
  bybit: 'bybit.com',
  okx: 'okx.com',
};

const KEYWORDS = [
  [/seed phrase/i, 'Menyebut "seed phrase"'],
  [/private key/i, 'Menyebut "private key"'],
  [/(12|24)\s*kata/i, 'Menyebut frasa 12/24 kata'],
  [/connect wallet/i, 'Meminta connect wallet'],
  [/hubungkan dompet/i, 'Meminta menghubungkan dompet'],
  [/klaim.*(sekarang|gratis|cepat)/i, 'Mendesak untuk klaim'],
  [/menang|hadiah|giveaway|airdrop gratis/i, 'Menjanjikan hadiah/airdrop'],
  [/verifikasi dompet/i, 'Meminta verifikasi dompet'],
  [/(segera|1 jam|terbatas|sebelum.*habis)/i, 'Ada desakan waktu'],
];

function hostnameOf(raw) {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Returns an array of human-readable signal strings (Indonesian).
export function localChecks(text) {
  const signals = [];

  const urls = text.match(URL_RE) || [];
  for (const raw of urls) {
    const host = hostnameOf(raw);
    if (!host) continue;

    if (host.includes('xn--')) {
      signals.push(`Domain ${host} memakai punycode (huruf mirip disamarkan).`);
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      signals.push(`Link memakai alamat IP langsung (${host}), bukan domain.`);
    }
    if (SHORTENERS.has(host.replace(/^www\./, ''))) {
      signals.push(`Link memakai shortener (${host}) — tujuan asli disembunyikan.`);
    }
    const tld = host.split('.').pop();
    if (SUSPICIOUS_TLDS.has(tld)) {
      signals.push(`Domain memakai TLD yang sering dipakai penipu (.${tld}).`);
    }
    for (const [brand, official] of Object.entries(BRANDS)) {
      if (
        host.includes(brand) &&
        host !== official &&
        !host.endsWith(`.${official}`)
      ) {
        signals.push(
          `Domain mengandung nama "${brand}" tapi bukan domain resmi (${official}).`,
        );
        break;
      }
    }
    // Subdomain trick: binance.com.evil.com — the real domain is the tail.
    const parts = host.split('.');
    if (parts.length > 2) {
      for (const [brand, official] of Object.entries(BRANDS)) {
        if (parts.slice(0, -2).join('.').includes(brand)) {
          signals.push(
            `Nama "${brand}" hanya ada di subdomain — domain sebenarnya adalah ${parts.slice(-2).join('.')}.`,
          );
          break;
        }
      }
    }
  }

  for (const [re, label] of KEYWORDS) {
    if (re.test(text)) signals.push(`${label}.`);
  }

  return [...new Set(signals)];
}
