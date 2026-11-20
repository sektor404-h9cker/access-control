import { cameraErrorCode, exclusive, listVideoDevices, openVideo, stopStream } from "./camera-devices.js";

function liveStream(slot) {
  const track = slot.stream?.getVideoTracks?.()[0];
  return track && track.readyState === "live" ? slot.stream : null;
}

const RETRYABLE = new Set(["busy", "aborted", "failed"]);

export function createCameraHub(open) {
  const slots = new Map();
  let holders = 0;

  function slotFor(deviceId) {
    const id = deviceId || "";
    let slot = slots.get(id);
    if (!slot) {
      slot = { id, refs: 0, stream: null, pending: null, generation: 0, opens: 0, lastError: "" };
      slots.set(id, slot);
    }
    return slot;
  }

  async function openRetry(slot) {
    let last;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const stream = await exclusive(() => open(slot.id));
        slot.opens += 1;
        slot.lastError = "";
        return stream;
      } catch (error) {
        last = error;
        slot.lastError = error?.name || "Error";
        const code = cameraErrorCode(error);
        if (!RETRYABLE.has(code) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw last;
  }

  function hold(deviceId) {
    const slot = slotFor(deviceId);
    slot.refs += 1;
    holders += 1;
    if (!slot.pending && !liveStream(slot)) {
      slot.pending = openRetry(slot).then((stream) => {
        slot.pending = null;
        if (slot.refs === 0) {
          stopStream(stream);
          throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        }
        slot.stream = stream;
        stream.getVideoTracks?.()[0]?.addEventListener?.("ended", () => {
          if (slot.stream === stream) slot.stream = null;
        });
        return stream;
      }).catch((error) => {
        slot.pending = null;
        throw error;
      });
    }
    const ready = liveStream(slot) ? Promise.resolve(slot.stream) : slot.pending;
    let settled = false;
    return {
      ready,
      opens: () => slot.opens,
      release() {
        if (settled) return;
        settled = true;
        slot.refs -= 1;
        holders = Math.max(0, holders - 1);
        if (slot.refs > 0) return;
        const token = slot.generation + 1;
        slot.generation = token;
        ready.then(() => {
          if (slot.refs > 0 || slot.generation !== token) return;
          stopStream(slot.stream);
          slot.stream = null;
          if (slots.get(slot.id) === slot) slots.delete(slot.id);
        }, () => {
          if (slot.refs === 0 && slot.generation === token && slots.get(slot.id) === slot) slots.delete(slot.id);
        });
      },
      errorCode(error) {
        return cameraErrorCode(error);
      },
    };
  }

  return {
    hold,
    busy: () => holders > 0 || [...slots.values()].some((slot) => slot.pending),
    releaseAll() {
      for (const slot of slots.values()) {
        stopStream(slot.stream);
        slot.stream = null;
        slot.refs = 0;
        slot.pending = null;
        slot.generation += 1;
      }
      holders = 0;
      slots.clear();
    },
  };
}

const hub = createCameraHub((deviceId) => openVideo(deviceId));

export function holdCamera(deviceId) {
  return hub.hold(deviceId);
}

export function cameraHubBusy() {
  return hub.busy();
}

export function releaseAllCameras() {
  hub.releaseAll();
}

export function listSharedDevices() {
  return listVideoDevices(() => hub.busy());
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => hub.releaseAll());
}
