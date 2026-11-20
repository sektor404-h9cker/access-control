const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

function entry(key, limit) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.reset < now) return { count: 0, reset: now + WINDOW_MS, limit };
  return current;
}

export function tooManyAttempts(key, limit) {
  return entry(key, limit).count >= limit;
}

export function recordFailure(key, limit) {
  const current = entry(key, limit);
  current.count += 1;
  current.limit = limit;
  attempts.set(key, current);
}

export function clearFailures(key) {
  attempts.delete(key);
}

const hits = new Map();

export function tooManyHits(key, limit, windowMs) {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}
