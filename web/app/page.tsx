"use client";

import { useState, useEffect, useCallback } from "react";
import { NavHeader } from "@/app/components/NavHeader";
import { KPIStatsCards, MonitoringTab } from "@/app/components/KPIStats";
import BansTable from "@/app/components/BansTable";

// ── Types ──
interface AuditEntry {
  action: string;
  ip: string;
  jail?: string;
  server?: string;
  actor?: string;
  timestamp: string;
}

interface StatsData {
  stats: { totalBans: number; whitelistedIPs: number; eventsToday: number; topJail: string };
  jailDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  serverDistribution: Record<string, number>;
  recentEvents: AuditEntry[];
  recentBans: any[];
}

interface MeData {
  username: string;
  role: string;
  ip: string;
  country?: string;
  city?: string;
}

// ── Helpers ──
function ago(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function actionColor(a: string) {
  if (a.includes("unban")) return "text-success";
  if (a.includes("ban")) return "text-danger";
  if (a.includes("whitelist")) return "text-accent";
  return "text-foreground";
}

// ── Dashboard ──
export default function DashboardPage() {
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"bans" | "monitoring" | "events" | "whitelist">("bans");
  const [whitelist, setWhitelist] = useState<{ permanent: string[]; temporary: string[] }>({ permanent: [], temporary: [] });
  const [wlInput, setWlInput] = useState("");
  
  // Local active ban count override (updates dynamically when BansTable filters/fetches)
  const [banCount, setBanCount] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        setStatsData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWhitelist = useCallback(async () => {
    const res = await fetch("/api/whitelist");
    if (res.ok) setWhitelist(await res.json());
  }, []);

  useEffect(() => {
    fetchStats();
    fetchWhitelist();
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMe(d));
    const t = setInterval(fetchStats, 15000);
    return () => clearInterval(t);
  }, [fetchStats, fetchWhitelist]);

  async function handleAddWhitelist() {
    if (!wlInput.trim()) return;
    await fetch("/api/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: wlInput.trim(), action: "add" }),
    });
    setWlInput("");
    fetchWhitelist();
    fetchStats();
  }

  async function handleRemoveWhitelist(ip: string) {
    await fetch("/api/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, action: "remove" }),
    });
    fetchWhitelist();
    fetchStats();
  }

  const location = me ? [me.city, me.country].filter(Boolean).join(", ") : undefined;
  
  // Use dynamically updated ban count from BansTable, or fall back to statsData
  const displayBanCount = banCount !== null ? banCount : (statsData?.stats.totalBans ?? 0);

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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top KPI Stats Cards */}
        <KPIStatsCards data={statsData} refresh={fetchStats} />

        {/* Tab Controls */}
        <div className="flex gap-1 bg-card border border-card-border rounded-lg p-1 w-fit">
          {(
            [
              ["bans", `Bans (${displayBanCount})`],
              ["monitoring", "Monitoring"],
              ["events", "Events"],
              ["whitelist", "Whitelist"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Bans Tab ── */}
        {tab === "bans" && (
          <BansTable
            onBanCountChange={(count) => {
              setBanCount(count);
              // Trigger a stats refresh to update total counts
              fetchStats();
            }}
          />
        )}

        {/* ── Monitoring Tab ── */}
        {tab === "monitoring" && <MonitoringTab data={statsData} />}

        {/* ── Events Tab ── */}
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
                  {(statsData?.recentEvents || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted">
                        No events yet
                      </td>
                    </tr>
                  ) : (
                    (statsData?.recentEvents || []).map((evt, i) => (
                      <tr
                        key={i}
                        className="border-b border-card-border/50 hover:bg-card-border/10 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted text-xs font-mono">{ago(evt.timestamp)}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold text-xs ${actionColor(evt.action)}`}>
                            {evt.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{evt.ip}</td>
                        <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{evt.jail || "—"}</td>
                        <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">{evt.server || "—"}</td>
                        <td className="px-4 py-3 text-muted text-xs hidden md:table-cell">{evt.actor || "agent"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Whitelist Tab ── */}
        {tab === "whitelist" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="IP or CIDR (e.g. 1.2.3.4 or 10.0.0.0/8)…"
                value={wlInput}
                onChange={(e) => setWlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddWhitelist()}
                className="flex-1 max-w-sm px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleAddWhitelist}
                className="px-4 py-2 bg-success/10 hover:bg-success/20 text-success text-sm font-medium rounded-lg transition-colors"
              >
                Add to Whitelist
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-card border border-card-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-muted mb-3">Permanent (IPs & CIDRs)</h3>
                {whitelist.permanent.length === 0 ? (
                  <p className="text-sm text-muted/50">Empty</p>
                ) : (
                  <div className="space-y-2">
                    {whitelist.permanent.map((ip) => (
                      <div key={ip} className="flex items-center justify-between py-1.5 px-3 bg-background rounded-lg">
                        <span className="font-mono text-sm text-foreground">{ip}</span>
                        <button
                          onClick={() => handleRemoveWhitelist(ip)}
                          className="text-xs text-danger hover:text-danger-hover transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-muted mb-3">Temporary 24h</h3>
                {whitelist.temporary.length === 0 ? (
                  <p className="text-sm text-muted/50">Empty</p>
                ) : (
                  <div className="space-y-2">
                    {whitelist.temporary.map((ip) => (
                      <div key={ip} className="flex items-center gap-2 py-1.5 px-3 bg-background rounded-lg">
                        <span className="font-mono text-sm text-foreground">{ip}</span>
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
