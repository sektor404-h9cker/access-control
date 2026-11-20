import os from "node:os";

export function runtimeLoad() {
  const memory = process.memoryUsage();
  const [load1] = os.loadavg();
  return {
    rssMb: Math.round(memory.rss / 1048576),
    heapMb: Math.round(memory.heapUsed / 1048576),
    load1: Math.round(load1 * 100) / 100,
  };
}
