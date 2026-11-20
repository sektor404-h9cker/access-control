import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FREQ = { soft: 523, security: 698, digital: 988, double: 660, chime: 659 };

export function toneWav(freq, ms = 180, volume = 60) {
  const rate = 22050;
  const samples = Math.max(1, Math.floor(rate * ms / 1000));
  const data = Buffer.alloc(samples * 2);
  const amp = Math.round(32767 * Math.min(0.4, Math.max(0, volume) / 100 * 0.4));
  for (let index = 0; index < samples; index += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * index) / rate) * amp), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function requestGateTone(tone, volume = 60) {
  const freq = FREQ[tone] || 0;
  if (!freq || Number(volume) <= 0) return false;
  const file = path.join(os.tmpdir(), "smz-gate-tone.wav");
  fs.writeFileSync(file, toneWav(freq, 180, volume));
  if (process.platform === "win32") {
    spawn("powershell.exe", ["-NoProfile", "-Command", `(New-Object System.Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`], { stdio: "ignore", detached: true, windowsHide: true }).unref();
  } else if (process.platform === "darwin") {
    spawn("afplay", [file], { stdio: "ignore", detached: true }).unref();
  } else {
    return false;
  }
  return true;
}
