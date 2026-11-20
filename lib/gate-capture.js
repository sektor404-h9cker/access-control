export function ffmpegArgs({ platform = process.platform, device = "0", width = 1280, height = 720, fps = 8 } = {}) {
  const inputW = Math.min(1920, Math.max(320, width));
  const inputH = Math.min(1080, Math.max(240, height));
  // Полный кадр и более резкий JPEG: мелкий сжатый кадр путал разных людей в одном шаблоне.
  const requested = Math.min(24, Math.max(15, Number(fps) || 20));
  const rate = String(platform === "darwin" ? 30 : Math.min(requested, 20));
  const tail = ["-vf", `scale=${inputW}:${inputH},fps=${requested}`, "-f", "mjpeg", "-q:v", "4", "pipe:1"];
  const inputSize = `${inputW}x${inputH}`;
  if (platform === "win32") {
    return ["-hide_banner", "-loglevel", "error", "-f", "dshow", "-framerate", rate, "-video_size", inputSize, "-i", `video=${device}`, ...tail];
  }
  return ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-framerate", rate, "-video_size", inputSize, "-pixel_format", "uyvy422", "-i", `${device}:none`, ...tail];
}

export function splitJpeg(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length - 1) {
    let start = -1;
    for (let index = offset; index < buffer.length - 1; index += 1) {
      if (buffer[index] === 0xff && buffer[index + 1] === 0xd8) {
        start = index;
        break;
      }
    }
    if (start < 0) return { frames, rest: Buffer.alloc(0) };
    let end = -1;
    for (let index = start + 2; index < buffer.length - 1; index += 1) {
      if (buffer[index] === 0xff && buffer[index + 1] === 0xd9) {
        end = index;
        break;
      }
    }
    if (end < 0) return { frames, rest: buffer.subarray(start) };
    frames.push(buffer.subarray(start, end + 2));
    offset = end + 2;
  }
  return { frames, rest: Buffer.alloc(0) };
}
