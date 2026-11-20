import { randomBytes } from "node:crypto";
import path from "node:path";
import { recordMovement } from "./attendance.js";
import { run } from "./db.js";
import { saveDepartment } from "./departments.js";
import { saveEmployee } from "./employees.js";
import { addDays, bakuStamp, todayKey } from "./time.js";
import { createUser } from "./users.js";
import { getDbPath } from "./db.js";

export async function seedDemo() {
  if (path.basename(getDbPath()) !== "demo.db") {
    throw new Error("Demo seed can only write to demo.db");
  }
  const meta = { actor: { id: null, username: "demo-seed" }, ip: "local" };
  const password = `${randomBytes(9).toString("base64url")}a1`;
  const admin = await createUser({
    username: "demo",
    displayName: "DEMO Administrator",
    password,
    confirmPassword: password,
    role: "owner",
    locale: "az",
    theme: "light",
  }, meta);
  if (!admin.ok) throw new Error(admin.error || "demo user");
  const mechanical = saveDepartment({
    name: "DEMO-Mexaniki şöbə",
    scheduleStart: "08:15",
    scheduleEnd: "16:30",
    graceMinutes: "5",
  }, meta);
  const electric = saveDepartment({ name: "DEMO-Elektrik şöbəsi" }, meta);
  if (!mechanical.ok || !electric.ok) throw new Error("demo departments");
  const people = [
    ["DEMO-Əliyev", "Kamran", "Vəli oğlu", mechanical.id, "Çilingər", "DEMO-1001"],
    ["DEMO-Məmmədova", "Aygün", "Rəşid qızı", mechanical.id, "Usta", "DEMO-1002"],
    ["DEMO-Həsənov", "Elçin", "", electric.id, "Elektrik", "DEMO-1003"],
    ["DEMO-Quliyeva", "Nigar", "", electric.id, "Mühəndis", "DEMO-1004"],
  ].map(([lastName, firstName, patronymic, departmentId, position, personnelNumber]) => {
    const saved = saveEmployee({
      lastName, firstName, patronymic, departmentId, position, personnelNumber,
      phone: "", scheduleStart: "", scheduleEnd: "", graceMinutes: "",
    }, meta);
    if (!saved.ok) throw new Error(saved.error || "demo employee");
    return saved.id;
  });
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const at = (date, time) => `${date}T${time}:00+04:00`;
  const movements = [
    [people[0], "in", at(today, "08:27")],
    [people[1], "in", at(today, "08:10")],
    [people[1], "out", at(today, "16:05")],
    [people[2], "in", at(yesterday, "08:40")],
    [people[2], "out", at(yesterday, "16:30")],
  ];
  for (const [employeeId, direction, stamp] of movements) {
    const result = recordMovement({ employeeId, direction, at: stamp, source: "manual", meta });
    if (!result.ok) throw new Error(result.error || "demo attendance");
  }
  const now = bakuStamp().iso;
  run("UPDATE settings SET value = 'demo', updated_at = ? WHERE key = 'data_mode'", [now]);
  run("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'enterprise_name'", [
    "Suraxanı Maşınqayırma Zavodu (DEMO)",
    now,
  ]);
  return password;
}
