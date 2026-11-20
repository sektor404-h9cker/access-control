import fs from "node:fs";
import path from "node:path";
import { l2normalize } from "./face-match.js";

const WIDTH = 112;
const HEIGHT = 112;
let sessionPromise;

export function modelPath() {
  return path.join(process.cwd(), "models", "sface_2021dec.onnx");
}

export function modelReady() {
  return fs.existsSync(modelPath());
}

async function session() {
  if (!modelReady()) return null;
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-node");
      ort.env.logLevel = "error";
      return ort.InferenceSession.create(modelPath(), {
        executionProviders: ["cpu"],
        logSeverityLevel: 3,
      });
    })().catch((error) => {
      sessionPromise = undefined;
      throw error;
    });
  }
  return sessionPromise;
}

// OpenCV FaceRecognizerSF::feature uses blobFromImage(scale=1, swapRB=true):
// RGB planes, pixel values left in 0..255. Dividing by 255 collapses the embedding.
export function sfaceTensor(rgba) {
  const pixels = WIDTH * HEIGHT;
  const data = new Float32Array(3 * pixels);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    data[index] = rgba[offset];
    data[pixels + index] = rgba[offset + 1];
    data[pixels * 2 + index] = rgba[offset + 2];
  }
  return data;
}

export async function embedRgba(rgba, width, height) {
  if (width !== WIDTH || height !== HEIGHT || rgba.length < WIDTH * HEIGHT * 4) {
    return { ok: false, error: "samples_required" };
  }
  const runtime = await session();
  if (!runtime) return { ok: false, error: "model_missing" };
  const ort = await import("onnxruntime-node");
  const started = performance.now();
  const output = await runtime.run({
    data: new ort.Tensor("float32", sfaceTensor(rgba), [1, 3, WIDTH, HEIGHT]),
  });
  const values = output.fc1?.data;
  if (!values || values.length !== 128) return { ok: false, error: "model_missing" };
  return {
    ok: true,
    vector: l2normalize(values),
    ms: Math.max(0, Math.round(performance.now() - started)),
  };
}

export async function embedJpeg(bytes) {
  const started = performance.now();
  const jpeg = (await import("jpeg-js")).default;
  let decoded;
  try {
    decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  } catch {
    return { ok: false, error: "photo_type" };
  }
  const decodeMs = Math.max(0, Math.round(performance.now() - started));
  const embedded = await embedRgba(decoded.data, decoded.width, decoded.height);
  if (!embedded.ok) return embedded;
  return { ...embedded, decodeMs };
}
