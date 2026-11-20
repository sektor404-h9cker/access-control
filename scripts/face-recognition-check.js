import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smz-face-"));
process.env.SMZ_DB_PATH = path.join(directory, "face.db");
process.env.SMZ_BIOMETRIC_KEY_PATH = path.join(directory, "biometric.key");
process.env.SESSION_SECRET = "self-check-secret-value-with-32-characters";

const { sfaceTensor, embedJpeg } = await import("../lib/face-embed.js");
const { ACCEPT_COSINE, cosine, decideMatch } = await import("../lib/face-match.js");
const { estimateSimilarity, applySimilarity, classifyPose, poseMatches } = await import("../lib/face-geometry.js");
const { assignTracks, frameFresh, noteAgreement, summarizeLatency } = await import("../lib/face-track.js");
const { cameraErrorCode } = await import("../components/camera-devices.js");
const { saveDepartment } = await import("../lib/departments.js");
const { saveEmployee } = await import("../lib/employees.js");
const { storeBiometric, deleteEmployeeTemplates, saveTemplateVector } = await import("../lib/face-store.js");
const { recognizeVector } = await import("../lib/recognition.js");
const { get, run } = await import("../lib/db.js");
const jpegLib = (await import("jpeg-js")).default;

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const pixel = new Uint8ClampedArray(112 * 112 * 4);
pixel[0] = 10;
pixel[1] = 20;
pixel[2] = 30;
pixel[3] = 255;
const tensor = sfaceTensor(pixel);
assert(tensor[0] === 10 && tensor[112 * 112] === 20 && tensor[112 * 112 * 2] === 30, "SFace input was scaled or channel-swapped");
assert(Math.max(...tensor) <= 255, "SFace input left the 0..255 range");

const source = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
const transform = estimateSimilarity(source, source);
const mapped = applySimilarity(transform, source[0][0], source[0][1]);
assert(Math.hypot(mapped[0] - source[0][0], mapped[1] - source[0][1]) < 0.01, "Alignment moved an already aligned point");
const neutral = { yaw: 0, pitch: 0.45 };
assert(classifyPose({ yaw: 0.1, pitch: 0.45 }, neutral) === "right", "A right turn was not measured from the head pose");
assert(classifyPose({ yaw: -0.1, pitch: 0.45 }, neutral) === "left", "A left turn was not measured from the head pose");
assert(classifyPose({ yaw: 0, pitch: 0.38 }, neutral) === "up", "Looking up was not measured");
assert(classifyPose({ yaw: 0, pitch: 0.52 }, neutral) === "down", "Looking down was not measured");
assert(classifyPose({ yaw: 0.01, pitch: 0.45 }, neutral) === "center", "A still head was counted as a turn");
assert(poseMatches({ pose: "right", minYaw: 0.13 }, { yaw: 0.08, pitch: 0.45 }, neutral) === false, "A small turn satisfied the larger turn");
assert(poseMatches({ pose: "right", minYaw: 0.13 }, { yaw: 0.16, pitch: 0.45 }, neutral) === true, "A measured turn was rejected");
const face = { box: { x: 0.4, y: 0.3 } };
const kept = assignTracks([{ id: "t1", x: 0.4, y: 0.3, face, sentAt: 10, hold: 280, agreeId: "person", agree: 2, commit: true, seenAt: 5 }], [face]);
assert(kept[0].agree === 2 && kept[0].commit === true && kept[0].seenAt === 5, "Tracking forgot the frames already agreed");

let agreement = { agreeId: "", agree: 0, commit: false };
agreement = noteAgreement(agreement, { outcome: "matched", employeeId: "person" });
agreement = noteAgreement(agreement, { outcome: "matched", employeeId: "person" });
assert(!agreement.commit, "A name was accepted before three agreeing frames");
agreement = noteAgreement(agreement, { outcome: "matched", employeeId: "person" });
assert(agreement.commit, "Three agreeing frames did not become stable");
agreement = noteAgreement(agreement, { outcome: "unknown" });
assert(!agreement.commit, "One unknown frame was committed");
assert(!frameFresh(0, 800), "A stale frame was kept");
assert(frameFresh(100, 700), "A fresh frame was dropped");
const summary = summarizeLatency([10, 20, 30, 40, 100]);
assert(summary.median === 30 && summary.p95 === 100, "Median or p95 was wrong");
assert(cameraErrorCode({ name: "NotAllowedError" }) === "permission", "Camera permission error was mislabeled");
assert(cameraErrorCode({ name: "NotReadableError" }) === "busy", "A busy camera was mislabeled");
assert(decideMatch([{ employeeId: "a", cosine: 0.2 }]).outcome === "unknown", "A weak score was accepted");
assert(decideMatch([{ employeeId: "a", cosine: ACCEPT_COSINE }]).outcome === "matched", "The published threshold was changed");

function patternJpeg(seed) {
  const data = Buffer.alloc(112 * 112 * 4);
  for (let pixelIndex = 0; pixelIndex < 112 * 112; pixelIndex += 1) {
    data[pixelIndex * 4] = (seed * 13 + pixelIndex) % 255;
    data[pixelIndex * 4 + 1] = (seed + pixelIndex * 2) % 255;
    data[pixelIndex * 4 + 2] = (seed * 3 + pixelIndex * 5) % 255;
    data[pixelIndex * 4 + 3] = 255;
  }
  return Buffer.from(jpegLib.encode({ data, width: 112, height: 112 }, 90).data);
}

const meta = { actor: { id: "owner", username: "check" }, ip: "127.0.0.1" };
const department = saveDepartment({ name: "Face", scheduleStart: "08:15", scheduleEnd: "16:30", graceMinutes: "0" }, meta);
const first = saveEmployee({ lastName: "Bir", firstName: "Üz", patronymic: "", departmentId: department.id, position: "", personnelNumber: "F-1", phone: "", scheduleStart: "", scheduleEnd: "", graceMinutes: "" }, meta);
const second = saveEmployee({ lastName: "İki", firstName: "Üz", patronymic: "", departmentId: department.id, position: "", personnelNumber: "F-2", phone: "", scheduleStart: "", scheduleEnd: "", graceMinutes: "" }, meta);
run("UPDATE employees SET biometric_allowed = 1 WHERE id IN (?, ?)", [first.id, second.id]);
run("UPDATE cameras SET enabled = 1, source_kind = 'usb', device_id = 'usb-a' WHERE id = 'camera-entrance'");
const known = await embedJpeg(patternJpeg(4));
assert(known.ok && known.vector.length === 128, "Embedding was not 128 dimensional");
const samples = (seed) => Array.from({ length: 8 }, (_, index) => ({
  bytes: patternJpeg(seed + index * 19),
  points: [[0.4 + index * 0.004, 0.4], [0.62, 0.41], [0.5, 0.55], [0.43, 0.72], [0.6, 0.71]],
}));
const stored = await storeBiometric({ employeeId: first.id, samples: samples(4), confirmReplace: false, meta });
assert(stored.ok && stored.templates === 8, stored.error || "Distinct enrollment did not store templates");
const copied = await storeBiometric({ employeeId: second.id, samples: Array.from({ length: 8 }, () => ({ bytes: patternJpeg(4), points: [[0.4, 0.4], [0.6, 0.4], [0.5, 0.5], [0.42, 0.7], [0.58, 0.7]] })), confirmReplace: false, meta });
assert(copied.error === "static_sample", "Copied frames were enrolled");
const clash = await storeBiometric({ employeeId: second.id, samples: samples(4), confirmReplace: false, meta });
assert(clash.error === "duplicate_face", clash.error || "The same person was enrolled on a second card");
assert(get("SELECT face_enrolled FROM employees WHERE id = ?", [second.id]).face_enrolled === 0, "A rejected duplicate was marked enrolled");
const before = get("SELECT COUNT(*) AS count FROM recognition_events").count;
const probe = recognizeVector(known.vector, { cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, probe: true, meta });
assert(probe.probe === true && probe.outcome === "matched" && !probe.id && get("SELECT COUNT(*) AS count FROM recognition_events").count === before, "A probe wrote an event");
const committed = recognizeVector(known.vector, { cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, meta });
assert(committed.status === "pending" && !committed.recorded, "Review mode wrote attendance");
const removed = deleteEmployeeTemplates(first.id, meta);
assert(removed.ok && get("SELECT COUNT(*) AS count FROM face_templates WHERE employee_id = ?", [first.id]).count === 0, "Templates were not deleted");
assert(saveTemplateVector(first.id, known.vector, meta).error === "biometric_denied", "A revoked employee received a new template");
const stranger = new Float32Array(128);
stranger[9] = 1;
assert(cosine(known.vector, stranger) < ACCEPT_COSINE, "An unrelated vector passed the gate threshold");

const totals = [];
for (let round = 0; round < 8; round += 1) {
  const started = performance.now();
  const embedded = await embedJpeg(patternJpeg(4));
  recognizeVector(embedded.vector, { cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, probe: true, meta });
  totals.push(Math.round(performance.now() - started));
}
const speed = summarizeLatency(totals);
console.log(`Full recognition probe median ms: ${speed.median}; p95 ms: ${speed.p95}; SFace threshold: ${ACCEPT_COSINE}`);
assert(speed.median < 1000, "Full recognition probe median exceeded one second");
console.log("Face recognition check passed");
