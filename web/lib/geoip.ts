import maxmind, { CityResponse, Reader } from "maxmind";
import fs from "fs";

let reader: Reader<CityResponse> | null = null;

const GEOIP_DB_PATH = process.env.GEOIP_DB_PATH!;

async function getReader(): Promise<Reader<CityResponse> | null> {
  if (reader) return reader;

  if (!GEOIP_DB_PATH || !fs.existsSync(GEOIP_DB_PATH)) {
    return null;
  }

  reader = await maxmind.open<CityResponse>(GEOIP_DB_PATH);
  return reader;
}

export interface GeoIPResult {
  country?: string;
  country_code?: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
}

export async function lookupIP(ip: string): Promise<GeoIPResult> {
  const r = await getReader();
  if (!r) return {};

  try {
    const result = r.get(ip);
    if (!result) return {};

    return {
      country: result.country?.names?.en,
      country_code: result.country?.iso_code,
      city: result.city?.names?.en,
      lat: result.location?.latitude,
      lon: result.location?.longitude,
      timezone: result.location?.time_zone,
    };
  } catch {
    return {};
  }
}

/**
 * Extract the real client IP from the request.
 * Priority order:
 *  1. cf-connecting-ip  — Cloudflare Tunnel (trusted, set by CF edge)
 *  2. x-forwarded-for   — Standard proxy header (first IP in chain)
 *  3. x-real-ip         — Alternative proxy header
 *  4. 127.0.0.1         — Fallback
 */
export function getClientIP(request: Request): string {
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP.trim();

  return "127.0.0.1";
}
