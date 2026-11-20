export function classifyDistance({ area, facePx, sharpness, brightness, yaw, centered, passage }) {
  if (passage) {
    if (facePx < 72) return { code: "far", quality: "poor" };
  } else if (area < 0.045) {
    return { code: "far", quality: "poor" };
  }
  if (area > 0.72) return { code: "close", quality: "poor" };
  if (brightness < 48) return { code: "dark", quality: "poor" };
  if (brightness > 220) return { code: "bright", quality: "poor" };
  if (sharpness < (passage ? 10 : 22)) return { code: "blur", quality: "poor" };
  if (Math.abs(yaw) > 0.45) return { code: "straight", quality: "poor" };
  const quality = sharpness > (passage ? 28 : 80) && brightness > 75 && brightness < 185 ? "good" : "ok";
  if (yaw <= -0.07) return { code: "left", quality };
  if (yaw >= 0.07) return { code: "right", quality };
  if (!centered) return { code: "off", quality };
  return { code: "center", quality };
}
