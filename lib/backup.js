import fs from "node:fs";
import path from "node:path";
import { getDb, getDbPath } from "./db.js";
import { bakuStamp } from "./time.js";

export function latestBackupName() {
  const directory = path.join(process.cwd(), "data", "backups");
  if (!fs.existsSync(directory)) return null;
  const names = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("smz-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return names[0] || null;
}

export function createBackup() {
  const stamp = bakuStamp();
  const folderName = `smz-${stamp.date.replaceAll("-", "")}-${stamp.iso.slice(11, 19).replaceAll(":", "")}`;
  let folder = path.join(process.cwd(), "data", "backups", folderName);
  if (fs.existsSync(folder)) folder = `${folder}-${Math.random().toString(36).slice(2, 6)}`;
  fs.mkdirSync(path.join(folder, "photos"), { recursive: true });
  const dbFile = path.join(folder, "database.db");
  const database = getDb();
  try {
    database.exec(`VACUUM INTO '${dbFile.replaceAll("'", "''")}'`);
  } catch {
    database.exec("PRAGMA wal_checkpoint(FULL)");
    fs.copyFileSync(getDbPath(), dbFile);
  }
  const keyFile = path.join(process.cwd(), "data", "biometric.key");
  if (fs.existsSync(/* turbopackIgnore: true */ keyFile) && fs.statSync(/* turbopackIgnore: true */ keyFile).isFile()) {
    fs.copyFileSync(keyFile, path.join(folder, "biometric.key"));
    fs.chmodSync(path.join(folder, "biometric.key"), 0o600);
  }
  const photos = path.join(process.cwd(), "data", "photos");
  if (fs.existsSync(photos)) {
    for (const name of fs.readdirSync(photos)) {
      if (name.startsWith(".")) continue;
      const source = path.join(photos, name);
      if (fs.statSync(source).isFile()) fs.copyFileSync(source, path.join(folder, "photos", name));
    }
  }
  return path.relative(process.cwd(), folder);
}
