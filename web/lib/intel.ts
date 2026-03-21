// ── Threat Intelligence ──
// Each provider is optional — only runs if the relevant API key is set.
// Score is additive: higher = more malicious.

export interface IntelResult {
  abuseipdb?: { score: number; totalReports: number; countryCode: string };
  crowdsec?: { behaviors: string[]; score: number };
  otx?: { pulseCount: number };
  totalScore: number;
  sources: string[];
}

// ── AbuseIPDB ──

async function checkAbuseIPDB(ip: string): Promise<IntelResult["abuseipdb"] | undefined> {
  const key = process.env.ABUSEIPDB_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      { headers: { Key: key, Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return undefined;
    const json = await res.json();
    return {
      score: json.data.abuseConfidenceScore,
      totalReports: json.data.totalReports,
      countryCode: json.data.countryCode,
    };
  } catch { return undefined; }
}

// ── CrowdSec CTI ──

async function checkCrowdSec(ip: string): Promise<IntelResult["crowdsec"] | undefined> {
  const key = process.env.CROWDSEC_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetch(
      `https://cti.api.crowdsec.net/v2/smoke/${encodeURIComponent(ip)}`,
      { headers: { "x-api-key": key, Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    if (res.status === 404) return undefined; // unknown IP is clean
    if (!res.ok) return undefined;
    const json = await res.json();
    const behaviors: string[] = (json.behaviors || []).map((b: { name: string }) => b.name);
    const score = Math.min(100, behaviors.length * 20);
    return { behaviors, score };
  } catch { return undefined; }
}

// ── AlienVault OTX ──

async function checkOTX(ip: string): Promise<IntelResult["otx"] | undefined> {
  const key = process.env.OTX_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetch(
      `https://otx.alienvault.com/api/v1/indicators/IPv4/${encodeURIComponent(ip)}/general`,
      { headers: { "X-OTX-API-KEY": key }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return undefined;
    const json = await res.json();
    return { pulseCount: json.pulse_info?.count ?? 0 };
  } catch { return undefined; }
}

// ── Aggregate ──

export async function checkIP(ip: string): Promise<IntelResult> {
  const [abuseipdb, crowdsec, otx] = await Promise.all([
    checkAbuseIPDB(ip),
    checkCrowdSec(ip),
    checkOTX(ip),
  ]);

  let totalScore = 0;
  const sources: string[] = [];

  if (abuseipdb) {
    totalScore += abuseipdb.score;
    if (abuseipdb.score > 0) sources.push("AbuseIPDB");
  }
  if (crowdsec) {
    totalScore += crowdsec.score;
    if (crowdsec.score > 0) sources.push("CrowdSec");
  }
  if (otx) {
    totalScore += Math.min(50, otx.pulseCount * 10);
    if (otx.pulseCount > 0) sources.push("AlienVault OTX");
  }

  return { abuseipdb, crowdsec, otx, totalScore: Math.min(100, totalScore), sources };
}

export function intelEnabled(): boolean {
  return !!(process.env.ABUSEIPDB_API_KEY || process.env.CROWDSEC_API_KEY || process.env.OTX_API_KEY);
}
