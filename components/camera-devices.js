export function cameraErrorCode(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "noCamera";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  if (name === "AbortError") return "aborted";
  return "failed";
}

let gate = Promise.resolve();

export function exclusive(task) {
  const run = gate.then(task, task);
  gate = run.then(() => undefined, () => undefined);
  return run;
}

export async function listVideoDevices(busy = () => false) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw Object.assign(new Error("missing"), { name: "NotFoundError" });
  }
  return exclusive(async () => {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videos = devices.filter((device) => device.kind === "videoinput");
    const unlabeled = !videos.length || videos.some((device) => !device.label);
    if (unlabeled && !busy() && navigator.mediaDevices.getUserMedia) {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      probe.getTracks().forEach((track) => track.stop());
      await new Promise((resolve) => setTimeout(resolve, 180));
      devices = await navigator.mediaDevices.enumerateDevices();
      videos = devices.filter((device) => device.kind === "videoinput");
    }
    return videos.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `USB ${index + 1}`,
    }));
  });
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function openVideo(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(Object.assign(new Error("missing"), { name: "NotFoundError" }));
  }
  const video = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 20 },
  };
  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}
