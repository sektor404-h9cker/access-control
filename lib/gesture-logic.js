const FINGERS = [
  { tip: 8, pip: 6 },
  { tip: 12, pip: 10 },
  { tip: 16, pip: 14 },
  { tip: 20, pip: 18 },
];

export const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const MODEL = {
  Open_Palm: "open_palm",
  Thumb_Up: "thumb_up",
  Victory: "victory",
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extended(points, tip, pip) {
  return distance(points[tip], points[0]) > distance(points[pip], points[0]) * 1.15;
}

export function sampleHand({ index = false, middle = false, ring = false, pinky = false, thumb = false } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.75 }));
  points[0] = { x: 0.5, y: 0.86 };
  const specs = [
    { chain: [1, 2, 3, 4], x: 0.36, up: thumb },
    { chain: [5, 6, 7, 8], x: 0.44, up: index },
    { chain: [9, 10, 11, 12], x: 0.5, up: middle },
    { chain: [13, 14, 15, 16], x: 0.56, up: ring },
    { chain: [17, 18, 19, 20], x: 0.62, up: pinky },
  ];
  for (const spec of specs) {
    spec.chain.forEach((indexPoint, step) => {
      points[indexPoint] = spec.up
        ? { x: spec.x, y: 0.78 - step * 0.16 }
        : { x: spec.x, y: 0.72 + step * 0.04 };
    });
  }
  return points;
}

export function classifyLandmarks(points) {
  if (!Array.isArray(points) || points.length < 21 || points.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) {
    return { label: "unclear", score: 0 };
  }
  const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const height = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  if (Math.max(width, height) < 0.08) return { label: "unclear", score: 0 };
  const raised = FINGERS.map((finger) => extended(points, finger.tip, finger.pip));
  const thumbUp = extended(points, 4, 3) && points[4].y < points[2].y - 0.03 && points[4].y < points[0].y - 0.08;
  if (thumbUp && raised.every((item) => !item)) return { label: "thumb_up", score: 0.8 };
  if (raised[0] && raised[1] && !raised[2] && !raised[3]) return { label: "victory", score: 0.8 };
  if (raised.every(Boolean)) return { label: "open_palm", score: 0.8 };
  return { label: "unclear", score: 0 };
}

export function resolveHand({ landmarks, name = "", score = 0 } = {}) {
  const geometric = classifyLandmarks(landmarks);
  const model = MODEL[name] || "";
  if (model && score >= 0.65) return { label: model, score, source: "model" };
  if (geometric.label !== "unclear") return { label: geometric.label, score: geometric.score, source: "points" };
  if (model && score >= 0.5) return { label: model, score, source: "model" };
  return { label: "unclear", score: Number(score) || 0, source: "none" };
}

function waving(samples, amplitude) {
  if (samples.length < 5) return false;
  const values = samples.map((sample) => sample.x);
  if (Math.max(...values) - Math.min(...values) < amplitude * 2) return false;
  let reversals = 0;
  let direction = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (Math.abs(delta) < amplitude / 3) continue;
    const next = delta > 0 ? 1 : -1;
    if (direction && next !== direction) reversals += 1;
    direction = next;
  }
  return reversals >= 2;
}

export function createGestureTracker({ sensitivity = "medium", holdMs = 1800, cooldownMs = 4000 } = {}) {
  const need = sensitivity === "low" ? 4 : sensitivity === "high" ? 2 : 3;
  const amplitude = sensitivity === "low" ? 0.09 : sensitivity === "high" ? 0.035 : 0.05;
  const wrists = [];
  let stable = "";
  let streak = 0;
  let latched = "";
  let lastReaction = Number.NEGATIVE_INFINITY;
  let missing = 0;
  let assistSince = 0;
  let assistSent = false;

  return {
    observe(hands = [], now = Date.now()) {
      const list = Array.isArray(hands) ? hands.filter((hand) => hand?.landmarks?.length >= 21) : [];
      if (!list.length) {
        missing += 1;
        wrists.length = 0;
        stable = "";
        streak = 0;
        assistSince = 0;
        assistSent = false;
        if (missing >= 2) latched = "";
        return { label: "none", labels: [], reaction: "", confidence: 0, source: "none", hands: 0, assist: false };
      }
      missing = 0;
      const ranked = list.map((hand) => {
        const resolved = resolveHand(hand);
        const xs = hand.landmarks.map((point) => point.x);
        const ys = hand.landmarks.map((point) => point.y);
        return { ...resolved, wrist: hand.landmarks[0], size: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) };
      }).sort((a, b) => b.size - a.size);
      const primary = ranked[0];
      wrists.push({ x: primary.wrist.x, t: now });
      while (wrists.length && now - wrists[0].t > 900) wrists.shift();
      const motion = wrists.length ? Math.max(...wrists.map((item) => item.x)) - Math.min(...wrists.map((item) => item.x)) : 0;
      const wave = waving(wrists, amplitude);
      const raw = wave ? "wave" : primary.label;
      if (raw === stable) streak += 1;
      else {
        stable = raw;
        streak = 1;
      }
      const confirmed = raw === "wave" ? true : raw !== "unclear" && streak >= need;
      const label = confirmed ? raw : "unclear";
      let reaction = "";
      if (confirmed && label !== latched && now - lastReaction >= cooldownMs) {
        reaction = label;
        latched = label;
        lastReaction = now;
      }
      let assist = false;
      if (label === "open_palm" && motion < amplitude) {
        if (!assistSince) assistSince = now;
        if (!assistSent && now - assistSince >= holdMs) {
          assist = true;
          assistSent = true;
        }
      } else {
        assistSince = 0;
        assistSent = false;
      }
      return {
        label,
        labels: ranked.map((hand) => hand.label),
        reaction,
        confidence: primary.source === "model" ? primary.score : 0,
        source: wave ? "motion" : primary.source,
        hands: ranked.length,
        assist,
      };
    },
  };
}

export function gestureSoundAllowed(operatorBusy) {
  return !operatorBusy;
}
