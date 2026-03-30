#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ─────────────────────────────────────────────────────────
# Fail2BanEntreprise Agent
#
# Supported platforms:
#   • ViciDial / ViciBox  (openSUSE Leap / SLES)
#   • FusionPBX           (Debian / Ubuntu)
#   • Generic Debian/Ubuntu
#
# Key architecture:
#   • /api/ban   → x-api-key (per-server token from Servers page)
#   • /api/sync  → x-api-key (per-server token)
#   • /api/unban → JWT-only  (dashboard admins) — agent does NOT call it
#                  Ban expiry is handled by Redis TTL automatically.
#
# Usage:
#   f2b-agent ban  <ip> <jail> [bantime]
#   f2b-agent unban <ip> [jail]
#   f2b-agent sync
#   f2b-agent sync-loop
# ─────────────────────────────────────────────────────────

import ipaddress
import json
import logging
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

# ── Constants ──────────────────────────────────────────────────────────────

CONFIG_FILE = "/etc/f2b-agent.conf"
LOG_FILE    = "/var/log/f2b-agent.log"

DEFAULTS = {  # type: Dict[str, str]
    "F2B_API_URL":             "https://f2b.scopcall.com",
    "F2B_API_KEY":       "",
    "F2B_SYNC_INTERVAL": "60",
    "F2B_IPSET_WHITELIST_NAME": "whitelist",
    "F2B_IPSET_BLACKLIST_NAME": "blacklist",
    "F2B_IPSET_SETS": "ssh,sip,db,web,proxy,email",
}

# ── Logging ───────────────────────────────────────────────────────────────


def _setup_logging() -> logging.Logger:
    fmt = "[%(asctime)s] %(levelname)s %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"
    logger = logging.getLogger("f2b-agent")
    logger.setLevel(logging.DEBUG)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(logging.Formatter(fmt, datefmt))
    logger.addHandler(ch)

    # File handler — create log directory if needed
    try:
        Path(LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(LOG_FILE)
        fh.setFormatter(logging.Formatter(fmt, datefmt))
        logger.addHandler(fh)
    except PermissionError:
        logger.warning("Cannot write to %s - logging to stdout only", LOG_FILE)

    return logger


log = _setup_logging()

# ── Configuration ──────────────────────────────────────────────────────────


def _parse_conf(path: str) -> Dict[str, str]:
    """
    Parse a bash-style KEY="value" config file.
    Handles: unquoted, single-quoted, double-quoted values.
    Ignores comments and blank lines.
    """
    result = {}  # type: Dict[str, str]
    if not os.path.isfile(path):
        return result

    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            # Remove surrounding quotes and inline comments
            val = val.split("#")[0].strip().strip('"').strip("'")
            if key:
                result[key] = val
    return result


def load_config() -> Dict[str, str]:
    cfg = {**DEFAULTS}
    cfg.update(_parse_conf(CONFIG_FILE))
    # Environment variables override the file
    for k in DEFAULTS:
        env_val = os.environ.get(k)
        if env_val is not None:
            cfg[k] = env_val.strip().strip('"').strip("'")
    # Strip trailing slash from URL
    cfg["F2B_API_URL"] = cfg["F2B_API_URL"].rstrip("/")
    return cfg


# ── HTTP helpers ──────────────────────────────────────────────────────────

def _api_post(
    url: str,
    key: str,
    body: Dict,
    timeout: int = 10,
) -> Optional[int]:
    """POST JSON to the API, return HTTP status code or None on error."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": key,
            "User-Agent": "Fail2BanEntreprise-Agent/1.0",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode()
    except urllib.error.HTTPError as exc:
        log.debug("HTTP POST error: %s", exc)
        return exc.code
    except Exception as exc:  # noqa: BLE001
        log.debug("HTTP POST error: %s", exc)
        return None


def _api_get(
    url: str,
    key: str,
    timeout: int = 15,
) -> Optional[Dict]:
    """GET JSON from the API, return parsed dict or None on error."""
    req = urllib.request.Request(
        url,
        headers={
            "x-api-key": key,
            "User-Agent": "Fail2BanEntreprise-Agent/1.0",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        log.warning("HTTP GET failed for %s (status=%s)", url, exc.code)
        return None
    except Exception as exc:  # noqa: BLE001
        log.debug("HTTP GET error: %s", exc)
        return None


# ── ipset helpers ──────────────────────────────

def _run(*cmd: str, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        list(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
        check=check,
    )


def _ipset(*args: str) -> bool:
    """Run an ipset command, return True on success."""
    result = _run("ipset", *args)
    return result.returncode == 0


def _ipset_sets() -> List[str]:
    """Return list of existing ipset set names."""
    proc = _run("ipset", "list", "-n")
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def _ipset_members(set_name: str) -> List[str]:
    """Return members of an ipset set (IPs or CIDRs depending on type)."""
    proc = _run("ipset", "list", set_name)
    if proc.returncode != 0:
        return []
    out = proc.stdout
    if "Members:" not in out:
        return []
    members_block = out.split("Members:", 1)[1]
    return [
        line.strip()
        for line in members_block.splitlines()
        if line.strip()
    ]


def _ipset_exists(name: str) -> bool:
    """Return True if an ipset set exists."""
    return name in _ipset_sets()


def _parse_sets_cfg(cfg_value: str) -> List[str]:
    """Parse a comma-separated list of ipset names into a clean list."""
    return [s.strip() for s in cfg_value.split(",") if s.strip()]


def _allowed_target_sets(cfg: Dict[str, str]) -> List[str]:
    """
    Return the list of allowed target ipset names to populate with bans.
    Includes configured per-jail sets plus the configured blacklist
    as the fallback.
    """
    per_jail = _parse_sets_cfg(cfg.get("F2B_IPSET_SETS", ""))
    bl = cfg.get("F2B_IPSET_BLACKLIST_NAME", "blacklist")
    # Maintain deterministic ordering; ensure blacklist is present once
    ordered = [s for s in per_jail if s]
    if bl not in ordered:
        ordered.append(bl)
    return ordered


# ── CIDR helper ───────────────────────────────────────────────────────────

def ip_in_entry(ip: str, entry: str) -> bool:
    """Return True if ip (string) falls within entry (IP or CIDR string)."""
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(
            entry,
            strict=False,
        )
    except ValueError:
        return False


# ── Actions ────────────────────────────────────────────────────────────────

def action_ban(
    cfg: Dict[str, str],
    ip: str,
    jail: str,
    bantime: int = 86400,
) -> None:
    log.info("BAN ip=%s jail=%s bantime=%d", ip, jail, bantime)

    code = _api_post(
        "{}/api/ban".format(cfg["F2B_API_URL"]),
        cfg["F2B_API_KEY"],
        {"ip": ip, "jail": jail, "bantime": bantime},
    )

    if code == 200:
        log.info("BAN ok ip=%s", ip)
    elif code is None:
        log.warning("BAN failed ip=%s - API unreachable", ip)
    else:
        log.warning("BAN failed ip=%s http=%s", ip, code)


def action_notify_unban(ip: str, jail: str = "unknown") -> None:
    """
    /api/unban is JWT-only (dashboard admins only).
    Redis TTL automatically expires the central ban.
    This function only logs the local event.
    """
    log.info(
        (
            "UNBAN-LOCAL ip=%s jail=%s "
            "(Fail2Ban expired; Redis TTL handles central expiry)"
        ),
        ip, jail,
    )


def action_sync(cfg: Dict[str, str]) -> None:
    log.info("SYNC start")

    blacklist_set = cfg.get("F2B_IPSET_BLACKLIST_NAME", "blacklist")
    category_sets = _parse_sets_cfg(cfg.get("F2B_IPSET_SETS", ""))
    target_sets = _allowed_target_sets(cfg)

    # Fetch global state
    data = _api_get(
        "{}/api/sync".format(cfg["F2B_API_URL"]),
        cfg["F2B_API_KEY"],
    )
    if data is None:
        log.warning("SYNC failed - API request rejected or unreachable")
        return

    bans = data.get("bans", [])  # type: List[Dict]
    whitelist = data.get("whitelist", [])  # type: List[str]

    # Build desired membership per target set
    desired_by_set = {s: set() for s in target_sets}  # type: Dict[str, set]

    # Distribute bans into per-jail sets; fallback to blacklist if no match
    for ban in bans:
        ip = ban.get("ip", "")
        if not ip:
            continue
        jail = str(ban.get("jail", "") or "").lower()

        # Skip if the IP falls within any whitelisted entry (IP or CIDR)
        if any(ip_in_entry(ip, wl) for wl in whitelist):
            continue

        # Choose target set by jail/category when available, else blacklist
        if jail in category_sets:
            target = jail
        else:
            target = blacklist_set

        if target not in desired_by_set:
            # Config changed mid-run; skip unknown set
            continue

        desired_by_set[target].add(ip)

    # Reconcile memberships for existing sets only
    results = []  # type: List[str]
    existing_sets = set(_ipset_sets())
    for set_name, desired in desired_by_set.items():
        if set_name not in existing_sets:
            log.warning(
                "ipset %s not found - skipping (managed manually)",
                set_name,
            )
            continue
        current = set(_ipset_members(set_name))
        to_add = sorted(desired - current)
        to_del = sorted(current - desired)
        adds = 0
        dels = 0
        for ip in to_add:
            if _ipset("add", set_name, ip, "-exist"):
                adds += 1
        for ip in to_del:
            # Best-effort delete; ignore failures
            _ipset("del", set_name, ip)
            dels += 1
        results.append("{}:+{} -{}".format(set_name, adds, dels))

    # Log summary
    summary = ", ".join(results) if results else "no sets updated"
    log.info("SYNC done: %s", summary)


def action_sync_loop(cfg: Dict[str, str]) -> None:
    interval = int(cfg.get("F2B_SYNC_INTERVAL", 60))
    log.info("Starting sync-loop (interval=%ds)", interval)
    while True:
        try:
            action_sync(cfg)
        except Exception as exc:  # noqa: BLE001
            log.error("SYNC error: %s", exc)
        time.sleep(interval)


# ── Entry point ───────────────────────────────────────────────────────────

USAGE = """\
Fail2BanEntreprise Agent

Usage:
  f2b-agent ban  <ip> <jail> [bantime]
      Report ban to central API
  f2b-agent unban <ip> [jail]
      Log locally (Redis TTL handles expiry)
  f2b-agent sync
      Pull global state -> local ipset (once)
  f2b-agent sync-loop
      Pull global state -> local ipset (loop)
  f2b-agent help                         Show this help

Notes:
  - Agent never creates ipset sets and never alters iptables.
    Create ipset sets, iptables rules, and Fail2Ban configs manually
    as described in README before enabling sync.

Configuration  ->  /etc/f2b-agent.conf:
  F2B_API_URL                 Dashboard URL  (required)
  F2B_API_KEY                 Per-server token (required)
  F2B_SYNC_INTERVAL           Seconds between syncs (default: 60)
  F2B_IPSET_WHITELIST_NAME    Whitelist set (default: whitelist,
                              type: hash:net)
  F2B_IPSET_BLACKLIST_NAME    Blacklist set (default: blacklist, type: hash:ip)
  F2B_IPSET_SETS              Comma list of per-jail sets
                              (default: ssh,sip,db,web,proxy,email)

Auth model:
  /api/ban   -> x-api-key (per-server token)
  /api/sync  -> x-api-key (per-server token)
  /api/unban -> JWT only  (dashboard admins - not called by agent)
"""


def main() -> None:
    args = sys.argv[1:]
    cmd = args[0] if args else "help"

    # Show help without requiring config
    if cmd in ("help", "--help", "-h"):
        print(USAGE)
        return

    cfg = load_config()

    if not cfg.get("F2B_API_KEY"):
        log.error(
            "F2B_API_KEY is required. "
            "Register this server at %s/servers and paste the token into %s.",
            cfg.get("F2B_API_URL", "<F2B_API_URL>"), CONFIG_FILE,
        )
        sys.exit(1)

    if cmd == "ban":
        if len(args) < 3:
            log.error("Usage: agent.py ban <ip> <jail> [bantime]")
            sys.exit(1)
        ip = args[1]
        jail = args[2]
        btime = int(args[3]) if len(args) > 3 else 86400
        action_ban(cfg, ip, jail, btime)

    elif cmd == "unban":
        if len(args) < 2:
            log.error("Usage: agent.py unban <ip> [jail]")
            sys.exit(1)
        ip = args[1]
        jail = args[2] if len(args) > 2 else "unknown"
        action_notify_unban(ip, jail)

    elif cmd == "sync":
        action_sync(cfg)

    elif cmd == "sync-loop":
        action_sync_loop(cfg)

    else:
        print(USAGE)


if __name__ == "__main__":
    main()
