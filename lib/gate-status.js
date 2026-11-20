export function describeGate(input, now = Date.now()) {
  const seenAt = Number(input?.seenAt) || 0;
  if (!seenAt) {
    return { system: "local", agentUp: false, attention: false, desired: input?.desired === "stopped" ? "stopped" : "running", cameras: [] };
  }
  const heartbeatAge = now - seenAt;
  const agentUp = heartbeatAge <= 8000;
  const desired = input?.desired === "stopped" ? "stopped" : "running";
  const cameras = (input.cameras || []).map((camera) => {
    const lastFrameAt = Number(camera.lastFrameAt) || 0;
    const frameAge = lastFrameAt ? now - lastFrameAt : Infinity;
    let state = "agent";
    if (desired === "stopped") state = "stopped";
    else if (!agentUp) state = "agent";
    else if (!lastFrameAt || frameAge > 5000) state = "no-frames";
    else if (camera.ai === "ready") state = "working";
    else state = "no-ai";
    return {
      id: camera.id,
      state,
      fps: Number(camera.fps) || 0,
      width: Number(camera.width) || 0,
      height: Number(camera.height) || 0,
      frameAge: Number.isFinite(frameAge) ? frameAge : null,
      ai: camera.ai || "unavailable",
    };
  });
  let system = "agent";
  if (desired === "stopped") system = "stopped";
  else if (!agentUp) system = "agent";
  else if (!cameras.length || cameras.every((camera) => camera.state === "no-frames")) system = "no-frames";
  else if (cameras.some((camera) => camera.state === "working")) system = "working";
  else system = "no-ai";
  return { system, agentUp, attention: !agentUp && heartbeatAge > 60000, desired, cameras };
}
