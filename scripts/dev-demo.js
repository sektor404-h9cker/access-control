import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const demoPath = path.resolve("data/demo.db");
if (!fs.existsSync(demoPath)) {
  console.error("Demo database is missing. Run: npm run demo:seed");
  process.exit(1);
}
const database = new DatabaseSync(demoPath, { readOnly: true });
const mode = database.prepare("SELECT value FROM settings WHERE key = 'data_mode'").get();
database.close();
if (mode?.value !== "demo") {
  console.error("Refusing to start: this file is not marked as a demo database.");
  process.exit(1);
}

process.env.SMZ_DB_PATH = demoPath;
const prepare = spawn(process.execPath, ["scripts/ensure-env.js"], { stdio: "inherit", env: process.env });
prepare.on("exit", (code) => {
  if (code) process.exit(code);
  const next = spawn("npx", ["next", "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    stdio: "inherit",
    env: process.env,
  });
  next.on("exit", (nextCode) => process.exit(nextCode ?? 0));
});
