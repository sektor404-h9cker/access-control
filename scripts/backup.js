import { writeAudit } from "../lib/audit.js";
import { createBackup } from "../lib/backup.js";

const folder = createBackup();
writeAudit({ username: "cli", action: "backup.create", entity: "backup", details: { folder }, ip: "local" });
console.log(folder);
