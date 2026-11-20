import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smz-check-"));
process.env.SMZ_DB_PATH = path.join(directory, "check.db");
process.env.SMZ_BIOMETRIC_KEY_PATH = path.join(directory, "biometric.key");
process.env.SESSION_SECRET = "self-check-secret-value-with-32-characters";

const { dictionary, dictionaryPaths } = await import("../lib/i18n/index.js");
const { fold } = await import("../lib/text.js");
const { startOfWeek } = await import("../lib/time.js");
const { evaluateAttendance } = await import("../lib/attendance.js");
const { seedDemo } = await import("../lib/demo-seed.js");
const { saveDepartment } = await import("../lib/departments.js");
const { deleteEmployeeRecord, listEmployees, saveEmployee } = await import("../lib/employees.js");
const { recordMovement, dailyBoard, updateAttendance } = await import("../lib/attendance.js");
const { dayKind } = await import("../lib/calendar.js");
const { can } = await import("../lib/permissions.js");
const { setRolePermissions } = await import("../lib/access.js");
const { dashboardSnapshot } = await import("../lib/dashboard.js");
const { buildReport, presentReport } = await import("../lib/reports/build.js");
const { buildPdf } = await import("../lib/reports/pdf.js");
const { buildXlsx } = await import("../lib/reports/xlsx.js");
const { createBackup } = await import("../lib/backup.js");
const { hashPassword, verifyPassword } = await import("../lib/passwords.js");
const { createToken, readToken } = await import("../lib/token.js");
const { closeDb, getDb, get, all, run } = await import("../lib/db.js");
const { addDays, bakuStamp, formatDateTime, todayKey } = await import("../lib/time.js");
const { recordEnrollment } = await import("../lib/enrollment.js");
const { identify, recognitionStatus, recognizeVector, confirmRecognition } = await import("../lib/recognition.js");
const { decideMatch, cosine, livenessOf, matchReason } = await import("../lib/face-match.js");
const { SFACE_DEST, estimateSimilarity, applySimilarity, pointMotion } = await import("../lib/face-geometry.js");
const { embedJpeg } = await import("../lib/face-embed.js");
const { deleteEmployeeTemplates, saveTemplateVector, storeBiometric } = await import("../lib/face-store.js");
const { updateRecognitionMode, updateDashboardCameras } = await import("../lib/settings.js");
const { selectLiveCameras, aiStatusKey, isStreamCamera } = await import("../lib/live-board.js");
const { planMonitorStart } = await import("../lib/monitor-plan.js");
const { classifyLandmarks, createGestureTracker, gestureSoundAllowed, sampleHand } = await import("../lib/gesture-logic.js");
const { boxesOverlap, createOccupancy } = await import("../lib/people-count.js");
const { getAiSettings, getVisionSettings, updateVisionSettings } = await import("../lib/vision-settings.js");
const { closeHelpRequest, confirmHelpRequest, createHelpRequest } = await import("../lib/help-requests.js");
const { isTensorFlowInfo, TENSORFLOW_INFO } = await import("../lib/tf-log.js");
const { describeGate } = await import("../lib/gate-status.js");
const { ffmpegArgs, splitJpeg } = await import("../lib/gate-capture.js");
const { stepVisit } = await import("../lib/visit-state.js");
const { gateAuthorized, gateSnapshot, noteFrame, noteHeartbeat, setGateDesired } = await import("../lib/gate-store.js");
const { requestGateTone } = await import("../lib/gate-tone.js");
const { previewDemoPurge, purgeDemoData } = await import("../lib/demo-purge.js");
const { clearOwnerData } = await import("../lib/owner-data.js");
const { policyFor, saveWorkPolicy } = await import("../lib/work-policy.js");
const { getAlertSettings, noteSignal, updateAlertSettings } = await import("../lib/alerts.js");
const { createUser, findUserById, resetUserPassword, setUserActive } = await import("../lib/users.js");
const { createPairing } = await import("../lib/pair.js");
const { TONE_IDS } = await import("../components/tones.js");
const { assignTracks, dueTracks, readySample } = await import("../lib/face-track.js");
const { passageWorkDate } = await import("../lib/schedule.js");
const { cameraErrorCode } = await import("../components/camera-devices.js");
const jpegLib = (await import("jpeg-js")).default;
const { removePhoto } = await import("../lib/photos.js");
const { isOwner } = await import("../lib/roles.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const azKeys = dictionaryPaths(dictionary("az")).sort();
const ruKeys = dictionaryPaths(dictionary("ru")).sort();
assert(azKeys.join("\n") === ruKeys.join("\n"), "AZ and RU dictionaries differ");
assert(fold("Əliyev İsmayıl") === "əliyev ismayıl", "Azerbaijani case folding failed");
assert(startOfWeek("2026-11-19") === "2026-11-16", "Week should start on Monday");
assert(formatDateTime("2026-11-19T11:14:00.000Z") === "19.11.2026 15:14", "Baku datetime format drifted");

const late = evaluateAttendance(
  { check_in: "2026-11-19T08:27:00+04:00", check_out: "2026-11-19T16:10:00+04:00" },
  { start: "08:15", end: "16:30", grace: 0 },
);
assert(late.lateMinutes === 12 && late.earlyMinutes === 20 && late.durationMinutes === 463, "Schedule math failed");
const grace = evaluateAttendance(
  { check_in: "2026-11-19T08:24:00+04:00" },
  { start: "08:15", end: "16:30", grace: 10 },
);
assert(grace.lateMinutes === 0 && grace.status === "on_site", "Grace period failed");
assert(evaluateAttendance(null, { start: "08:15", end: "16:30", grace: 0 }, { kind: "off" }).status === "off", "Day off was counted absent");
assert(evaluateAttendance(null, { start: "08:15", end: "16:30", grace: 0 }, { kind: "vacation" }).status === "vacation", "Vacation was counted absent");
assert(evaluateAttendance({ check_in: "2026-11-19T08:10:00+04:00" }, { start: "08:15", end: "16:30", grace: 0 }, { kind: "holiday" }).status === "on_site", "A holiday check-in was ignored");
assert(evaluateAttendance(null, { start: "08:15", end: "16:30", grace: 0 }, { kind: "sick" }).status === "sick", "Sick leave was counted absent");
assert(evaluateAttendance(null, { start: "08:15", end: "16:30", grace: 0 }, { kind: "work", now: "2026-11-19T09:00:00+04:00", workDate: "2026-11-19" }).status === "pending", "An open workday was marked absent");
assert(evaluateAttendance(null, { start: "08:15", end: "16:30", grace: 0 }, { kind: "work", now: "2026-11-19T17:00:00+04:00", workDate: "2026-11-19" }).status === "absent", "A finished workday without entry stayed open");
const night = evaluateAttendance(
  { check_in: "2026-11-19T22:10:00+04:00", check_out: "2026-11-20T05:50:00+04:00" },
  { start: "22:00", end: "06:00", grace: 0 },
);
assert(night.lateMinutes === 10 && night.earlyMinutes === 10 && night.durationMinutes === 460, "Night shift math failed");
assert(passageWorkDate("2026-11-20T05:50:00+04:00", { start: "22:00", end: "06:00" }) === "2026-11-19", "Morning exit was not attached to the night shift");
const identity = estimateSimilarity(SFACE_DEST, SFACE_DEST);
assert(SFACE_DEST.every((point) => {
  const mapped = applySimilarity(identity, point[0], point[1]);
  return Math.abs(mapped[0] - point[0]) < 0.01 && Math.abs(mapped[1] - point[1]) < 0.01;
}), "Face alignment transform failed");
assert(pointMotion([[[0, 0]], [[0.04, 0]]]) >= 0.025, "Pose motion was not measured");
assert(decideMatch([{ employeeId: "a", cosine: 0.2 }]).outcome === "unknown", "A weak score was accepted");
assert(decideMatch([{ employeeId: "a", cosine: 0.5 }, { employeeId: "b", cosine: 0.2 }]).outcome === "matched", "A separated score was not accepted");
assert(decideMatch([{ employeeId: "a", cosine: 0.5 }, { employeeId: "b", cosine: 0.47 }]).outcome === "ambiguous", "A close second score was treated as certain");
assert(livenessOf({ motion: 0 }) === "static" && livenessOf({ motion: 0.02 }) === "motion", "Still-frame liveness gate failed");
assert(cameraErrorCode({ name: "NotReadableError" }) === "busy" && cameraErrorCode({ name: "NotFoundError" }) === "noCamera", "Camera loss was classified incorrectly");
assert(dayKind("2026-11-22", "person", { weekendDays: "0,6" }, []) === "off", "Sunday was treated as a workday");

let refused = false;
try {
  await seedDemo();
} catch (error) {
  refused = String(error.message).includes("demo.db");
}
assert(refused, "Demo seed must refuse the working database");

const meta = { actor: { id: "check", username: "check" }, ip: "local" };
const department = saveDepartment({ name: "Yoxlama şöbəsi", scheduleStart: "08:15", scheduleEnd: "16:30", graceMinutes: "0" }, meta);
assert(department.ok, "Department was not saved");
const employee = saveEmployee({
  lastName: "Hüseynov",
  firstName: "Kamran",
  patronymic: "Əli oğlu",
  departmentId: department.id,
  position: "Çilingər",
  personnelNumber: "T-100",
  phone: "+994501112233",
  scheduleStart: "",
  scheduleEnd: "",
  graceMinutes: "",
}, meta);
assert(employee.ok, "Employee was not saved");
const today = todayKey();
const movement = recordMovement({
  employeeId: employee.id,
  direction: "in",
  at: `${today}T08:27:00+04:00`,
  source: "manual",
  meta,
});
assert(movement.ok, movement.error || "Check-in failed");
const duplicateMovement = recordMovement({
  employeeId: employee.id,
  direction: "in",
  at: `${today}T08:40:00+04:00`,
  source: "manual",
  meta,
});
assert(!duplicateMovement.ok && duplicateMovement.error === "already_checked_in", "Double check-in was accepted");
const board = dailyBoard(today);
assert(board.length === 1 && board[0].lateMinutes === 12 && board[0].status === "late", "Daily board is wrong");
const snapshot = dashboardSnapshot();
assert(snapshot.counts.total === 1 && snapshot.counts.late === 1 && snapshot.counts.onSite === 1, "Dashboard counts are wrong");
const adminGrants = all("SELECT permission FROM role_permissions WHERE role_key = 'admin'").map((row) => row.permission);
assert(!adminGrants.includes("employees.policy") && !can({ role: "admin", permissions: adminGrants }, "employees.policy"), "Leadership rights were granted without the owner");
const lead = saveEmployee({
  lastName: "Məmmədov",
  firstName: "Rauf",
  patronymic: "",
  departmentId: department.id,
  position: "Rəhbər",
  personnelNumber: "T-LEAD",
  phone: "+994509998877",
  scheduleStart: "",
  scheduleEnd: "",
  graceMinutes: "",
}, meta);
assert(lead.ok, lead.error || "Leader was not saved");
assert(saveWorkPolicy({ employeeId: lead.id, leadership: true, flexTime: true, effectiveFrom: today }, meta, { role: "observer", permissions: [] }).error === "forbidden", "Observer changed a work policy");
assert(saveWorkPolicy({ employeeId: lead.id, leadership: true, flexTime: true, effectiveFrom: today }, meta, { role: "owner", permissions: [] }).ok, "Owner could not set a free schedule");
assert(policyFor(lead.id, addDays(today, -1)).flexTime === false, "A new policy rewrote the previous day");
const leadIn = recordMovement({ employeeId: lead.id, direction: "in", at: `${today}T10:15:00+04:00`, source: "manual", meta });
const leadOut = recordMovement({ employeeId: lead.id, direction: "out", at: `${today}T16:40:00+04:00`, source: "manual", meta });
assert(leadIn.ok && leadOut.ok, "Leader passage was not stored");
const leadRow = dailyBoard(today).find((row) => row.employee.id === lead.id);
assert(leadRow.status === "flex" && leadRow.lateMinutes === 0 && leadRow.earlyMinutes === 0, "A leader arriving late was penalised");
assert(leadRow.checkInLabel === "10:15" && leadRow.checkOutLabel === "16:40", "Leader entry and exit times were dropped");
const workerRow = dailyBoard(today).find((row) => row.employee.id === employee.id);
assert(workerRow.status === "late" && workerRow.lateMinutes === 12, "A regular employee stopped following the schedule");
assert(get("SELECT action FROM audit_log WHERE entity_id = ? AND action = 'employee.policy'", [lead.id]), "Policy change was not audited");
const firstTracks = assignTracks([], [{ box: { x: 0.2, y: 0.3 } }, { box: { x: 0.7, y: 0.4 } }]);
assert(firstTracks.length === 2 && dueTracks(firstTracks, 1000).length === 2, "Two faces were not both queued");
const heldTracks = firstTracks.map((track) => ({ ...track, sentAt: 1000, hold: 12000 }));
const followedTracks = assignTracks(heldTracks, [{ box: { x: 0.22, y: 0.31 } }, { box: { x: 0.72, y: 0.41 } }]);
assert(followedTracks.length === 2 && followedTracks[0].id === firstTracks[0].id && dueTracks(followedTracks, 2000).length === 0, "The same faces were sent again");

const dict = dictionary("ru");
const leadReport = buildReport({ from: today, to: today, employeeId: lead.id, dict, periodLabel: "lead" });
assert(leadReport.rows[0].status === dict.attendance.statusFlex && !leadReport.rows[0].wasLate && leadReport.summary.absent === 0, "The report marked a free schedule as late or absent");
const gone = saveEmployee({
  lastName: "Silinən",
  firstName: "Nərmin",
  patronymic: "",
  departmentId: department.id,
  position: "",
  personnelNumber: "T-GONE",
  phone: "+994501110077",
  scheduleStart: "",
  scheduleEnd: "",
  graceMinutes: "",
}, meta);
assert(gone.ok, gone.error || "Employee for deletion was not saved");
assert(recordMovement({ employeeId: gone.id, direction: "in", at: `${today}T09:05:00+04:00`, source: "manual", meta }).ok, "Deleted employee check-in failed");
assert(recordMovement({ employeeId: gone.id, direction: "out", at: `${today}T16:10:00+04:00`, source: "manual", meta }).ok, "Deleted employee check-out failed");
assert(deleteEmployeeRecord(gone.id, meta).ok, "Employee was not deleted");
assert(!listEmployees({ status: "all" }).some((item) => item.id === gone.id), "Deleted employee stayed in the list");
const keptAttendance = get("SELECT check_in, check_out FROM attendance WHERE employee_id = ?", [gone.id]);
assert(keptAttendance.check_in && keptAttendance.check_out, "Deleting an employee erased the attendance used by reports");
const goneReport = buildReport({ from: today, to: today, employeeId: gone.id, dict, periodLabel: "gone" });
assert(goneReport.rows.length === 1 && goneReport.rows[0].employee.includes("Silinən") && goneReport.rows[0].checkIn === "09:05" && goneReport.rows[0].checkOut === "16:10", "A deleted employee left the report");
const report = presentReport(buildReport({
  from: today,
  to: today,
  dict,
  periodLabel: "period",
}), dict, "ru");
assert(report.rows.some((row) => row.employee.includes("Hüseynov") && row.status === dict.attendance.statusLate), "Report row missing");
assert(report.rows.some((row) => row.status === dict.attendance.statusFlex), "Free schedule was missing from the report");
const pdf = await buildPdf(report, "ru");
assert(pdf.subarray(0, 4).toString() === "%PDF", "PDF was not created");
const xlsx = buildXlsx(report);
const xlsxFile = path.join(directory, "report.xlsx");
fs.writeFileSync(xlsxFile, xlsx);
const sheet = execFileSync("unzip", ["-p", xlsxFile, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
assert(sheet.includes("Hüseynov"), "Excel file is missing the employee");

const passwordHash = await hashPassword("Parol12345");
assert(await verifyPassword("Parol12345", passwordHash), "Password verification failed");
assert(!(await verifyPassword("parol12345", passwordHash)), "Password comparison is not exact");
const token = createToken({ id: "user-1", session_version: 2 });
assert(readToken(token)?.sub === "user-1", "Session token failed");
assert(readToken(`${token}x`) === null, "Tampered token was accepted");

const backup = createBackup();
const backupFile = path.join(process.cwd(), backup, "database.db");
assert(fs.existsSync(backupFile) && fs.statSync(backupFile).size > 1024, "Backup database missing");
const restorePath = path.join(directory, "restore.db");
fs.copyFileSync(backupFile, restorePath);
const originalDb = process.env.SMZ_DB_PATH;
closeDb();
process.env.SMZ_DB_PATH = restorePath;
assert(get("SELECT last_name FROM employees WHERE id = ?", [employee.id]).last_name === "Hüseynov", "Restored database lost the employee");
closeDb();
process.env.SMZ_DB_PATH = originalDb;
assert(get("SELECT personnel_number FROM employees WHERE id = ?", [employee.id]).personnel_number === "T-100", "Working database was not reopened");
fs.rmSync(path.join(process.cwd(), backup), { recursive: true, force: true });

assert(identify().ok === false && identify().error === "frame_required", "Recognition invented a result without a frame");
const recognition = recognitionStatus();
assert(recognition.identifies === true && recognition.model === "sface-2021dec-b255" && recognition.livenessCertified === false, "Recognition status is wrong");
assert(recognition.acceptCosine === 0.363, "The published cosine threshold changed");
assert(isOwner({ role: "owner" }) && !isOwner({ role: "admin" }), "Owner role check failed");
const observerPermissions = all("SELECT permission FROM role_permissions WHERE role_key = 'observer'").map((row) => row.permission);
assert(can({ role: "owner", permissions: [] }, "roles.manage"), "Owner lost access");
assert(!can({ role: "observer", permissions: observerPermissions }, "enrollment.manage"), "Observer can manage enrollment");
assert(!can({ role: "observer", permissions: observerPermissions }, "reports.export"), "Observer can export reports");
assert(can({ role: "observer", permissions: observerPermissions }, "attendance.view"), "Observer cannot view attendance");
assert(setRolePermissions("owner", [], meta).error === "owner_locked", "Owner permissions were editable");
const withoutReason = updateAttendance({
  id: board[0].recordId,
  checkIn: `${today}T08:20:00+04:00`,
  checkOut: "",
  note: "",
  reason: "",
  meta,
});
assert(withoutReason.error === "reason_required", "Attendance edit without a reason was accepted");
const corrected = updateAttendance({
  id: board[0].recordId,
  checkIn: `${today}T08:20:00+04:00`,
  checkOut: "",
  note: "",
  reason: "clock was wrong",
  meta,
});
assert(corrected.ok, corrected.error || "Attendance correction failed");
const revision = get("SELECT reason, before_json FROM attendance_revisions WHERE attendance_id = ? AND reason = ?", [board[0].recordId, "clock was wrong"]);
assert(revision.reason === "clock was wrong" && revision.before_json.includes("08:27"), "Original attendance value was not kept");
const automatic = saveEmployee({
  lastName: "Avtomatik",
  firstName: "Nömrə",
  patronymic: "",
  departmentId: "",
  position: "",
  personnelNumber: "",
  phone: "",
  scheduleStart: "",
  scheduleEnd: "",
  graceMinutes: "",
}, meta);
assert(automatic.ok, automatic.error || "Automatic personnel number failed");
assert(get("SELECT personnel_number FROM employees WHERE id = ?", [automatic.id]).personnel_number === "001", "Next personnel number was not 001");
const kept = saveEmployee({
  id: employee.id,
  lastName: "Hüseynov",
  firstName: "Kamran",
  patronymic: "Əli oğlu",
  departmentId: department.id,
  position: "Çilingər",
  personnelNumber: "",
  phone: "+994501112233",
  scheduleStart: "",
  scheduleEnd: "",
  graceMinutes: "",
}, meta);
assert(kept.ok && get("SELECT personnel_number FROM employees WHERE id = ?", [employee.id]).personnel_number === "T-100", "Existing personnel number was cleared");

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 1)]);
const enrollmentToken = "11111111-1111-4111-8111-111111111111";
const enrolled = recordEnrollment({
  employeeId: employee.id,
  clientToken: enrollmentToken,
  mode: "scan",
  poses: ["center", "center", "center", "left", "left", "center", "right", "right", "center"],
  qualityNote: "good",
  photo: { bytes: jpeg, ext: "jpg" },
}, meta);
assert(enrolled.ok && enrolled.photoFile, enrolled.error || "Enrollment was not saved");
const stored = get("SELECT face_status FROM employees WHERE id = ?", [employee.id]);
const session = get("SELECT template_stored, mode FROM face_sessions WHERE employee_id = ?", [employee.id]);
const processing = get("SELECT kind, note FROM processing_events WHERE employee_id = ?", [employee.id]);
assert(stored.face_status === "captured", "Face status was not captured");
assert(session.template_stored === 0 && session.mode === "scan", "A biometric template must not be stored");
assert(processing.kind === "enrollment.captured" && processing.note === "template_not_stored", "Processing note is wrong");
const duplicate = recordEnrollment({
  employeeId: employee.id,
  clientToken: enrollmentToken,
  mode: "scan",
  poses: ["center", "center", "center", "left", "left", "center", "right", "right", "center"],
  qualityNote: "good",
  photo: { bytes: jpeg, ext: "jpg" },
}, meta);
assert(duplicate.ok && duplicate.duplicate, "Repeated enrollment token was not rejected");
assert(all("SELECT id FROM face_sessions WHERE employee_id = ?", [employee.id]).length === 1, "Duplicate enrollment created another session");
const incomplete = recordEnrollment({
  employeeId: employee.id,
  clientToken: "22222222-2222-4222-8222-222222222222",
  mode: "scan",
  poses: ["center"],
  qualityNote: "ok",
  photo: { bytes: jpeg, ext: "jpg" },
}, meta);
assert(!incomplete.ok && incomplete.error === "enrollment_incomplete", "Incomplete scan was accepted");
removePhoto(enrolled.photoFile);

function patternJpeg(seed) {
  const data = Buffer.alloc(112 * 112 * 4);
  for (let pixel = 0; pixel < 112 * 112; pixel += 1) {
    data[pixel * 4] = (seed + pixel * 3) % 255;
    data[pixel * 4 + 1] = (seed * 5 + pixel) % 255;
    data[pixel * 4 + 2] = (255 - seed + pixel) % 255;
    data[pixel * 4 + 3] = 255;
  }
  return Buffer.from(jpegLib.encode({ data, width: 112, height: 112 }, 90).data);
}

const knownJpeg = patternJpeg(20);
const otherJpeg = patternJpeg(180);
const firstEmbed = await embedJpeg(knownJpeg);
const secondEmbed = await embedJpeg(knownJpeg);
const otherEmbed = await embedJpeg(otherJpeg);
assert(firstEmbed.ok && secondEmbed.ok && otherEmbed.ok, firstEmbed.error || "Embedding failed");
assert(cosine(firstEmbed.vector, secondEmbed.vector) > 0.99, "The same face image was not stable");
assert(cosine(firstEmbed.vector, otherEmbed.vector) < 0.99, "A different image matched the same image exactly");
assert(secondEmbed.ms < 1000, `Embedding took ${secondEmbed.ms} ms`);
const embedTimes = [];
for (let round = 0; round < 12; round += 1) embedTimes.push((await embedJpeg(knownJpeg)).ms);
embedTimes.sort((left, right) => left - right);
const embedMedian = embedTimes[Math.floor(embedTimes.length / 2)];
console.log(`SFace embed median ms: ${embedMedian} (embedding only, not the full recognition delay)`);
assert(embedMedian < 1000, "Recognition exceeded one second");
for (let round = 0; round < 300; round += 1) decideMatch([{ employeeId: "a", cosine: 0.4 }]);

function person(lastName, number, scheduleStart = "", scheduleEnd = "") {
  return saveEmployee({
    lastName, firstName: "Üz", patronymic: "", departmentId: department.id, position: "",
    personnelNumber: number, phone: "", scheduleStart, scheduleEnd, graceMinutes: "",
  }, meta);
}
run("UPDATE cameras SET enabled = 1, source_kind = 'usb', device_id = 'usb-entrance', direction = 'entrance' WHERE id = 'camera-entrance'");
run("UPDATE cameras SET enabled = 1, source_kind = 'usb', device_id = 'usb-exit', direction = 'exit' WHERE id = 'camera-exit'");
const { updateCamera } = await import("../lib/settings.js");
const blockedCamera = updateCamera({ id: "camera-exit", source: "usb", deviceId: "usb-entrance", deviceLabel: "Face", enabled: true, direction: "exit" }, meta);
assert(blockedCamera.error === "camera_busy" && blockedCamera.otherCode === "CAM-01", "One device was enabled on both posts");
const movedCamera = updateCamera({ id: "camera-exit", source: "usb", deviceId: "usb-entrance", deviceLabel: "Face", enabled: true, direction: "exit", takeover: true }, meta);
assert(movedCamera.ok, "The camera was not moved to the free post");
assert(get("SELECT enabled, device_id FROM cameras WHERE id = 'camera-entrance'").enabled === 0, "The previous post kept the device");
assert(get("SELECT device_id, direction FROM cameras WHERE id = 'camera-exit'").direction === "exit", "The new direction was not saved");
run("UPDATE cameras SET enabled = 1, source_kind = 'usb', device_id = 'usb-entrance', direction = 'entrance', device_label = '' WHERE id = 'camera-entrance'");
run("UPDATE cameras SET enabled = 1, source_kind = 'usb', device_id = 'usb-exit', direction = 'exit', device_label = '' WHERE id = 'camera-exit'");
const watched = person("Nəzarət", "T-200");
assert(watched.ok, watched.error || "Watched employee failed");
run("UPDATE employees SET biometric_allowed = 1 WHERE id = ?", [watched.id]);
const scanPoints = (index) => [[0.4 + index * 0.004, 0.4], [0.6, 0.4], [0.5, 0.5], [0.42, 0.7], [0.58, 0.7]];
const staticEnrollment = await storeBiometric({
  employeeId: watched.id,
  confirmReplace: false,
  samples: Array.from({ length: 9 }, () => ({ bytes: knownJpeg, points: scanPoints(0) })),
  meta,
});
assert(staticEnrollment.error === "static_sample", "A repeated still frame was enrolled");
const enrolledTemplate = await storeBiometric({
  employeeId: watched.id,
  confirmReplace: false,
  samples: Array.from({ length: 9 }, (_, index) => ({ bytes: patternJpeg(20 + index * 17), points: scanPoints(index) })),
  meta,
});
assert(enrolledTemplate.ok, enrolledTemplate.error || "Moving enrollment did not store a template");
const replaced = saveTemplateVector(watched.id, firstEmbed.vector, meta);
assert(replaced.error === "replace_required", "Template replacement did not ask for confirmation");
const reviewHit = recognizeVector(firstEmbed.vector, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, meta,
});
assert(reviewHit.outcome === "matched" && reviewHit.status === "pending" && !reviewHit.recorded, "Review mode wrote attendance by itself");
const observerUser = { role: "observer", permissions: all("SELECT permission FROM role_permissions WHERE role_key = 'observer'").map((row) => row.permission) };
assert(confirmRecognition(reviewHit.id, meta, observerUser).error === "forbidden", "Observer confirmed a passage");
const confirmed = confirmRecognition(reviewHit.id, meta, { role: "owner", permissions: [] });
assert(confirmed.ok, confirmed.error || "Operator confirmation did not record entry");
const repeated = recognizeVector(firstEmbed.vector, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, meta,
});
assert(repeated.duplicate === true, "The same face immediately created another event");
assert(all("SELECT id FROM attendance WHERE employee_id = ?", [watched.id]).length === 1, "A repeated entrance opened another shift");
const stranger = new Float32Array(128);
stranger[127] = 1;
const unknownHit = recognizeVector(stranger, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, meta,
});
assert(unknownHit.outcome === "unknown" && !unknownHit.recorded && unknownHit.alert?.visual === true && unknownHit.alert.sound === true, "An unknown vector created attendance");
const repeatedUnknown = recognizeVector(stranger, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, meta,
});
assert(repeatedUnknown.duplicate === true && get("SELECT COUNT(*) AS count FROM alert_events WHERE kind = 'unknown'").count === 1, "The unknown alert repeated");
assert(!all("PRAGMA table_info(alert_events)").some((column) => column.name === "image"), "An unknown face image was stored");
const beforeGap = get("SELECT COUNT(*) AS count FROM recognition_events").count;
const unavailable = recognizeVector(null, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.05, meta,
});
assert(unavailable.error === "model_missing" && get("SELECT COUNT(*) AS count FROM recognition_events").count === beforeGap, "A missing model created an event");
assert(updateAlertSettings({
  enabled: true,
  tone: "soft",
  volume: 40,
  cooldownSeconds: 15,
  deviceId: "speakers",
  events: { unknown: true, ambiguous: true, confirmed: false, camera: true },
  cameras: { entrance: true, exit: false },
}, meta).ok, "Alert settings were not saved");
assert(getAlertSettings().tone === "soft" && getAlertSettings().cameras.exit === false, "Alert choices were not stored");
assert(!updateAlertSettings({ enabled: true, tone: "siren", volume: 40, cooldownSeconds: 15, deviceId: "" }, meta).ok, "An unknown sound was accepted");
assert(TONE_IDS.length === 6 && TONE_IDS.at(-1) === "silent", "The sound library is incomplete");
const { classifyDistance } = await import("../lib/face-distance.js");
assert(classifyDistance({ area: 0.02, facePx: 140, sharpness: 40, brightness: 120, yaw: 0.1, centered: false, passage: true }).quality !== "poor", "A usable walking face was rejected");
assert(classifyDistance({ area: 0.2, facePx: 40, sharpness: 40, brightness: 120, yaw: 0, centered: true, passage: true }).code === "far", "A tiny face passed the quality gate");
assert(classifyDistance({ area: 0.03, facePx: 200, sharpness: 90, brightness: 120, yaw: 0, centered: true, passage: false }).code === "far", "Enrollment accepted a small pose");
assert(classifyDistance({ area: 0.2, facePx: 200, sharpness: 4, brightness: 120, yaw: 0, centered: true, passage: true }).code === "blur", "A blurred face was accepted");
assert(!readySample({ samples: 1, bestSharp: 40, face: { aligned: {}, quality: "good", code: "center", sharpness: 40 } }), "The first frame was sent for identification");
assert(readySample({ samples: 2, bestSharp: 40, face: { aligned: {}, quality: "ok", code: "off", sharpness: 32 } }), "A stable off-center face was skipped");
const signalBase = Date.now() + 5000;
const firstPerson = noteSignal("camera-entrance", "matched", "entrance", "person-a", signalBase);
const secondPerson = noteSignal("camera-entrance", "matched", "entrance", "person-b", signalBase + 2000);
const repeatPerson = noteSignal("camera-entrance", "matched", "entrance", "person-a", signalBase + 3000);
assert(firstPerson.visual && firstPerson.kind === "matched" && secondPerson.visual, "Each employee did not get one alert");
assert(repeatPerson.suppressed, "The same employee was alerted again inside the cooldown");
const exitMuted = noteSignal("camera-exit", "unknown", "exit", "stranger-exit", signalBase + 20000);
const entranceHeard = noteSignal("camera-entrance", "unknown", "entrance", "stranger-in", signalBase + 20000);
const entranceAgain = noteSignal("camera-entrance", "unknown", "entrance", "stranger-in", signalBase + 21000);
assert(exitMuted.sound === false, "CAM-02 sounded while its alerts were off");
assert(entranceHeard.sound === true && entranceHeard.kind === "unknown", "CAM-01 did not sound for an unknown face");
assert(entranceAgain.suppressed, "The same unknown face sounded twice");
assert(updateAlertSettings({
  enabled: false,
  tone: "soft",
  volume: 40,
  cooldownSeconds: 15,
  deviceId: "speakers",
  events: { unknown: true, ambiguous: true, confirmed: false, camera: true, matched: true },
  cameras: { entrance: true, exit: false },
}, meta).ok, "The owner could not turn alerts off");
assert(getAlertSettings().enabled === false, "A saved mute was turned back on");
assert(updateAlertSettings({
  enabled: true,
  tone: "soft",
  volume: 40,
  cooldownSeconds: 15,
  deviceId: "speakers",
  events: { unknown: true, ambiguous: true, confirmed: false, camera: true, matched: true },
  cameras: { entrance: true, exit: false },
}, meta).ok, "The owner could not turn alerts back on");
const palm = sampleHand({ index: true, middle: true, ring: true, pinky: true, thumb: true });
const thumb = sampleHand({ thumb: true });
const victory = sampleHand({ index: true, middle: true });
assert(classifyLandmarks(palm).label === "open_palm", "An open palm was not classified");
assert(classifyLandmarks(thumb).label === "thumb_up", "Thumbs up was not classified");
assert(classifyLandmarks(victory).label === "victory", "Victory was not classified");
assert(classifyLandmarks([{ x: 0, y: 0 }]).label === "unclear", "A broken hand became a gesture");
const still = createGestureTracker({ sensitivity: "high", holdMs: 1800, cooldownMs: 1000 });
assert(still.observe([{ landmarks: palm }], 1000).label !== "wave", "One open palm was treated as waving");
const waver = createGestureTracker({ sensitivity: "high", holdMs: 1800, cooldownMs: 0 });
let waved;
for (const [index, x] of [0.2, 0.5, 0.2, 0.5, 0.2].entries()) {
  waved = waver.observe([{ landmarks: palm.map((point) => ({ x: point.x + x - 0.5, y: point.y })) }], 2000 + index * 120);
}
assert(waved.label === "wave" && waved.reaction === "wave", "Waving was not confirmed from motion");
const repeatWave = createGestureTracker({ sensitivity: "high", holdMs: 1800, cooldownMs: 5000 });
const reactions = [];
for (const [index, x] of [0.2, 0.5, 0.2, 0.5, 0.2, 0.5].entries()) {
  const step = repeatWave.observe([{ landmarks: palm.map((point) => ({ x: point.x + x - 0.5, y: point.y })) }], 3000 + index * 120);
  if (step.reaction) reactions.push(step.reaction);
}
assert(reactions.length === 1, "One hand presence produced more than one gesture reaction");
const assist = createGestureTracker({ sensitivity: "high", holdMs: 1800, cooldownMs: 1000 });
let sawAssist = false;
for (let index = 0; index < 8; index += 1) {
  const held = assist.observe([{ landmarks: palm }], 4000 + index * 400);
  if (held.assist && held.label === "open_palm") sawAssist = true;
}
assert(sawAssist, "A held palm did not request assistance");
assert(assist.observe([{ landmarks: palm }], 7200).assist === false, "Assistance repeated while the palm stayed up");
assert(assist.observe([], 7600).label === "none", "A missing hand kept the previous gesture");
assert(gestureSoundAllowed(true) === false && gestureSoundAllowed(false) === true, "A gesture sound overrode an operator alert");
const crowd = createOccupancy();
assert(crowd.push(2, 1).count == null, "One frame became a people count");
const stableCrowd = crowd.push(2, 2);
assert(stableCrowd.count === 2, "Two agreeing frames did not stabilize the count");
assert(crowd.push(2, 3).count === 2, "The same person was counted again on the next frame");
assert(boxesOverlap([{ x: 0, y: 0, width: 10, height: 10 }, { x: 1, y: 1, width: 10, height: 10 }]), "Overlapping people were treated as separate and certain");
assert(getVisionSettings().sound === false, "Gesture sounds were on before the owner enabled them");
assert(updateVisionSettings({ sound: false, tone: "soft", volume: 40, cooldownSeconds: 8, sensitivity: "medium", assistHoldMs: 1800 }, meta).ok, "The owner could not save gesture settings");
assert(getVisionSettings().sound === false, "A saved gesture mute was turned back on");
const attendanceBefore = get("SELECT COUNT(*) AS n FROM attendance").n;
const passagesBefore = get("SELECT COUNT(*) AS n FROM passage_events").n;
const help = createHelpRequest({ cameraId: "camera-entrance", source: "gesture" }, meta);
assert(help.ok && help.request.status === "open", "A help request was not opened");
assert(createHelpRequest({ cameraId: "camera-entrance", source: "button" }, meta).duplicate, "The same camera opened a second help request");
assert(get("SELECT COUNT(*) AS n FROM attendance").n === attendanceBefore && get("SELECT COUNT(*) AS n FROM passage_events").n === passagesBefore, "A gesture wrote attendance");
assert(confirmHelpRequest(help.request.id, meta).ok, "The operator could not confirm help");
assert(closeHelpRequest(help.request.id, meta).ok, "The operator could not close help");
assert(describeGate({ seenAt: 0, cameras: [] }, 10_000).system === "local", "An unused gate was reported as running");
const silentGate = describeGate({ seenAt: 1_000, desired: "running", cameras: [{ id: "camera-entrance", lastFrameAt: 0, ai: "unavailable" }] }, 20_000);
assert(silentGate.system === "agent" && silentGate.cameras[0].state !== "working", "A silent agent was shown as working");
const frameless = describeGate({ seenAt: 20_000, desired: "running", cameras: [{ id: "camera-entrance", lastFrameAt: 0, ai: "ready" }] }, 20_000);
assert(frameless.system === "no-frames" && frameless.cameras[0].state === "no-frames", "A live agent without frames was shown as working");
const relayJpeg = Buffer.alloc(40, 7);
relayJpeg[0] = 0xff;
relayJpeg[1] = 0xd8;
relayJpeg[38] = 0xff;
relayJpeg[39] = 0xd9;
const relayed = noteFrame("camera-entrance", relayJpeg, { width: 1280, height: 720, ai: "unavailable" }, 30_000);
assert(relayed.ok && relayed.sound === null, "A relayed frame started a sound or was rejected");
const relayView = gateSnapshot(30_000);
assert(relayView.system === "no-ai" && relayView.cameras[0].state === "no-ai", "Video without AI was labeled as working");
noteFrame("camera-entrance", relayJpeg, { width: 1280, height: 720, ai: "unavailable" }, 30_400);
assert(get("SELECT COUNT(*) AS n FROM attendance").n === attendanceBefore && get("SELECT COUNT(*) AS n FROM passage_events").n === passagesBefore, "A relayed frame wrote attendance");
noteHeartbeat({ cameras: [{ id: "camera-entrance", ai: "ready" }] }, 30_400);
assert(gateSnapshot(30_400).cameras[0].ai !== "ready", "A heartbeat upgraded AI without a frame");
assert(setGateDesired("stopped", meta).desired === "stopped", "The owner could not stop the gate");
assert(get("SELECT value FROM settings WHERE key = 'gate_desired'").value === "stopped", "The gate stop was not stored");
assert(get("SELECT action FROM audit_log WHERE action = 'gate.control'").action === "gate.control", "The gate stop was not audited");
setGateDesired("running", meta);
process.env.GATE_TOKEN = "gate-token-for-self-check-24";
assert(gateAuthorized(`Bearer ${process.env.GATE_TOKEN}`), "The gate token was rejected");
assert(!gateAuthorized("Bearer gate-token-for-self-check-00"), "A wrong gate token was accepted");
delete process.env.GATE_TOKEN;
const pieces = splitJpeg(Buffer.concat([Buffer.from([1, 2]), relayJpeg, Buffer.from([3])]));
assert(pieces.frames.length === 1 && pieces.frames[0][0] === 0xff && pieces.frames[0][1] === 0xd8, "A JPEG was not split from the camera pipe");
assert(ffmpegArgs({ platform: "darwin", device: "0", fps: 8 }).includes("avfoundation"), "macOS capture does not use AVFoundation");
const macCapture = ffmpegArgs({ platform: "darwin", device: "0", fps: 8 });
assert(macCapture.includes("30") && macCapture.includes("uyvy422") && macCapture.indexOf("-video_size") < macCapture.indexOf("-i"), "macOS capture missed the mode FaceTime accepts");
assert(ffmpegArgs({ platform: "win32", device: "USB Camera" }).includes("dshow"), "Windows capture does not use DirectShow");
assert(ffmpegArgs({ platform: "win32", device: "USB Camera" }).includes("video=USB Camera"), "Windows capture lost the camera name");
{
  const seen = { employeeId: "person-a", outcome: "matched" };
  let visit = stepVisit(null, seen, 1000);
  assert(visit.action === "wait", "The first match opened a card before it repeated");
  visit = stepVisit(visit.track, seen, 1200);
  assert(visit.action === "offer" && visit.track.offered === true, "A repeated match did not open one visit");
  visit = stepVisit(visit.track, seen, 1400);
  const again = stepVisit(visit.track, seen, 2000);
  assert(again.action === "hold", "The same person still in frame opened another visit");
  const gap = stepVisit(again.track, { outcome: "unknown" }, 2600);
  assert(gap.action === "hold", "A short miss ended the visit");
  const gone = stepVisit(gap.track, null, 2600 + 4000);
  assert(gone.action === "left", "Leaving the frame did not end the visit");
  const back = stepVisit(gone.track, seen, 20000);
  const back2 = stepVisit(back.track, seen, 20100);
  assert(back2.action === "offer" && back2.reentry === true, "A return after leaving was merged into the old visit");
  const back3 = stepVisit(back2.track, seen, 20200);
  const other = stepVisit(back3.track, { employeeId: "person-b", outcome: "matched" }, 20300);
  assert(other.action === "hold" && other.track.employeeId === "person-a", "A different person was merged into the open visit");
  assert(stepVisit(null, { employeeId: "person-a", outcome: "ambiguous" }, 1).action === "wait", "An ambiguous face opened a visit");
}
assert(requestGateTone("silent", 60) === false && requestGateTone("soft", 0) === false, "A silent tone was sent to the speaker");
const gateAction = fs.readFileSync(path.join(process.cwd(), "app/actions/gate.js"), "utf8");
const gateFrame = fs.readFileSync(path.join(process.cwd(), "app/api/gate/frame/route.js"), "utf8");
const gateAgent = fs.readFileSync(path.join(process.cwd(), "scripts/gate-agent.js"), "utf8");
assert(gateAction.includes('role !== "owner"'), "A non-owner can stop the gate");
assert(!gateFrame.includes("recognizeJpeg") && !gateAgent.includes("recognizeJpeg") && !gateAgent.includes("getDb"), "The gate relay recognized a face or opened SQLite");
assert(isTensorFlowInfo(TENSORFLOW_INFO) && !isTensorFlowInfo("Error: camera failed") && !isTensorFlowInfo("INFO: something else"), "The TensorFlow filter hid a real error");
const wasmLog = fs.readFileSync(path.join(process.cwd(), "public/vendor/mediapipe/wasm/vision_wasm_internal.js"), "utf8");
const gateStage = fs.readFileSync(path.join(process.cwd(), "components/gate-stage.js"), "utf8");
const appShell = fs.readFileSync(path.join(process.cwd(), "components/app-shell.js"), "utf8");
const visionPage = fs.readFileSync(path.join(process.cwd(), "app/(app)/vision/page.js"), "utf8");
const monitorDeck = fs.readFileSync(path.join(process.cwd(), "components/monitor-deck.js"), "utf8");
assert(wasmLog.includes(TENSORFLOW_INFO) && !wasmLog.includes('indexOf("XNNPACK")'), "The camera log hid every informational line");
assert(!gateStage.includes("GestureRecognizer") && !gateStage.includes("gesture_recognizer") && !gateStage.includes("efficientdet"), "The gate still loads a hand or people model");
const analysisFrame = fs.readFileSync(path.join(process.cwd(), "components/face-vision.js"), "utf8");
const enrollment = fs.readFileSync(path.join(process.cwd(), "components/face-capture.js"), "utf8");
const localPreview = fs.readFileSync(path.join(process.cwd(), "components/camera-preview.js"), "utf8");
assert(analysisFrame.includes("ctx.scale(-1, 1)") && analysisFrame.includes("export function drawAnalysisFrame"), "Enrollment and the gate no longer share one mirrored preparation");
assert(gateStage.includes("drawAnalysisFrame") && gateStage.includes("unmirrorBox") && enrollment.includes("drawAnalysisFrame") && localPreview.includes("drawAnalysisFrame"), "A camera path prepares the face differently from enrollment");
assert(gateStage.includes("face.confidence > 0 && face.confidence < 0.3"), "A missing detector score discarded the aligned face before SFace");
assert(gateStage.includes('face.outcome === "preliminary"'), "The first match name was removed from the live picture");
assert(matchReason({ embedded: false }) === "EMBEDDING_FAILED", "A failed embedding was compared");
assert(matchReason({ templateCount: 0, decryptFailed: 2 }) === "TEMPLATE_DECRYPTION_FAILED", "A broken template was treated as an empty gallery");
assert(matchReason({ templateCount: 0 }) === "NO_TEMPLATES", "An empty gallery was accepted");
assert(matchReason({ templateCount: 9, outcome: "unknown" }) === "BELOW_THRESHOLD", "A weak score was accepted");
assert(matchReason({ templateCount: 9, outcome: "ambiguous" }) === "AMBIGUOUS_MATCH", "An ambiguous pair was accepted");
assert(matchReason({ templateCount: 9, outcome: "matched" }) === "MATCH_CONFIRMED", "A clear match was rejected");
assert(!appShell.includes('href: "/vision"'), "The vision lab stayed in the menu");
assert(visionPage.includes('redirect("/")') && !visionPage.includes("VisionLab"), "The vision lab page still opened a camera");
assert(!fs.existsSync(path.join(process.cwd(), "components/vision-lab.js")), "The vision lab component is still loaded");
run("INSERT INTO settings (key, value, updated_at) VALUES ('ai_hands', '1', '2026-01-01T00:00:00+04:00') ON CONFLICT(key) DO UPDATE SET value = '1'");
assert(getAiSettings().hands === false && getAiSettings().gestures === false && getAiSettings().people === false, "Hand recognition stayed available in the working application");
assert(monitorDeck.includes("!gateKnown"), "The dashboard opened the camera before checking the gate agent");
const account = await createUser({
  username: "stage.user",
  displayName: "Stage User",
  role: "observer",
  password: "Parol12345",
  confirmPassword: "Parol12345",
}, meta);
assert(account.ok, "A user account was not created");
const reset = await resetUserPassword(account.user.id, "Parol54321", "Parol54321", meta);
assert(reset.ok && findUserById(account.user.id).session_version === 2, "A password reset did not close sessions");
run("INSERT INTO users (id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at) VALUES ('own-a','own.a','A','x','owner','ru','dark',1,1,'2026-01-01T00:00:00+04:00','2026-01-01T00:00:00+04:00')");
run("INSERT INTO users (id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at) VALUES ('own-b','own.b','B','x','owner','ru','dark',1,1,'2026-01-01T00:00:00+04:00','2026-01-01T00:00:00+04:00')");
assert(setUserActive("own-a", false, { actor: { id: "own-b", username: "own.b" }, ip: "local" }).ok, "An extra owner could not be disabled");
assert(setUserActive("own-b", false, { actor: { id: "own-a", username: "own.a" }, ip: "local" }).error === "last_admin", "The last owner was disabled");
assert(createPairing(employee.id, meta).error === "biometric_denied", "A phone link was issued without consent");
const promoted = await createUser({
  username: "stage.owner",
  displayName: "Stage Owner",
  role: "owner",
  password: "Parol12345",
  confirmPassword: "Parol12345",
}, meta);
assert(promoted.error === "forbidden", "A non-owner created an owner");
run("DELETE FROM face_templates");
run("UPDATE employees SET face_enrolled = 0");
const twinA = person("OxşarA", "T-201");
const twinB = person("OxşarB", "T-202");
run("UPDATE employees SET biometric_allowed = 1 WHERE id IN (?, ?)", [twinA.id, twinB.id]);
const base = new Float32Array(128);
base[0] = 1;
const near = new Float32Array(128);
near[0] = 0.98;
near[1] = Math.sqrt(1 - 0.98 * 0.98);
assert(saveTemplateVector(twinA.id, base, meta).ok && saveTemplateVector(twinB.id, near, meta).ok, "Similar templates were not stored");
const probe = new Float32Array(128);
probe[0] = 0.995;
probe[1] = Math.sqrt(1 - 0.995 ** 2);
const ambiguous = recognizeVector(probe, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.02, meta,
});
assert(ambiguous.outcome === "ambiguous" && ambiguous.status === "pending", "A close pair was auto-accepted");
assert(!get("SELECT id FROM attendance WHERE employee_id IN (?, ?)", [twinA.id, twinB.id]), "An ambiguous match created attendance");
run("DELETE FROM face_templates");
run("UPDATE employees SET face_enrolled = 0");
const walker = person("Gəzən", "T-203");
run("UPDATE employees SET biometric_allowed = 1 WHERE id = ?", [walker.id]);
const walkerVector = new Float32Array(128);
walkerVector[3] = 1;
assert(saveTemplateVector(walker.id, walkerVector, meta).ok, "Walker template failed");
assert(updateRecognitionMode("diagnostic", meta).mode === "diagnostic", "Diagnostic mode was not saved");
const beforeDiagnostic = get("SELECT COUNT(*) AS count FROM recognition_events").count;
const diagnosticHit = recognizeVector(walkerVector, { cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.05, meta });
assert(diagnosticHit.probe === true && !diagnosticHit.id && get("SELECT COUNT(*) AS count FROM recognition_events").count === beforeDiagnostic, "Diagnostic mode wrote an event");
assert(updateRecognitionMode("pilot", meta).mode === "pilot", "Pilot mode was not saved");
const stillFrame = recognizeVector(walkerVector, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0, meta,
});
assert(stillFrame.status === "pending" && !stillFrame.recorded, "A still frame auto-committed attendance");
assert(!get("SELECT check_in FROM attendance WHERE employee_id = ?", [walker.id])?.check_in, "Screen-like stillness created a check-in");
const moving = recognizeVector(walkerVector, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.05, latencyMs: 42, meta,
});
assert(moving.recorded && moving.latencyMs === 42 && get("SELECT check_in FROM attendance WHERE employee_id = ?", [walker.id])?.check_in, "A moving match did not record entry");
const follower = person("Ardıcıl", "T-205");
run("UPDATE employees SET biometric_allowed = 1 WHERE id = ?", [follower.id]);
const followerVector = new Float32Array(128);
followerVector[5] = 1;
assert(saveTemplateVector(follower.id, followerVector, meta).ok, "Second passer template failed");
const followed = recognizeVector(followerVector, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.05, meta,
});
assert(followed.recorded && get("SELECT check_in FROM attendance WHERE employee_id = ?", [follower.id])?.check_in, "The second passer was lost");
assert(get("SELECT check_in FROM attendance WHERE employee_id = ?", [walker.id])?.check_in, "The first passer was replaced");
const left = recognizeVector(walkerVector, {
  cameraId: "camera-exit", faceCount: 1, quality: "good", motion: 0.05, meta,
});
assert(left.recorded && get("SELECT check_out FROM attendance WHERE employee_id = ?", [walker.id])?.check_out, "Exit was not recorded");
run("UPDATE recognition_events SET created_at = '2026-11-19T00:00:01+04:00'");
const returned = recognizeVector(walkerVector, {
  cameraId: "camera-entrance",
  faceCount: 1,
  quality: "good",
  motion: 0.05,
  at: bakuStamp(new Date(Date.now() + 20 * 60 * 1000)).iso,
  meta,
});
assert(returned.ok, returned.error || "Return was rejected");
const back = get("SELECT check_in, check_out FROM attendance WHERE employee_id = ?", [walker.id]);
assert(back.check_in && !back.check_out && all("SELECT id FROM attendance WHERE employee_id = ?", [walker.id]).length === 1, "Return opened a second shift");
const early = person("Çıxış", "T-204");
run("UPDATE employees SET biometric_allowed = 1 WHERE id = ?", [early.id]);
const earlyVector = new Float32Array(128);
earlyVector[4] = 1;
assert(saveTemplateVector(early.id, earlyVector, meta).ok, "Early-exit template failed");
const exitFirst = recognizeVector(earlyVector, {
  cameraId: "camera-exit", faceCount: 1, quality: "good", motion: 0.05, meta,
});
assert(!exitFirst.recorded && !get("SELECT id FROM attendance WHERE employee_id = ?", [early.id]), "Exit without entry created attendance");
run("UPDATE cameras SET device_id = 'same-device' WHERE id IN ('camera-entrance', 'camera-exit')");
const conflicted = recognizeVector(earlyVector, {
  cameraId: "camera-entrance", faceCount: 1, quality: "good", motion: 0.05, meta,
});
assert(conflicted.note === "camera_conflict" && !conflicted.recorded, "One device assigned to both posts still recorded attendance");
run("UPDATE cameras SET device_id = 'usb-exit', source_kind = 'ip', host = '10.0.0.8' WHERE id = 'camera-exit'");
const ipCamera = recognizeVector(earlyVector, {
  cameraId: "camera-exit", faceCount: 1, quality: "good", motion: 0.05, meta,
});
assert(ipCamera.error === "ip_stream_unavailable", "An IP camera without a stream created a result");
const revoked = deleteEmployeeTemplates(walker.id, meta);
assert(revoked.ok && get("SELECT face_enrolled, biometric_allowed FROM employees WHERE id = ?", [walker.id]).face_enrolled === 0, "Revoked biometrics stayed active");
const preview = previewDemoPurge();
assert(preview.total === 0, "Real rows were marked as demo data");
assert(purgeDemoData(meta, observerUser, "purge-demo").error === "forbidden", "A non-owner purged data");
assert(purgeDemoData(meta, { role: "owner" }, "no").error === "purge_denied", "Purge ran without the confirmation phrase");
const emptyPurge = purgeDemoData(meta, { role: "owner" }, "purge-demo");
assert(emptyPurge.empty === true && get("SELECT id FROM employees WHERE id = ?", [employee.id]), "Empty purge removed a real employee");
assert(clearOwnerData(meta, observerUser, "clear-data", ["logs"]).error === "forbidden", "A non-owner cleared the log");
assert(clearOwnerData(meta, { role: "owner" }, "no", ["logs"]).error === "purge_denied", "Log clear ran without the confirmation phrase");
const cleared = clearOwnerData(meta, { role: "owner" }, "clear-data", ["logs"]);
assert(cleared.ok && get("SELECT COUNT(*) AS count FROM audit_log").count === 1, "Clearing the log did not leave the clear record");
assert(get("SELECT id FROM users WHERE username = 'check' OR role = 'owner'") || get("SELECT id FROM employees WHERE id = ?", [employee.id]), "Operational data was removed with the log");
if (cleared.backup) fs.rmSync(path.join(process.cwd(), cleared.backup), { recursive: true, force: true });
closeDb();
assert(get("SELECT last_name FROM employees WHERE id = ?", [employee.id]).last_name === "Hüseynov", "Data did not survive restart");
const restoredAlert = getAlertSettings();
assert(restoredAlert.enabled === true && restoredAlert.volume === 40 && restoredAlert.deviceId === "speakers", "Alert settings did not survive restart");
assert(updateDashboardCameras({ visible: false, layout: "expanded" }, meta).visible === false, "Dashboard cameras were not hidden");
closeDb();
assert(get("SELECT value FROM settings WHERE key = 'dashboard_cameras'").value === "0", "Dashboard camera setting did not survive restart");
assert(selectLiveCameras([{ enabled: false, deviceId: "", sourceKind: "usb", host: "" }]).length === 1, "An unassigned camera was hidden");
assert(selectLiveCameras([{ enabled: true, deviceId: "", sourceKind: "usb", host: "" }, { enabled: false, deviceId: "", sourceKind: "usb", host: "" }]).length === 2, "A disabled post disappeared");
assert(isStreamCamera({ enabled: true, deviceId: "a", sourceKind: "usb" }) && !isStreamCamera({ enabled: false, deviceId: "a", sourceKind: "usb" }), "A disabled camera was treated as live");
const onePost = planMonitorStart([
  { id: "camera-entrance", code: "CAM-01", direction: "entrance", sourceKind: "usb", deviceId: "face", deviceLabel: "FaceTime" },
  { id: "camera-exit", code: "CAM-02", direction: "exit", sourceKind: "usb", deviceId: "", deviceLabel: "" },
], [{ deviceId: "face", label: "FaceTime" }]);
assert(onePost.ok && onePost.runs.length === 1 && onePost.runs[0].id === "camera-entrance", "One assigned camera did not start alone");
const twoPosts = planMonitorStart([
  { id: "camera-entrance", code: "CAM-01", direction: "entrance", sourceKind: "usb", deviceId: "a", deviceLabel: "A" },
  { id: "camera-exit", code: "CAM-02", direction: "exit", sourceKind: "usb", deviceId: "b", deviceLabel: "B" },
], [{ deviceId: "a", label: "A" }, { deviceId: "b", label: "B" }]);
assert(twoPosts.ok && twoPosts.runs.length === 2, "Two different cameras did not both start");
const sharedPost = planMonitorStart([
  { id: "camera-entrance", code: "CAM-01", direction: "entrance", sourceKind: "usb", deviceId: "face", deviceLabel: "FaceTime" },
  { id: "camera-exit", code: "CAM-02", direction: "exit", sourceKind: "usb", deviceId: "old", deviceLabel: "FaceTime" },
], [{ deviceId: "face", label: "FaceTime" }]);
assert(sharedPost.ok === false && sharedPost.error === "same_device" && sharedPost.choices.length === 2, "One physical camera was allowed on both posts");
const picked = planMonitorStart([
  { id: "camera-entrance", code: "CAM-01", direction: "entrance", sourceKind: "usb", deviceId: "face", deviceLabel: "FaceTime" },
  { id: "camera-exit", code: "CAM-02", direction: "exit", sourceKind: "usb", deviceId: "face", deviceLabel: "FaceTime" },
], [{ deviceId: "face", label: "FaceTime" }], "camera-exit");
assert(picked.ok && picked.runs.length === 1 && picked.runs[0].id === "camera-exit", "A chosen direction did not start alone");
const none = planMonitorStart([
  { id: "camera-entrance", code: "CAM-01", direction: "entrance", sourceKind: "usb", deviceId: "", deviceLabel: "" },
], []);
assert(none.ok === false && none.error === "no_device", "A missing camera started");
const partial = planMonitorStart([
  { id: "camera-entrance", code: "CAM-01", direction: "entrance", sourceKind: "usb", deviceId: "a", deviceLabel: "A" },
  { id: "camera-exit", code: "CAM-02", direction: "exit", sourceKind: "usb", deviceId: "gone", deviceLabel: "Gone" },
], [{ deviceId: "a", label: "A" }]);
assert(partial.ok && partial.runs.length === 1 && partial.missing.includes("camera-exit"), "A missing second camera stopped the first");
const stoppedCamera = updateCamera({ id: "camera-entrance", source: "usb", deviceId: "kept-device", deviceLabel: "Kept", enabled: false, direction: "entrance" }, meta);
assert(stoppedCamera.ok, "Stopping a camera failed");
assert(get("SELECT device_id, device_label, enabled FROM cameras WHERE id = 'camera-entrance'").device_id === "kept-device", "Stopping cleared the saved camera");
assert(get("SELECT enabled FROM cameras WHERE id = 'camera-entrance'").enabled === 0, "Stopping left the camera enabled");
assert(aiStatusKey({ enabled: false, sourceKind: "usb" }, null) === "cameraOff", "A disabled camera looked active");

closeDb();

const oldPath = path.join(directory, "old.db");
process.env.SMZ_DB_PATH = oldPath;
const { DatabaseSync } = await import("node:sqlite");
const old = new DatabaseSync(oldPath);
old.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'observer')),
    locale TEXT NOT NULL DEFAULT 'az',
    theme TEXT NOT NULL DEFAULT 'light',
    active INTEGER NOT NULL DEFAULT 1,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO users (id, username, display_name, password_hash, role, locale, theme, active, session_version, created_at, updated_at) VALUES
    ('u-admin', 'owneruser', 'Owner', 'hash', 'admin', 'ru', 'light', 1, 1, '2026-01-01T00:00:00+04:00', '2026-01-01T00:00:00+04:00'),
    ('u-hr', 'hruser', 'Daily', 'hash', 'hr', 'az', 'dark', 1, 1, '2026-01-01T00:00:00+04:00', '2026-01-01T00:00:00+04:00'),
    ('u-observer', 'observeruser', 'View', 'hash', 'observer', 'az', 'light', 1, 1, '2026-01-01T00:00:00+04:00', '2026-01-01T00:00:00+04:00');
  CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    patronymic TEXT NOT NULL DEFAULT '',
    department_id TEXT,
    position TEXT NOT NULL DEFAULT '',
    personnel_number TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    photo_file TEXT,
    schedule_start TEXT,
    schedule_end TEXT,
    grace_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    search_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO employees (id, first_name, last_name, personnel_number, status, search_text, created_at, updated_at)
    VALUES ('emp-old', 'Aygün', 'Quliyev', 'T-9', 'active', 'quliyev', '2026-01-01T00:00:00+04:00', '2026-01-01T00:00:00+04:00');
  CREATE TABLE cameras (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    direction TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    host TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  INSERT INTO cameras (id, code, direction, enabled, host, updated_at)
    VALUES ('camera-entrance', 'CAM-01', 'entrance', 0, '', '2026-01-01T00:00:00+04:00');
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00+04:00');
`);
old.close();
const backupRoot = path.join(process.cwd(), "data", "backups");
const backupsBefore = new Set(fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot) : []);
getDb();
const migratedUsers = all("SELECT username, role FROM users ORDER BY username");
const migratedEmployee = get("SELECT last_name, face_status FROM employees WHERE id = ?", ["emp-old"]);
const cameraColumns = all("PRAGMA table_info(cameras)").map((column) => column.name);
assert(migratedUsers.find((user) => user.username === "owneruser")?.role === "owner", "Existing admin was not kept as owner");
assert(migratedUsers.find((user) => user.username === "hruser")?.role === "admin", "Existing hr was not kept as admin");
assert(migratedUsers.find((user) => user.username === "observeruser")?.role === "observer", "Observer account changed");
assert(migratedEmployee.last_name === "Quliyev" && migratedEmployee.face_status === "none", "Existing employee was not preserved");
assert(cameraColumns.includes("source_kind") && cameraColumns.includes("device_id"), "Camera source columns were not added");
const createdBackups = fs.readdirSync(backupRoot).filter((name) => name.startsWith("pre-migrate-") && !backupsBefore.has(name));
assert(createdBackups.length === 1, "Migration backup was not created");
for (const name of createdBackups) fs.rmSync(path.join(backupRoot, name), { recursive: true, force: true });
closeDb();
fs.rmSync(directory, { recursive: true, force: true });
console.log("Self-check passed");
