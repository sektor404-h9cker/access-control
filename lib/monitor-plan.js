function resolveDevice(camera, available) {
  if (camera.deviceId) {
    const byId = available.find((item) => item.deviceId === camera.deviceId);
    if (byId) return byId;
  }
  if (!camera.deviceLabel) return null;
  return available.find((item) => item.label && item.label === camera.deviceLabel) || null;
}

export function planMonitorStart(cameras, available, onlyId = "") {
  const list = Array.isArray(available) ? available : [];
  const posts = cameras.filter((camera) => camera.sourceKind !== "ip");
  let chosen = posts.filter((camera) => camera.deviceId || camera.deviceLabel);
  if (onlyId) chosen = chosen.filter((camera) => camera.id === onlyId);
  if (!chosen.length) {
    return { ok: false, error: "no_device", missing: posts.map((camera) => camera.id), choices: [], runs: [] };
  }
  const resolved = chosen.map((camera) => ({ camera, device: resolveDevice(camera, list) }));
  const runs = resolved.filter((item) => item.device);
  const missing = resolved.filter((item) => !item.device).map((item) => item.camera.id);
  if (!runs.length) return { ok: false, error: "no_device", missing, choices: [], runs: [] };
  const ids = runs.map((item) => item.device.deviceId);
  if (!onlyId && ids.length > 1 && ids.every((id) => id === ids[0])) {
    return {
      ok: false,
      error: "same_device",
      missing,
      runs: [],
      choices: runs.map((item) => ({ id: item.camera.id, code: item.camera.code, direction: item.camera.direction })),
    };
  }
  return {
    ok: true,
    missing,
    choices: [],
    runs: runs.map((item) => ({
      id: item.camera.id,
      code: item.camera.code,
      direction: item.camera.direction,
      deviceId: item.device.deviceId,
      label: item.device.label || item.camera.deviceLabel || "",
    })),
  };
}
