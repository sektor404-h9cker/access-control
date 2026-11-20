// OpenCV samples/dnn/face_detect.cpp publishes 0.363 as the cosine threshold
// for FaceRecognizerSF. The margin is the separation this product requires
// before a second enrolled person makes the result ambiguous.
export const ACCEPT_COSINE = 0.363;
export const AMBIGUITY_MARGIN = 0.06;
export const MODEL_ID = "sface-2021dec-b255";

export function cosine(left, right) {
  if (!left || !right || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const scale = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (!scale) return 0;
  return dot / scale;
}

export function l2normalize(vector) {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) norm += vector[index] * vector[index];
  norm = Math.sqrt(norm);
  const next = new Float32Array(vector.length);
  if (!norm) return next;
  for (let index = 0; index < vector.length; index += 1) next[index] = vector[index] / norm;
  return next;
}

export function decideMatch(scores) {
  const ranked = [...scores].sort((left, right) => right.cosine - left.cosine);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.cosine < ACCEPT_COSINE) {
    return { outcome: "unknown", employeeId: null, score: best ? roundScore(best.cosine) : null, secondScore: second ? roundScore(second.cosine) : null };
  }
  const margin = second ? best.cosine - second.cosine : Infinity;
  if (margin < AMBIGUITY_MARGIN) {
    return {
      outcome: "ambiguous",
      employeeId: best.employeeId,
      score: roundScore(best.cosine),
      secondScore: second ? roundScore(second.cosine) : null,
    };
  }
  return {
    outcome: "matched",
    employeeId: best.employeeId,
    score: roundScore(best.cosine),
    secondScore: second ? roundScore(second.cosine) : null,
  };
}

export function livenessOf({ motion = 0, blink = false } = {}) {
  // A still photograph does not move. This is not a certified anti-spoof test:
  // a video on a screen can still pass. Automatic attendance stays off until
  // the owner explicitly enables the pilot switch.
  if (blink || Number(motion) >= 0.012) return "motion";
  return "static";
}

function roundScore(value) {
  return Math.round(value * 10000) / 10000;
}
