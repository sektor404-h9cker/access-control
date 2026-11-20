import { playTone } from "./tones";

const recent = new Map();
const held = [];
let context = null;
let queue = [];
let playing = false;
let current = null;
let stopped = true;
let muted = false;
let lastProof = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function browserContext() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  if (!context || context.state === "closed") context = new Context();
  return context;
}

export function audioMuted() {
  return muted;
}

export function setAudioMuted(next) {
  muted = Boolean(next);
  if (muted) {
    queue = [];
    held.length = 0;
    window.speechSynthesis?.cancel();
  }
}

export function playbackProof() {
  return lastProof;
}

function openOutput() {
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 0;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.02);
}

export function primeAudio({ open = false } = {}) {
  const audio = browserContext();
  if (!audio) return Promise.resolve("missing");
  stopped = false;
  const resumed = audio.resume();
  if (open) openOutput();
  return resumed.then(() => {
    const state = audio.state === "running" ? "running" : "blocked";
    if (state === "running") flushHeld();
    return state;
  }).catch(() => "blocked");
}

export function audioState() {
  if (!context) return "idle";
  return context.state === "running" && !stopped ? "running" : "blocked";
}

function measure(analyser, started, tone) {
  const bins = new Uint8Array(analyser.fftSize);
  let peak = 0;
  const begun = performance.now();
  return new Promise((resolve) => {
    function sample() {
      analyser.getByteTimeDomainData(bins);
      for (const value of bins) peak = Math.max(peak, Math.abs(value - 128) / 128);
      if (performance.now() - begun < 420) {
        requestAnimationFrame(sample);
        return;
      }
      lastProof = {
        tone,
        peak: Math.round(peak * 1000) / 1000,
        state: context?.state || "missing",
        advanced: Boolean(context && context.currentTime > started + 0.05),
        at: Date.now(),
      };
      resolve({ ...lastProof, heard: lastProof.peak >= 0.02 && lastProof.state === "running" && lastProof.advanced });
    }
    requestAnimationFrame(sample);
  });
}

export function playNow(tone, volume = 60, deviceId = "") {
  const primed = primeAudio({ open: true });
  const audio = context;
  if (!audio) return Promise.resolve({ heard: false, state: "missing", tone, peak: 0, advanced: false });
  if (deviceId && audio.setSinkId) audio.setSinkId(deviceId).catch(() => {});
  const started = audio.currentTime;
  const analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  const bus = audio.createGain();
  bus.connect(audio.destination);
  bus.connect(analyser);
  playTone(audio, tone, volume, bus);
  return primed.then(() => measure(analyser, started, tone));
}

function speak(phrase, lang) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !phrase) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = lang === "az" ? "az-AZ" : "ru-RU";
    utterance.rate = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
    setTimeout(resolve, 2500);
  });
}

async function drain() {
  if (playing) return;
  playing = true;
  while (queue.length && !stopped && !muted) {
    const item = queue.shift();
    current = item;
    // Тон сразу в выход по умолчанию. Чужой deviceId уводил сигнал в тишину.
    if (context && item.tone && item.tone !== "silent") playTone(context, item.tone, item.volume ?? 60);
    if (item.voice && item.phrase) await speak(item.phrase, item.lang);
  }
  current = null;
  playing = false;
}

function flushHeld() {
  const waiting = held.splice(0);
  for (const item of waiting) enqueueAlert(item);
}

export function enqueueAlert(detail) {
  if (muted || !detail?.sound || detail.tone === "silent") return false;
  const key = `${detail.kind || "event"}:${detail.subject || detail.id || "once"}`;
  const seen = recent.get(key) || 0;
  if (seen && Date.now() - seen < 10_000) return false;
  if (recent.size > 200) recent.delete(recent.keys().next().value);
  if (stopped || audioState() !== "running") {
    if (!held.some((item) => `${item.kind}:${item.subject || item.id}` === key)) held.push(detail);
    return false;
  }
  recent.set(key, Date.now());
  queue.unshift(detail);
  drain();
  return true;
}

export function stopAudio() {
  stopped = true;
  queue = [];
  held.length = 0;
  playing = false;
  current = null;
  window.speechSynthesis?.cancel();
}

export function forgetSubject(subject) {
  if (!subject) return;
  for (const key of recent.keys()) {
    if (key.endsWith(`:${subject}`)) recent.delete(key);
  }
}
