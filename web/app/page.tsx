"use client";

import { useState, useEffect, useCallback } from "react";
import { NavHeader } from "@/app/components/NavHeader";

// ── Types ──

interface BanRecord {
  ip: string; jail: string; server: string; timestamp: string;
  bantime: number; country?: string; city?: string; lat?: string; lon?: string;
}
interface AuditEntry { action: string; ip: string; jail?: string; server?: string; actor?: string; timestamp: string; }
interface DashboardData {
  stats: { totalBans: number; whitelistedIPs: number; eventsToday: number; topJail: string; };
  bans: BanRecord[];
  jailDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  recentEvents: AuditEntry[];
}
interface MeData { username: string; role: string; ip: string; country?: string; city?: string; }
interface TimelinePoint { date: string; count: number; }

// ── Helpers ──

const COLORS = ["#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316","#6366f1"];

function ago(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function expiry(ts: string, bt: number) {
  const d = new Date(ts).getTime() + bt * 1000 - Date.now();
  if (d < 0) return "Expired";
  const days = Math.floor(d / 86400000); if (days) return `${days}d left`;
  const hrs = Math.floor(d / 3600000); if (hrs) return `${hrs}h left`;
  return `${Math.floor(d / 60000)}m left`;
}
function actionColor(a: string) {
  if (a.includes("unban")) return "text-success";
  if (a.includes("ban")) return "text-danger";
  if (a.includes("whitelist")) return "text-accent";
  return "text-foreground";
}

// ── SVG Charts ──

function PieChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-center text-muted text-sm py-4">No data</div>;
  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = 50 + 40 * Math.cos(angle), y1 = 50 + 40 * Math.sin(angle);
    angle += sweep;
    const x2 = 50 + 40 * Math.cos(angle), y2 = 50 + 40 * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { path: `M50,50 L${x1},${y1} A40,40 0 ${large},1 ${x2},${y2} Z`, color: COLORS[i % COLORS.length], label: d.label, value: d.value };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#12121a" strokeWidth="1" />)}
        <circle cx="50" cy="50" r="22" fill="#12121a" />
        <text x="50" y="55" textAnchor="middle" fill="#e4e4eb" fontSize="12" fontWeight="bold">{total}</text>
      </svg>
      <div className="space-y-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-muted truncate">{s.label}</span>
            <span className="font-mono ml-auto">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Timeline({ data }: { data: TimelinePoint[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 400, H = 60;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / max) * (H - 4) - 2;
    return { x, y, ...d };
  });
  const area = `M${pts[0].x},${H} ` + pts.map(p => `L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length - 1].x},${H} Z`;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tg)" />
        <path d={line} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Ban Modal ──

function BanModal({ jails, onBan, onClose }: {
  jails: string[];
  onBan: (ip: string, jail: string, bantime: number) => Promise<void>;
  onClose: () => void;
}) {
  const [ip, setIp] = useState("");
  const [jail, setJail] = useState(jails[0] || "manual");
  const [bantime, setBantime] = useState(86400);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
    if (!ipv4.test(ip)) { setError("Invalid IPv4 address"); return; }
    setLoading(true);
    try { await onBan(ip, jail, bantime); onClose(); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="font-semibold">Ban IP Address</h2>
        <div>
          <label className="block text-sm text-muted mb-1.5">IP Address</label>
          <input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="1.2.3.4" className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-danger" autoFocus />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1.5">Jail</label>
          <select value={jail} onChange={e => setJail(e.target.value)} className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent">
            <option value="manual">manual</option>
            {jails.filter(j => j !== "manual").map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1.5">Duration</label>
          <select value={bantime} onChange={e => setBantime(Number(e.target.value))} className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent">
            <option value={3600}>1 hour</option>
            <option value={86400}>24 hours</option>
            <option value={604800}>7 days</option>
            <option value={2592000}>30 days</option>
            <option value={6048000}>70 days</option>
          </select>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-card-border text-sm rounded-lg hover:bg-card-border/20 transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading} className="flex-1 py-2 bg-danger hover:bg-danger-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {loading ? "Banning…" : "Ban IP"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [jailFilter, setJailFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [tab, setTab] = useState<"bans" | "monitoring" | "events" | "whitelist">("bans");
  const [whitelist, setWhitelist] = useState<{ permanent: string[]; temporary: string[] }>({ permanent: [], temporary: [] });
  const [wlInput, setWlInput] = useState("");
  const [showBanModal, setShowBanModal] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (res.status === 401) { window.location.href = "/login"; return; }
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  const fetchTimeline = useCallback(async () => {
    const res = await fetch("/api/stats/timeline");
    if (res.ok) setTimeline((await res.json()).timeline);
  }, []);

  const fetchWhitelist = useCallback(async () => {
    const res = await fetch("/api/whitelist");
    if (res.ok) setWhitelist(await res.json());
  }, []);

  useEffect(() => {
    fetchData(); fetchTimeline(); fetchWhitelist();
    fetch("/api/me").then(r => r.ok ? r.json() : null).then(d => d && setMe(d));
    const t = setInterval(fetchData, 15000);
    return () => clearInterval(t);
  }, [fetchData, fetchTimeline, fetchWhitelist]);

  async function handleBan(ip: string, jail: string, bantime: number) {
    await fetch("/api/ban", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, jail, server: "dashboard", bantime }),
    });
    fetchData();
  }

  async function handleUnban(ip: string) {
    if (!confirm(`Unban ${ip} across all servers?`)) return;
    await fetch("/api/unban", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip }) });
    fetchData();
  }

  async function handleAddWhitelist() {
    if (!wlInput.trim()) return;
    await fetch("/api/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: wlInput.trim(), action: "add" }) });
    setWlInput(""); fetchWhitelist();
  }

  async function handleRemoveWhitelist(ip: string) {
    await fetch("/api/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip, action: "remove" }) });
    fetchWhitelist();
  }

  const filteredBans = (data?.bans || []).filter(b => {
    if (search && !b.ip.includes(search) && !b.server.includes(search)) return false;
    if (jailFilter && b.jail !== jailFilter) return false;
    if (countryFilter && b.country !== countryFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const jails = data ? Object.keys(data.jailDistribution) : [];
  const countries = data ? Object.keys(data.countryDistribution).sort() : [];
  const location = me ? [me.city, me.country].filter(Boolean).join(", ") : undefined;
  const jailPieData = Object.entries(data?.jailDistribution || {}).map(([label, value]) => ({ label, value }));
  const countryTop = Object.entries(data?.countryDistribution || {}).sort(([, a], [, b]) => b - a).slice(0, 8);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="inline-block w-8 h-8 border-2 border-muted/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <NavHeader username={me?.username} ip={me?.ip} location={location} />

      {showBanModal && (
        <BanModal
          jails={jails}
          onBan={handleBan}
          onClose={() => setShowBanModal(false)}
        />
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Active Bans",    value: data?.stats.totalBans ?? 0,      color: "text-danger"  },
            { label: "Whitelisted",    value: data?.stats.whitelistedIPs ?? 0,  color: "text-success" },
            { label: "Events Today",   value: data?.stats.eventsToday ?? 0,     color: "text-accent"  },
            { label: "Top Jail",       value: data?.stats.topJail ?? "—",       color: "text-warning", isText: true },
          ].map(c => (
            <div key={c.label} className="bg-card border border-card-border rounded-xl p-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">{c.label}</p>
              <p className={`${c.isText ? "text-lg" : "text-2xl"} font-bold font-mono ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-card-border rounded-lg p-1 w-fit">
          {([["bans", `Bans (${data?.stats.totalBans ?? 0})`], ["monitoring", "Monitoring"], ["events", "Events"], ["whitelist", "Whitelist"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
            >{label}</button>
          ))}
        </div>

        {/* ── Bans ── */}
        {tab === "bans" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="text" placeholder="Search IP or server…" value={search} onChange={e => setSearch(e.target.value)}
                className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent w-56" />
              <select value={jailFilter} onChange={e => setJailFilter(e.target.value)}
                className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent">
                <option value="">All jails</option>
                {jails.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
              <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent">
                <option value="">All countries</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => setShowBanModal(true)}
                className="ml-auto px-4 py-2 bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium rounded-lg transition-colors">
                + Ban IP
              </button>
            </div>

            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">IP</th>
                      <th className="text-left px-4 py-3">Jail</th>
                      <th className="text-left px-4 py-3 hidden sm:table-cell">Server</th>
                      <th className="text-left px-4 py-3 hidden md:table-cell">Location</th>
                      <th className="text-left px-4 py-3 hidden sm:table-cell">Banned</th>
                      <th className="text-left px-4 py-3">Expires</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBans.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">{data?.stats.totalBans === 0 ? "No active bans" : "No bans match filters"}</td></tr>
                    ) : filteredBans.map(ban => (
                      <tr key={`${ban.ip}-${ban.jail}`} className="border-b border-card-border/50 hover:bg-card-border/10 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium">{ban.ip}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md font-mono">{ban.jail}</span></td>
                        <td className="px-4 py-3 text-muted font-mono text-xs hidden sm:table-cell">{ban.server}</td>
                        <td className="px-4 py-3 text-muted hidden md:table-cell">{ban.country ? <span>{ban.city ? `${ban.city}, ` : ""}{ban.country}</span> : <span className="text-muted/40">—</span>}</td>
                        <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{ago(ban.timestamp)}</td>
                        <td className="px-4 py-3 text-xs"><span className="text-warning">{expiry(ban.timestamp, ban.bantime)}</span></td>
                        <td className="px-4 py-3 text-right"><button onClick={() => handleUnban(ban.ip)} className="px-3 py-1 text-xs bg-danger/10 text-danger hover:bg-danger/20 rounded-md transition-colors">Unban</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Monitoring ── */}
        {tab === "monitoring" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Jail distribution */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted">Jail Distribution</h3>
              <PieChart data={jailPieData} />
            </div>

            {/* Ban timeline */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted">Ban Activity — Last 30 Days</h3>
              {timeline.length > 0 ? <Timeline data={timeline} /> : <div className="text-center text-muted text-sm py-4">No timeline data</div>}
            </div>

            {/* Top countries */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted">Top Attacker Countries</h3>
              {countryTop.length === 0 ? (
                <div className="text-center text-muted text-sm py-4">No data</div>
              ) : (
                <div className="space-y-2">
                  {countryTop.map(([country, count], i) => (
                    <div key={country} className="flex items-center gap-3">
                      <span className="text-xs text-muted w-4 text-right">{i + 1}</span>
                      <span className="text-xs font-medium w-28 truncate">{country}</span>
                      <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(count / (data?.stats.totalBans || 1)) * 100}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-xs font-mono w-10 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top attackers */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted">Top Banned IPs</h3>
              {(data?.bans || []).length === 0 ? (
                <div className="text-center text-muted text-sm py-4">No bans</div>
              ) : (
                <div className="space-y-1">
                  {(data?.bans || []).slice(0, 8).map((ban, i) => (
                    <div key={ban.ip} className="flex items-center gap-3 py-1.5">
                      <span className="text-xs text-muted w-4 text-right">{i + 1}</span>
                      <span className="font-mono text-xs flex-1">{ban.ip}</span>
                      <span className="text-xs text-muted">{ban.country || "—"}</span>
                      <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded font-mono">{ban.jail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Events ── */}
        {tab === "events" && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-muted text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-left px-4 py-3">Action</th>
                    <th className="text-left px-4 py-3">IP</th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">Jail</th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">Server</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentEvents || []).length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No events yet</td></tr>
                  ) : (data?.recentEvents || []).map((evt, i) => (
                    <tr key={i} className="border-b border-card-border/50 hover:bg-card-border/10 transition-colors">
                      <td className="px-4 py-3 text-muted text-xs font-mono">{ago(evt.timestamp)}</td>
                      <td className="px-4 py-3"><span className={`font-semibold text-xs ${actionColor(evt.action)}`}>{evt.action}</span></td>
                      <td className="px-4 py-3 font-mono text-xs">{evt.ip}</td>
                      <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{evt.jail || "—"}</td>
                      <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{evt.server || "—"}</td>
                      <td className="px-4 py-3 text-muted text-xs hidden md:table-cell">{evt.actor || "agent"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Whitelist ── */}
        {tab === "whitelist" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input type="text" placeholder="IP or CIDR (e.g. 1.2.3.4 or 10.0.0.0/8)…" value={wlInput} onChange={e => setWlInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddWhitelist()}
                className="flex-1 max-w-sm px-3 py-2 bg-card border border-card-border rounded-lg text-sm focus:outline-none focus:border-accent" />
              <button onClick={handleAddWhitelist} className="px-4 py-2 bg-success/10 hover:bg-success/20 text-success text-sm font-medium rounded-lg transition-colors">Add to Whitelist</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-card border border-card-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-muted mb-3">Permanent (IPs & CIDRs)</h3>
                {whitelist.permanent.length === 0 ? <p className="text-sm text-muted/50">Empty</p> : (
                  <div className="space-y-2">
                    {whitelist.permanent.map(ip => (
                      <div key={ip} className="flex items-center justify-between py-1.5 px-3 bg-background rounded-lg">
                        <span className="font-mono text-sm">{ip}</span>
                        <button onClick={() => handleRemoveWhitelist(ip)} className="text-xs text-danger hover:text-danger-hover transition-colors">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-muted mb-3">Temporary 24h</h3>
                {whitelist.temporary.length === 0 ? <p className="text-sm text-muted/50">Empty</p> : (
                  <div className="space-y-2">
                    {whitelist.temporary.map(ip => (
                      <div key={ip} className="flex items-center gap-2 py-1.5 px-3 bg-background rounded-lg">
                        <span className="font-mono text-sm">{ip}</span>
                        <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded">24h</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
