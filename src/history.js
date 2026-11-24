// Check history kept ONLY on the user's own device (localStorage).
// Nothing leaves the browser. Last 10 entries.

const KEY = 'cekaman:history';
const MAX = 10;

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function addHistory(entry) {
  const list = loadHistory();
  list.unshift({ id: Date.now(), time: new Date().toISOString(), ...entry });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Storage full/blocked — history is a nice-to-have, ignore.
  }
  return list.slice(0, MAX);
}
