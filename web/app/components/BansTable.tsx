"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──
interface BanRecord {
  ip: string;
  jail: string;
  server: string;
  timestamp: string;
  bantime: number;
  country?: string;
  city?: string;
  lat?: string;
  lon?: string;
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

function expiry(ts: string, bt: number) {
  const d = new Date(ts).getTime() + bt * 1000 - Date.now();
  if (d < 0) return "Expired";
  const days = Math.floor(d / 86400000);
  if (days) return `${days}d left`;
  const hrs = Math.floor(d / 3600000);
  if (hrs) return `${hrs}h left`;
  return `${Math.floor(d / 60000)}m left`;
}

// ── Ban Modal ──
function BanModal({
  jails,
  onBan,
  onClose,
}: {
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
    if (!ipv4.test(ip)) {
      setError("Invalid IPv4 address");
      return;
    }
    setLoading(true);
    try {
      await onBan(ip, jail, bantime);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="font-semibold text-foreground">Ban IP Address</h2>
        <div>
          <label className="block text-sm text-muted mb-1.5">IP Address</label>
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="1.2.3.4"
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-danger"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm text-muted mb-1.5">Jail</label>
          <select
            value={jail}
            onChange={(e) => setJail(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
          >
            <option value="manual">manual</option>
            {jails
              .filter((j) => j !== "manual")
              .map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1.5">Duration</label>
          <select
            value={bantime}
            onChange={(e) => setBantime(Number(e.target.value))}
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
          >
            <option value={3600}>1 hour</option>
            <option value={86400}>24 hours</option>
            <option value={604800}>7 days</option>
            <option value={2592000}>30 days</option>
            <option value={6048000}>70 days</option>
          </select>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-card-border text-sm rounded-lg hover:bg-card-border/20 text-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2 bg-danger hover:bg-danger-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Banning…" : "Ban IP"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Bans Table Component ──
export default function BansTable({ onBanCountChange }: { onBanCountChange?: (count: number) => void }) {
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [jailFilter, setJailFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  
  // Available filters populated from backend response
  const [availableJails, setAvailableJails] = useState<string[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);

  const [showBanModal, setShowBanModal] = useState(false);

  // Use a ref to store onBanCountChange callback to prevent infinite render loops
  const onBanCountChangeRef = useRef(onBanCountChange);
  useEffect(() => {
    onBanCountChangeRef.current = onBanCountChange;
  }, [onBanCountChange]);

  const fetchBans = useCallback(async (pageNum: number, searchVal: string, jailVal: string, countryVal: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: pageNum.toString(),
        limit: "100",
        search: searchVal,
        jail: jailVal,
        country: countryVal,
      });
      const res = await fetch(`/api/dashboard/bans?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (pageNum === 1) {
          setBans(data.bans);
        } else {
          setBans((prev) => [...prev, ...data.bans]);
        }
        setHasMore(data.hasMore);
        if (onBanCountChangeRef.current) {
          onBanCountChangeRef.current(data.total);
        }
        if (data.filters) {
          setAvailableJails(data.filters.jails);
          setAvailableCountries(data.filters.countries);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load first page when filters change
  useEffect(() => {
    setPage(1);
    fetchBans(1, search, jailFilter, countryFilter);
  }, [search, jailFilter, countryFilter, fetchBans]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchBans(nextPage, search, jailFilter, countryFilter);
  };


  async function handleBan(ip: string, jail: string, bantime: number) {
    await fetch("/api/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, jail, server: "dashboard", bantime }),
    });
    // Reload from start
    setPage(1);
    fetchBans(1, search, jailFilter, countryFilter);
  }

  async function handleUnban(ip: string) {
    if (!confirm(`Unban ${ip} across all servers?`)) return;
    await fetch("/api/unban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    });
    // Reload from start
    setPage(1);
    fetchBans(1, search, jailFilter, countryFilter);
  }

  return (
    <div className="space-y-4">
      {showBanModal && (
        <BanModal
          jails={availableJails}
          onBan={handleBan}
          onClose={() => setShowBanModal(false)}
        />
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search IP or server…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent w-56"
        />
        <select
          value={jailFilter}
          onChange={(e) => setJailFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
        >
          <option value="">All jails</option>
          {availableJails.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
        >
          <option value="">All countries</option>
          {availableCountries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowBanModal(true)}
          className="ml-auto px-4 py-2 bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium rounded-lg transition-colors"
        >
          + Ban IP
        </button>
      </div>

      {/* Bans Table */}
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
              {bans.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No active bans found
                  </td>
                </tr>
              ) : (
                bans.map((ban) => (
                  <tr
                    key={`${ban.ip}-${ban.jail}`}
                    className="border-b border-card-border/50 hover:bg-card-border/10 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{ban.ip}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md font-mono">
                        {ban.jail}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted font-mono text-xs hidden sm:table-cell">
                      {ban.server}
                    </td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell">
                      {ban.country ? (
                        <span>
                          {ban.city ? `${ban.city}, ` : ""}
                          {ban.country}
                        </span>
                      ) : (
                        <span className="text-muted/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">
                      {ago(ban.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-warning">{expiry(ban.timestamp, ban.bantime)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUnban(ban.ip)}
                        className="px-3 py-1 text-xs bg-danger/10 text-danger hover:bg-danger/20 rounded-md transition-colors"
                      >
                        Unban
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Trigger */}
        {hasMore && (
          <div className="flex justify-center p-4 border-t border-card-border">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-4 py-2 border border-card-border hover:bg-card-border/20 text-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
