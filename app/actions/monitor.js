"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/guard";
import { planMonitorStart } from "@/lib/monitor-plan";
import { listCameras, updateCamera } from "@/lib/settings";

function refresh() {
  revalidatePath("/", "layout");
}

export async function startMonitoring(input) {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  const cameras = listCameras();
  const devices = Array.isArray(input?.devices) ? input.devices.map((item) => ({
    deviceId: String(item?.deviceId || ""),
    label: String(item?.label || ""),
  })).filter((item) => item.deviceId) : [];
  const plan = planMonitorStart(cameras, devices, String(input?.onlyId || ""));
  if (!plan.ok) return plan;
  for (const run of plan.runs) {
    const saved = cameras.find((camera) => camera.id === run.id);
    const result = updateCamera({
      id: run.id,
      source: "usb",
      host: "",
      deviceId: run.deviceId,
      deviceLabel: run.label,
      enabled: true,
      direction: saved?.direction,
    }, context.meta);
    if (!result.ok) return result;
  }
  for (const camera of cameras) {
    if (camera.sourceKind === "ip" || !camera.enabled) continue;
    if (plan.runs.some((run) => run.id === camera.id)) continue;
    const result = updateCamera({
      id: camera.id,
      source: "usb",
      host: camera.host,
      deviceId: camera.deviceId,
      deviceLabel: camera.deviceLabel,
      enabled: false,
      direction: camera.direction,
    }, context.meta);
    if (!result.ok) return result;
  }
  refresh();
  return { ok: true, runs: plan.runs.map((run) => run.id), missing: plan.missing };
}

export async function stopMonitoring() {
  const context = await actionContext("settings.manage");
  if (context.error) return { ok: false, error: context.error };
  for (const camera of listCameras()) {
    if (!camera.enabled || camera.sourceKind === "ip") continue;
    const result = updateCamera({
      id: camera.id,
      source: "usb",
      host: camera.host,
      deviceId: camera.deviceId,
      deviceLabel: camera.deviceLabel,
      enabled: false,
      direction: camera.direction,
    }, context.meta);
    if (!result.ok) return result;
  }
  refresh();
  return { ok: true };
}
