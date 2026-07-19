"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──
interface AuditEntry {
  action: string;
  ip: string;
  jail?: string;
  server?: string;
  actor?: string;
  timestamp: string;
}

interface BanRecord {
  ip: string;
  jail: string;
  server: string;
  timestamp: string;
  bantime: number;
  country?: string;
  city?: string;
}

interface StatsData {
  stats: { totalBans: number; whitelistedIPs: number; eventsToday: number; topJail: string };
  jailDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  serverDistribution: Record<string, number>;
  recentEvents: AuditEntry[];
  recentBans: BanRecord[];
}

interface TimelinePoint {
  date: string;
  count: number;
}

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

// ── Helpers ──
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
    return {
      path: `M50,50 L${x1},${y1} A40,40 0 ${large},1 ${x2},${y2} Z`,
      color: COLORS[i % COLORS.length],
      label: d.label,
      value: d.value,
    };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="#12121a" strokeWidth="1" />
        ))}
        <circle cx="50" cy="50" r="22" fill="#12121a" />
        <text x="50" y="55" textAnchor="middle" fill="#e4e4eb" fontSize="12" fontWeight="bold">
          {total}
        </text>
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
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 400, H = 60;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / max) * (H - 4) - 2;
    return { x, y, ...d };
  });
  const area = `M${pts[0].x},${H} ` + pts.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length - 1].x},${H} Z`;
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

// ── Exported Components ──

export function KPIStatsCards({ data, refresh }: { data: StatsData | null; refresh: () => void }) {
  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { label: "Active Bans", value: data?.stats.totalBans ?? 0, color: "text-danger" },
        { label: "Whitelisted", value: data?.stats.whitelistedIPs ?? 0, color: "text-success" },
        { label: "Events Today", value: data?.stats.eventsToday ?? 0, color: "text-accent" },
        { label: "Top Jail", value: data?.stats.topJail ?? "—", color: "text-warning", isText: true },
      ].map((c) => (
        <div key={c.label} className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-1">{c.label}</p>
          <p className={`${c.isText ? "text-lg" : "text-2xl"} font-bold font-mono ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export function MonitoringTab({ data }: { data: StatsData | null }) {
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);

  useEffect(() => {
    fetch("/api/stats/timeline")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTimeline(d.timeline));
  }, []);

  const jailPieData = Object.entries(data?.jailDistribution || {}).map(([label, value]) => ({ label, value }));
  const countryTop = Object.entries(data?.countryDistribution || {}).sort(([, a], [, b]) => b - a).slice(0, 8);
  const totalBans = data?.stats.totalBans || 1;

  return (
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
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / totalBans) * 100}%`, background: COLORS[i % COLORS.length] }}
                  />
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
        {(data?.recentBans || []).length === 0 ? (
          <div className="text-center text-muted text-sm py-4">No bans</div>
        ) : (
          <div className="space-y-1">
            {(data?.recentBans || []).map((ban, i) => (
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
  );
}
