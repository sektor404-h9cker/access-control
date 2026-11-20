import assert from "node:assert/strict";
import { cameraErrorCode } from "../components/camera-devices.js";
import { createCameraHub } from "../components/camera-hub.js";

function stream(stop) {
  const tracks = [{ readyState: "live", stop, addEventListener() {} }];
  return { getVideoTracks: () => tracks, getTracks: () => tracks };
}

assert(cameraErrorCode({ name: "NotAllowedError" }) === "permission", "Permission was not named");
assert(cameraErrorCode({ name: "NotFoundError" }) === "noCamera", "A missing camera was not named");
assert(cameraErrorCode({ name: "OverconstrainedError" }) === "noCamera", "A stale device id was not named");
assert(cameraErrorCode({ name: "NotReadableError" }) === "busy", "A busy camera was not named");
assert(cameraErrorCode({ name: "AbortError" }) === "aborted", "An aborted open was not named");

let active = 0;
let opens = 0;
const hub = createCameraHub(async (deviceId) => {
  opens += 1;
  active += 1;
  if (active > 1) throw Object.assign(new Error(deviceId), { name: "NotReadableError" });
  return stream(() => { active -= 1; });
});

const first = hub.hold("face");
const second = hub.hold("face");
await first.ready;
await second.ready;
assert(opens === 1 && active === 1, "One physical camera was opened twice");
first.release();
await new Promise((resolve) => setTimeout(resolve, 20));
assert(active === 1, "The shared stream stopped while another view still used it");
second.release();
await new Promise((resolve) => setTimeout(resolve, 20));
assert(active === 0, "The stream stayed open after the last view closed");

let tries = 0;
const retryHub = createCameraHub(async () => {
  tries += 1;
  if (tries < 3) throw Object.assign(new Error("busy"), { name: "NotReadableError" });
  return stream(() => {});
});
const retried = retryHub.hold("usb");
await retried.ready;
assert(tries === 3, "A busy camera was not retried a limited number of times");
retried.release();

let stopped = false;
let finish;
const late = createCameraHub(() => new Promise((resolve) => { finish = resolve; }));
const abandoned = late.hold("late");
await new Promise((resolve) => setTimeout(resolve, 0));
abandoned.release();
finish(stream(() => { stopped = true; }));
await abandoned.ready.catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 20));
assert(stopped, "A stream that opened after the view closed was kept");

console.log("Camera hub check passed");
