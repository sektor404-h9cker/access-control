import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), ".env.local");
const secretLine = () => `SESSION_SECRET=${randomBytes(32).toString("base64url")}`;

if (!fs.existsSync(file)) {
  fs.writeFileSync(file, `${secretLine()}\n`, { mode: 0o600 });
  console.log("Created .env.local");
} else {
  const current = fs.readFileSync(file, "utf8");
  if (!/^SESSION_SECRET=\S{32,}/m.test(current)) {
    fs.appendFileSync(file, `\n${secretLine()}\n`);
    console.log("Added SESSION_SECRET to .env.local");
  }
}

try {
  fs.chmodSync(file, 0o600);
} catch {
  // The file remains usable if the filesystem does not support this mode.
}
