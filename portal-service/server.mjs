import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { createPortal } from "./app.mjs";
import { openDatabase } from "./db.mjs";

const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 4120),
  database: process.env.PORTAL_DB ?? "/var/lib/eskay-portal-api/portal.db",
  filesDir: process.env.PORTAL_FILES ?? "/var/lib/eskay-portal-api/files",
  origins: new Set((process.env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean)),
};
if (!config.origins.size || !Number.isInteger(config.port)) throw new Error("Invalid service configuration");

mkdirSync(config.filesDir, { recursive: true });
const db = openDatabase(config.database);
const portal = createPortal({ db, filesDir: config.filesDir, origins: config.origins });

const HOUR = 60 * 60 * 1000;
setInterval(() => portal.sweepFailures(), 15 * 60 * 1000).unref();
setInterval(() => portal.sweepOrphanFiles().catch((error) => console.error("Orphan file sweep failed", error.message)), HOUR).unref();

createServer(portal.handle).listen(config.port, config.host, () => {
  console.log(`ESKAY portal API listening on ${config.host}:${config.port}; allowed origins: ${[...config.origins].join(", ")}`);
});
