// 112×112 reference used by OpenCV FaceRecognizerSF.alignCrop.
export const SFACE_DEST = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// Maps source points onto destination points with rotation, uniform scale and shift.
export function estimateSimilarity(source, destination) {
  const count = Math.min(source.length, destination.length);
  let mx = 0;
  let my = 0;
  let ux = 0;
  let uy = 0;
  for (let index = 0; index < count; index += 1) {
    mx += source[index][0];
    my += source[index][1];
    ux += destination[index][0];
    uy += destination[index][1];
  }
  mx /= count;
  my /= count;
  ux /= count;
  uy /= count;
  let real = 0;
  let imaginary = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const x = source[index][0] - mx;
    const y = source[index][1] - my;
    const u = destination[index][0] - ux;
    const v = destination[index][1] - uy;
    real += x * u + y * v;
    imaginary += x * v - y * u;
    denominator += x * x + y * y;
  }
  const a = denominator ? real / denominator : 1;
  const b = denominator ? imaginary / denominator : 0;
  return {
    a,
    b,
    tx: ux - (a * mx - b * my),
    ty: uy - (b * mx + a * my),
  };
}

export function applySimilarity(transform, x, y) {
  return [transform.a * x - transform.b * y + transform.tx, transform.b * x + transform.a * y + transform.ty];
}

export function inverseMap(transform, x, y) {
  const dx = x - transform.tx;
  const dy = y - transform.ty;
  const determinant = transform.a * transform.a + transform.b * transform.b || 1;
  return [(transform.a * dx + transform.b * dy) / determinant, (-transform.b * dx + transform.a * dy) / determinant];
}

// Positive yaw is the person's right in the mirrored preview.
// Positive pitch means the nose sits lower: the person is looking down.
export function headMeasure(landmarks) {
  const nose = landmarks?.[1];
  const eyeA = landmarks?.[33];
  const eyeB = landmarks?.[263];
  const mouthA = landmarks?.[61];
  const mouthB = landmarks?.[291];
  if (!nose || !eyeA || !eyeB || !mouthA || !mouthB) return null;
  const eyeX = (eyeA.x + eyeB.x) / 2;
  const eyeY = (eyeA.y + eyeB.y) / 2;
  const mouthY = (mouthA.y + mouthB.y) / 2;
  const span = Math.max(Math.abs(eyeA.x - eyeB.x), 0.001);
  return {
    yaw: (nose.x - eyeX) / span,
    pitch: (nose.y - eyeY) / Math.max(mouthY - eyeY, 0.001),
  };
}

export function classifyPose(measure, baseline) {
  if (!measure) return "off";
  if (!baseline) {
    if (Math.abs(measure.yaw) <= 0.05 && measure.pitch > 0.2 && measure.pitch < 0.75) return "center";
    return "off";
  }
  const yaw = measure.yaw - baseline.yaw;
  const pitch = measure.pitch - baseline.pitch;
  if (yaw >= 0.07) return "right";
  if (yaw <= -0.07) return "left";
  if (pitch <= -0.04) return "up";
  if (pitch >= 0.04) return "down";
  if (Math.abs(yaw) <= 0.04 && Math.abs(pitch) <= 0.025) return "center";
  return "off";
}

export function poseMatches(step, measure, baseline) {
  if (!step || !measure) return false;
  if (!baseline) return step.pose === "center" && classifyPose(measure, null) === "center";
  const yaw = measure.yaw - baseline.yaw;
  const pitch = measure.pitch - baseline.pitch;
  if (step.pose === "right") return yaw >= (step.minYaw ?? 0.07);
  if (step.pose === "left") return yaw <= (step.maxYaw ?? -0.07);
  if (step.pose === "up") return pitch <= (step.maxPitch ?? -0.04) && Math.abs(yaw) < 0.12;
  if (step.pose === "down") return pitch >= (step.minPitch ?? 0.04) && Math.abs(yaw) < 0.12;
  return Math.abs(yaw) <= 0.04 && Math.abs(pitch) <= 0.03;
}

export function pointMotion(samples) {
  let max = 0;
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const a = samples[left];
      const b = samples[right];
      const count = Math.min(a?.length || 0, b?.length || 0);
      for (let index = 0; index < count; index += 1) {
        const dx = Number(a[index][0]) - Number(b[index][0]);
        const dy = Number(a[index][1]) - Number(b[index][1]);
        max = Math.max(max, Math.hypot(dx, dy));
      }
    }
  }
  return max;
}
