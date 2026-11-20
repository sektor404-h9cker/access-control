export const TENSORFLOW_INFO = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

export function isTensorFlowInfo(value) {
  return String(value ?? "").includes(TENSORFLOW_INFO);
}
