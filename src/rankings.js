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

export async function getRemoteRankings() {
  return [];
}

export async function submitRemoteRanking() {
  return { ok: false, reason: 'Remote ranking submission is not implemented yet.' };
}
