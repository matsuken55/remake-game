export const RANKING_API_URL = 'https://script.google.com/macros/s/AKfycbxPW_cRfBrfc9t9MYXnit6e1M7oSp85bYvjEce-gGLmDOn2IHrHBbN9T28bzyCX-397GA/exec';
export const RANKING_MODES = new Set(['normal', 'easy']);

function normalizeMode(mode) {
  return RANKING_MODES.has(mode) ? mode : 'normal';
}

export function getLocalRankings(storage, key) {
  try {
    const rankings = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(rankings) ? rankings : [];
  } catch {
    return [];
  }
}

export function saveLocalRanking(storage, key, rankings) {
  storage.setItem(key, JSON.stringify(rankings));
  return rankings;
}

function normalizeRankings(payload) {
  const rankings = Array.isArray(payload) ? payload : payload?.rankings;
  if (!Array.isArray(rankings)) return [];
  return rankings
    .map(ranking => ({
      name: String(ranking.name || 'NO NAME').slice(0, 12),
      score: Number(ranking.score) || 0,
      date: ranking.date || ranking.timestamp || '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function jsonp(params, timeoutMs = 8000) {
  if (typeof document === 'undefined') return Promise.reject(new Error('JSONP requires document'));
  const callbackName = `rankingJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = new URL(RANKING_API_URL);
  Object.entries({ ...params, callback: callbackName }).forEach(([key, value]) => url.searchParams.set(key, value));

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      script.remove?.();
      try { delete globalThis[callbackName]; } catch { globalThis[callbackName] = undefined; }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('Ranking API timed out'));
    }, timeoutMs);

    globalThis[callbackName] = payload => {
      if (settled) return;
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      if (settled) return;
      cleanup();
      reject(new Error('Ranking API request failed'));
    };
    const parent = document.head || document.body;
    if (!parent?.appendChild) {
      cleanup();
      reject(new Error('JSONP requires document head or body'));
      return;
    }
    script.src = url.toString();
    parent.appendChild(script);
  });
}

export async function getRemoteRankings(mode) {
  const payload = await jsonp({ action: 'rankings', mode: normalizeMode(mode) });
  return normalizeRankings(payload);
}

export async function submitRemoteRanking(mode, name, score) {
  const payload = await jsonp({ action: 'submit', mode: normalizeMode(mode), name: String(name || 'NO NAME').slice(0, 12), score: String(Number(score) || 0) });
  if (payload?.ok === false || payload?.success === false) throw new Error(payload?.reason || 'Ranking API rejected submission');
  return payload || { ok: true };
}

export async function getDisplayedRankings(mode, localRankings = []) {
  try {
    return await getRemoteRankings(mode);
  } catch {
    return localRankings;
  }
}
