function area(box) {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

export function intersectionOverUnion(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = area(a) + area(b) - overlap;
  return union > 0 ? overlap / union : 0;
}

export function boxesOverlap(boxes = []) {
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      if (intersectionOverUnion(boxes[left], boxes[right]) > 0.45) return true;
    }
  }
  return false;
}

export function createOccupancy() {
  let shown = null;
  let pending = null;
  let hits = 0;
  const samples = [];
  return {
    push(count, now = Date.now(), overlap = false) {
      const value = Number.isInteger(count) && count >= 0 ? count : null;
      if (value == null) return { count: null, samples: samples.slice(), load: "", overlap: false };
      if (value === shown) {
        pending = null;
        hits = 0;
      } else if (value === pending) {
        hits += 1;
        if (hits >= 2) {
          shown = value;
          pending = null;
          hits = 0;
          samples.push({ t: now, count: value });
          if (samples.length > 12) samples.shift();
        }
      } else {
        pending = value;
        hits = 1;
      }
      const load = shown == null ? "" : shown === 0 ? "empty" : shown < 3 ? "light" : "busy";
      return { count: shown, samples: samples.slice(), load, overlap: Boolean(overlap) };
    },
  };
}
