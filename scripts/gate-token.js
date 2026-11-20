import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "data", "gate.token");
if (!fs.existsSync(file)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${randomBytes(32).toString("base64url")}\n`, { mode: 0o600 });
  console.log("Created data/gate.token");
} else {
  console.log("data/gate.token already exists");
}
