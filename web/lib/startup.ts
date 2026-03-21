import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const GEOIP_DB_PATH = process.env.GEOIP_DB_PATH!;
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH!;
const GEOIP_URL = "https://cdn.jsdelivr.net/npm/geolite2-city/GeoLite2-City.mmdb.gz";

/**
 * Called once on server start via instrumentation.ts register().
 * Ensures the data directory, SQLite DB, and GeoIP database are ready.
 */
export async function bootstrap(): Promise<void> {
  ensureDataDir();
  ensureSQLite();
  await ensureGeoIP();
}

// ── Data Directory ──

function ensureDataDir(): void {
  for (const filePath of [GEOIP_DB_PATH, SQLITE_DB_PATH]) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[startup] Created directory: ${dir}`);
    }
  }
}

// ── SQLite ──
// The DB is auto-created by better-sqlite3 on first open + migrate(),
// but we log it here for visibility.

function ensureSQLite(): void {
  if (fs.existsSync(SQLITE_DB_PATH)) {
    console.log(`[startup] SQLite ready: ${SQLITE_DB_PATH}`);
  } else {
    console.log(`[startup] SQLite will be created on first access: ${SQLITE_DB_PATH}`);
  }
}

// ── GeoIP Database ──

async function ensureGeoIP(): Promise<void> {
  if (fs.existsSync(GEOIP_DB_PATH)) {
    const stats = fs.statSync(GEOIP_DB_PATH);
    const ageDays = (Date.now() - stats.mtimeMs) / 86_400_000;
    const sizeMB = (stats.size / 1_048_576).toFixed(1);
    console.log(`[startup] GeoIP ready: ${GEOIP_DB_PATH} (${sizeMB} MB, ${Math.floor(ageDays)}d old)`);
    return;
  }

  console.log(`[startup] GeoIP not found at ${GEOIP_DB_PATH} — downloading…`);

  try {
    const gzPath = `${GEOIP_DB_PATH}.gz`;
    execSync(`wget -q -O "${gzPath}" "${GEOIP_URL}"`, { timeout: 120_000 });
    execSync(`gunzip -f "${gzPath}"`, { timeout: 30_000 });
    const sizeMB = (fs.statSync(GEOIP_DB_PATH).size / 1_048_576).toFixed(1);
    console.log(`[startup] GeoIP downloaded: ${GEOIP_DB_PATH} (${sizeMB} MB)`);
  } catch (err) {
    console.error(`[startup] GeoIP download failed — GeoIP will be disabled:`, err);
  }
}
