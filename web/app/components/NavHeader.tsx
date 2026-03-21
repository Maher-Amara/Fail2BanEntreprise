"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/",        label: "Dashboard" },
  { href: "/servers", label: "Servers"   },
  { href: "/users",   label: "Users"     },
  { href: "/profile", label: "Profile"   },
];

export function NavHeader({ username, ip, location }: {
  username?: string;
  ip?: string;
  location?: string;
}) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b border-card-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-sm font-bold hidden sm:block">F2B</span>
        </div>

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                pathname === href
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground hover:bg-card-border/30"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* My IP */}
        {ip && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-lg border border-card-border text-xs shrink-0">
            <span className="text-muted hidden sm:block">IP</span>
            <span className="font-mono font-semibold">{ip}</span>
            {location && <span className="text-muted hidden sm:block">· {location}</span>}
            <Link href="/unban-me" className="ml-1 px-2 py-0.5 rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors font-medium">
              Unban Me
            </Link>
          </div>
        )}

        {/* User + Sign out */}
        <div className="flex items-center gap-3 shrink-0">
          {username && <span className="text-xs text-muted hidden sm:block">{username}</span>}
          <button onClick={handleLogout} className="text-sm text-muted hover:text-foreground transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
