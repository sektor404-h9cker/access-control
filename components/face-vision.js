import { classifyDistance } from "@/lib/face-distance";
import { isTensorFlowInfo } from "@/lib/tf-log";
import { SFACE_DEST, estimateSimilarity, headMeasure, inverseMap } from "@/lib/face-geometry";

export const POSES = ["center", "left", "right", "up", "down"];
export const ENROLL_STEPS = [
  { pose: "center", hint: "hintStraight" },
  { pose: "right", hint: "hintTurnRight", minYaw: 0.07 },
  { pose: "right", hint: "hintTurnRight", minYaw: 0.13 },
  { pose: "left", hint: "hintTurnLeft", maxYaw: -0.07 },
  { pose: "left", hint: "hintTurnLeft", maxYaw: -0.13 },
  { pose: "up", hint: "hintUp", maxPitch: -0.045 },
  { pose: "down", hint: "hintDown", minPitch: 0.045 },
  { pose: "center", hint: "hintStraight" },
  { pose: "center", hint: "hintStill" },
];
export const LANDMARKS = [1, 33, 263, 61, 291, 152];
export const HINT = {
  no_face: "hintNoFace",
  many: "hintMany",
  far: "hintFar",
  close: "hintClose",
  off: "hintPlace",
  dark: "hintDark",
  bright: "hintBright",
  blur: "hintBlur",
  left: "hintTurnLeft",
  right: "hintTurnRight",
  up: "hintUp",
  down: "hintDown",
  center: "hintStraight",
  straight: "hintStraight",
  ready: "hintReady",
  done: "hintDone",
};

function bounds(landmarks) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: Math.max(maxX - minX, 0), h: Math.max(maxY - minY, 0) };
}

function yawOf(landmarks) {
  const nose = landmarks[1];
  const left = landmarks[33];
  const right = landmarks[263];
  if (!nose || !left || !right) return 0;
  const span = Math.max(Math.abs(right.x - left.x), 0.001);
  return (nose.x - (left.x + right.x) / 2) / span;
}

function regionStats(canvas, box) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const x = Math.max(0, Math.floor(box.x * canvas.width));
  const y = Math.max(0, Math.floor(box.y * canvas.height));
  const w = Math.max(2, Math.min(canvas.width - x, Math.floor(box.w * canvas.width)));
  const h = Math.max(2, Math.min(canvas.height - y, Math.floor(box.h * canvas.height)));
  const { data } = ctx.getImageData(x, y, w, h);
  let sum = 0;
  let sharp = 0;
  let count = 0;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    gray[p] = value;
    sum += value;
  }
  for (let yy = 1; yy < h - 1; yy += 2) {
    for (let xx = 1; xx < w - 1; xx += 2) {
      const index = yy * w + xx;
      const value = gray[index - w] + gray[index + w] + gray[index - 1] + gray[index + 1] - 4 * gray[index];
      sharp += value * value;
      count += 1;
    }
  }
  return { brightness: sum / gray.length, sharpness: count ? sharp / count : 0 };
}

function scoreFace(landmarks, canvas, passage = false) {
  const box = bounds(landmarks);
  const points = LANDMARKS.map((index) => landmarks[index]).filter(Boolean);
  const aligned = alignmentPoints(landmarks);
  const area = box.w * box.h;
  const measure = headMeasure(landmarks);
  const yaw = measure?.yaw ?? yawOf(landmarks);
  const facePx = Math.round(Math.min(box.w * canvas.width, box.h * canvas.height));
  const centered = Math.abs(box.x + box.w / 2 - 0.5) <= 0.18 && Math.abs(box.y + box.h / 2 - 0.48) <= 0.24;
  const base = { box, yaw, pitch: measure?.pitch ?? 0, points, aligned, facePx, sharpness: 0 };
  if ((passage && facePx < 72) || (!passage && area < 0.045)) {
    return { code: "far", quality: "poor", ...base };
  }
  const stats = regionStats(canvas, box);
  const judged = classifyDistance({
    area,
    facePx,
    sharpness: stats.sharpness,
    brightness: stats.brightness,
    yaw,
    centered,
    passage,
  });
  return { ...base, ...judged, sharpness: stats.sharpness };
}

export function assess(result, canvas) {
  const faces = result?.faceLandmarks || [];
  if (faces.length === 0) return { code: "no_face", quality: "poor", box: null, points: [], aligned: null, faceCount: 0 };
  if (faces.length > 1) return { code: "many", quality: "poor", box: null, points: [], aligned: null, faceCount: faces.length };
  const scored = scoreFace(faces[0], canvas);
  if (scored.code === "off") return { ...scored, quality: "poor", faceCount: 1 };
  return { ...scored, faceCount: 1 };
}

export function assessAll(result, canvas, passage = false) {
  const faces = result?.faceLandmarks || [];
  if (!faces.length) return [{ code: "no_face", quality: "poor", box: null, points: [], aligned: null, facePx: 0 }];
  return faces.slice(0, 2).map((landmarks) => scoreFace(landmarks, canvas, passage));
}

function alignmentPoints(landmarks) {
  const at = (index) => landmarks[index];
  const leftEye = at(33);
  const rightEye = at(263);
  const nose = at(1);
  const leftMouth = at(61);
  const rightMouth = at(291);
  if (!leftEye || !rightEye || !nose || !leftMouth || !rightMouth) return null;
  const eyes = [leftEye, rightEye].sort((a, b) => a.x - b.x);
  const mouth = [leftMouth, rightMouth].sort((a, b) => a.x - b.x);
  return [eyes[0], eyes[1], nose, mouth[0], mouth[1]];
}

function sample(image, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return [0, 0, 0, 0];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const index = (px, py) => (py * width + px) * 4;
  const mix = (a, b, t) => a + (b - a) * t;
  const result = [0, 0, 0, 255];
  for (let channel = 0; channel < 3; channel += 1) {
    const top = mix(image[index(x0, y0) + channel], image[index(x0 + 1, y0) + channel], dx);
    const bottom = mix(image[index(x0, y0 + 1) + channel], image[index(x0 + 1, y0 + 1) + channel], dx);
    result[channel] = mix(top, bottom, dy);
  }
  return result;
}

export function warpFace(source, points) {
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 112;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const image = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const transform = estimateSimilarity(
    points.map((point) => [point.x * source.width, point.y * source.height]),
    SFACE_DEST,
  );
  const target = canvas.getContext("2d").createImageData(112, 112);
  for (let y = 0; y < 112; y += 1) {
    for (let x = 0; x < 112; x += 1) {
      const [sx, sy] = inverseMap(transform, x, y);
      const pixel = sample(image, source.width, source.height, sx, sy);
      const offset = (y * 112 + x) * 4;
      target.data[offset] = pixel[0];
      target.data[offset + 1] = pixel[1];
      target.data[offset + 2] = pixel[2];
      target.data[offset + 3] = 255;
    }
  }
  canvas.getContext("2d").putImageData(target, 0, 0);
  return canvas;
}

export function fillEnrollmentForm(data, result) {
  data.set("mode", result.mode);
  data.set("poses", result.poses.join(","));
  data.set("quality_note", result.quality);
  data.set("photo", new File([result.blob], "capture.jpg", { type: "image/jpeg" }));
  if (result.confirmReplace) data.set("confirm_replace", "1");
  const samples = result.samples || [];
  data.set("sample_count", String(samples.length));
  samples.forEach((sampleFrame, index) => {
    data.set(`sample_${index}`, new File([sampleFrame.blob], `sample-${index}.jpg`, { type: "image/jpeg" }));
    data.set(`points_${index}`, JSON.stringify(sampleFrame.points));
  });
}

export function viewBox(box, frameW, frameH, viewW, viewH) {
  if (!box || !frameW || !frameH || !viewW || !viewH) return null;
  const scale = Math.min(viewW / frameW, viewH / frameH);
  const width = frameW * scale;
  const height = frameH * scale;
  const offsetX = (viewW - width) / 2;
  const offsetY = (viewH - height) / 2;
  return {
    left: offsetX + box.x * width,
    top: offsetY + box.y * height,
    width: box.w * width,
    height: box.h * height,
  };
}

export function imageHash(canvas) {
  const small = document.createElement("canvas");
  small.width = 8;
  small.height = 8;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  const gray = [];
  let sum = 0;
  for (let index = 0; index < 64; index += 1) {
    const value = data[index * 4] * 0.299 + data[index * 4 + 1] * 0.587 + data[index * 4 + 2] * 0.114;
    gray.push(value);
    sum += value;
  }
  const average = sum / 64;
  let bits = 0n;
  gray.forEach((value, index) => {
    if (value >= average) bits |= 1n << BigInt(index);
  });
  return bits;
}

export function hashDistance(left, right) {
  let value = left ^ right;
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export function qualityLabel(dict, quality) {
  if (quality === "good") return dict.face.qualityGood;
  if (quality === "ok") return dict.face.qualityOk;
  return dict.face.qualityPoor;
}

function withoutDetectorNoise(method) {
  return (...args) => {
    const text = args.map((item) => String(item?.stack || item?.message || item)).join(" ");
    if (isTensorFlowInfo(text)) return;
    method.apply(console, args);
  };
}

export function detectFaces(landmarker, canvas, now) {
  const error = console.error;
  const warn = console.warn;
  const log = console.log;
  console.error = withoutDetectorNoise(error);
  console.warn = withoutDetectorNoise(warn);
  console.log = withoutDetectorNoise(log);
  try {
    return landmarker.detectForVideo(canvas, now);
  } finally {
    console.error = error;
    console.warn = warn;
    console.log = log;
  }
}

export async function createLandmarker() {
  const error = console.error;
  const warn = console.warn;
  const log = console.log;
  console.error = withoutDetectorNoise(error);
  console.warn = withoutDetectorNoise(warn);
  console.log = withoutDetectorNoise(log);
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const files = await vision.FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
    return await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: "/vendor/mediapipe/face_landmarker.task", delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceBlendshapes: false,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  } finally {
    console.error = error;
    console.warn = warn;
    console.log = log;
  }
}
