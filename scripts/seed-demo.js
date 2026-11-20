import fs from "node:fs";
import path from "node:path";

const demoPath = path.resolve("data/demo.db");
if (path.basename(demoPath) !== "demo.db") {
  console.error("Refusing to seed a database that is not demo.db");
  process.exit(1);
}
if (fs.existsSync(demoPath) && !process.argv.includes("--reset")) {
  console.error("data/demo.db already exists. Replace it with: npm run demo:seed -- --reset");
  process.exit(1);
}
if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${demoPath}${suffix}`, { force: true });
}
process.env.SMZ_DB_PATH = demoPath;
const { seedDemo } = await import("../lib/demo-seed.js");
const { closeDb } = await import("../lib/db.js");
const password = await seedDemo();
closeDb();
console.log("Demo database: data/demo.db");
console.log("Username: demo");
console.log(`Password: ${password}`);
console.log("Start it with: npm run dev:demo");
