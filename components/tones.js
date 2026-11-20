export const TONE_IDS = ["soft", "security", "digital", "double", "chime", "silent"];

function beep(context, frequency, start, duration, type, level, destination) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now + start);
  gain.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), now + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
  oscillator.connect(gain);
  gain.connect(destination || context.destination);
  oscillator.start(now + start);
  oscillator.stop(now + start + duration + 0.05);
}

export function playTone(context, id, volume = 60, destination) {
  if (!context || id === "silent" || !TONE_IDS.includes(id)) return 0;
  const level = Math.min(0.4, Math.max(0, Number(volume) / 100 * 0.4));
  if (level <= 0) return 0;
  const output = destination || context.destination;
  if (id === "soft") beep(context, 523, 0, 0.45, "sine", level, output);
  if (id === "security") {
    beep(context, 698, 0, 0.16, "triangle", level, output);
    beep(context, 554, 0.22, 0.28, "triangle", level * 0.8, output);
  }
  if (id === "digital") {
    beep(context, 988, 0, 0.07, "square", level * 0.35, output);
    beep(context, 1318, 0.12, 0.07, "square", level * 0.3, output);
    beep(context, 988, 0.24, 0.07, "square", level * 0.35, output);
  }
  if (id === "double") {
    beep(context, 660, 0, 0.18, "sine", level, output);
    beep(context, 880, 0.32, 0.22, "sine", level, output);
  }
  if (id === "chime") {
    beep(context, 523, 0, 0.7, "sine", level * 0.7, output);
    beep(context, 659, 0.08, 0.8, "sine", level * 0.55, output);
    beep(context, 784, 0.16, 0.9, "sine", level * 0.4, output);
  }
  return id === "chime" ? 1.1 : id === "soft" ? 0.5 : 0.7;
}
