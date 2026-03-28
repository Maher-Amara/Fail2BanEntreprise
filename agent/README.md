# Fail2BanEntreprise Agent — Manual Installation

> Supported platforms:
> **ViciDial / ViciBox** (openSUSE/SLES)
> **FusionPBX** (Debian)
> **Generic Debian/Ubuntu**

---

## Files

| File                  | Destination                             | Purpose                    |
| --------------------- | ----------------------------------------|----------------------------|
| `agent.py`            | `/usr/local/bin/f2b-agent`              | Agent binary               |
| `f2b-agent.conf`      | `/etc/f2b-agent.conf`                   | Agent configuration        |
| `f2be.conf`           | `/etc/fail2ban/action.d/f2be.conf`      | Fail2Ban action definition |
| `vicidial.conf`       | `/etc/fail2ban/jail.local`              | jail.local for ViciDial    |
| `fusionpbx.conf`      | `/etc/fail2ban/jail.local`              | jail.local for FusionPBX   |
| `debian.conf`         | `/etc/fail2ban/jail.local`              | jail.local for  Debian     |
| `f2b-agent.service`   | `/etc/systemd/system/f2b-agent.service` | Systemd sync-loop daemon   |

---

## Executive Summary (what “good” looks like)

- **Fail2Ban writes bans to ipset**, not per‑IP `iptables` rules.
- **iptables references small ipset sets** with a single rule per set, placed early in `INPUT`.
- **Per‑jail ipset sets** are preferred (e.g., `f2b-ssh`, `f2b-sip`, `f2b-web`) for clarity.
- No unconditional early `ACCEPT all` rules; keep `RELATED,ESTABLISHED` first, then whitelist, then ipset‑based drops.
- Visibility: `fail2ban-client status <jail>` shows bans; `ipset list f2b-<jail>` shows members.

---

## 0) Server Inventory

| IP Address         | Role       | OS          | Hostname   | Domain                | F2BE | Reason      |
|--------------------|------------|-------------|------------|-----------------------|------|-------------|
| 81.95.119.130      | FusionPBX  | Debian 9    | pbx130     | pbx130.stcall.be      | yes  | SSH acess   |
| 81.95.119.153      | FusionPBX  | Debian 9    | pbx153     | pbx153.stcall.be      | no   | FA Fierwall |
| 213.144.214.200    | FusionPBX  | Debian 12   | pbx200     | pbx200.scopcall.eu    | yes  |             |
| 213.144.214.244    | FusionPBX  | Debian 12   | pbx244     | pbx244.scopcall.eu    | yes  |             |
| 81.95.124.53       | ViciBox 10 | openSUSE    | crm53      | crm53.stcall.be       | no   | Old OS      |
| 213.144.214.241    | Vicidial 9 | openSUSE 15 | crm241     | crm241.scopcall.eu    | no   | Old OS      |
| 213.144.214.243    | Vicidial 9 | openSUSE 15 | crm243     | crm243.scopcall.eu    |      |             |
| 213.144.214.252    | Docker     | Debian      | docker252  | docker252.scopcall.eu |      |             |

## Step 1 — Clone the Repository in Home Directory

```bash
cd ~
git clone https://github.com/Maher-Amara/Fail2BanEntreprise.git
cd ~/Fail2BanEntreprise/agent
```

---

## Step 2 — Install Fail2Ban and ipset

**ViciDial / ViciBox (openSUSE / SLES):**

```bash
sudo zypper refresh && zypper install fail2ban ipset
```

**FusionPBX / Debian / Ubuntu:**

```bash
sudo apt-get update && sudo apt-get install -y fail2ban ipset
```

## Step 3 — Install the Agent

```bash
# Copy agent binary
sudo cp agent.py /usr/local/bin/f2b-agent
sudo chmod +x /usr/local/bin/f2b-agent
sudo cp f2b-agent.conf /etc/f2b-agent.conf

# Verify
f2b-agent help
```

## Step 4 — Register This Server in the Dashboard

1. Enter this server's hostname (e.g. `dialer1.callpro.be`)

    ```bash
    hostname -f
    ```

2. edit the agent config:

    ```bash
    sudo nano /etc/f2b-agent.conf
    ```

3. Log in at **<https://f2b.scopcall.com/servers>**
4. Copy the generated token — **shown only once**
    Set your token:

    ```conf
    F2B_API_URL="https://f2b.scopcall.com"
    F2B_API_KEY="your-server-token-here"
    ```

---

## Step 5 — Install Fail2Ban Action (ipset)

```bash
sudo cp f2be.conf /etc/fail2ban/action.d/f2be.conf
```

---

## Step 6 — Install jail.local (per‑platform baseline)

Choose the file that matches your platform:

```bash
# ViciDial / ViciBox
sudo cp vicidial.conf /etc/fail2ban/jail.local

# FusionPBX
sudo cp fusionpbx.conf /etc/fail2ban/jail.local

# Generic Debian
sudo cp debian.conf /etc/fail2ban/jail.local
```

> **⚠️ Before reloading:** Edit `jail.local` and verify the `ignoreip` line includes your office IP and VPN exit IP. Getting blocked by any jail locks out SSH + web + SIP simultaneously.

```ini
# Already set in all configs — adjust if needed:
ignoreip = 127.0.0.1/8 ::1 196.179.222.182 213.144.214.193/26 81.95.124.1/26 81.95.119.129/26
```

---

## Step 7 — Install Systemd Service (agent sync)

```bash
sudo cp f2b-agent.service /etc/systemd/system/f2b-agent.service
sudo systemctl daemon-reload
sudo systemctl enable f2b-agent
sudo systemctl restart f2b-agent
sudo systemctl status f2b-agent --no-pager
```

---

## Step 8 — Enable and Reload Fail2Ban

```bash
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# Verify jails are active
sudo fail2ban-client status

# Verify agent is syncing
sudo journalctl -u f2b-agent -f
```

---

## Step 9 — Baseline Firewall Ordering (iptables + ipset)

Target order in `INPUT`:

1. `ACCEPT` state `RELATED,ESTABLISHED`
2. `ACCEPT` whitelist ipset (e.g., `f2b-whitelist`)
3. `DROP` per‑jail ipset sets (`f2b-ssh`, `f2b-sip`, and/or `f2b-global`)
4. Service‑specific `ACCEPT`s (ssh/http/https/sip/rtp/vpn)
5. Final policy `DROP` (or explicit)

Example snippet to create sets and add match rules (idempotent on modern systems):

```bash
# Create sets if not exist (IPv4). Add "timeout <sec>" as policy where desired.
sudo ipset create f2b-whitelist hash:ip -exist
sudo ipset create f2b-ssh hash:ip timeout 3600 -exist
sudo ipset create f2b-sip hash:ip timeout 3600 -exist
sudo ipset create f2b-global hash:ip -exist

# Insert early rules in INPUT (ensure RELATED,ESTABLISHED is first)
sudo iptables -C INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT 1 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

sudo iptables -C INPUT -m set --match-set f2b-whitelist src -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT 2 -m set --match-set f2b-whitelist src -j ACCEPT

sudo iptables -C INPUT -m set --match-set f2b-ssh src -j DROP 2>/dev/null \
  || sudo iptables -I INPUT 3 -m set --match-set f2b-ssh src -j DROP

sudo iptables -C INPUT -m set --match-set f2b-sip src -j DROP 2>/dev/null \
  || sudo iptables -I INPUT 4 -m set --match-set f2b-sip src -j DROP

# Optional global catch‑all blacklist after per‑jail sets
sudo iptables -C INPUT -m set --match-set f2b-global src -j DROP 2>/dev/null \
  || sudo iptables -I INPUT 5 -m set --match-set f2b-global src -j DROP
```

Remove any unconditional early `ACCEPT all` rules. Keep only service‑specific accepts (e.g., `ssh`, `http/https`).

---

## Step 10 — Switch Jails to ipset Action (`f2be`)

Ensure all relevant jails use the ipset action. In `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
banaction = f2be

[sshd]
enabled  = true
action   = f2be[name=sshd, setname=f2b-ssh]
```

Reload Fail2Ban:

```bash
sudo fail2ban-client reload
sudo fail2ban-client status
```

---

## Step 11 — Clean Up Legacy Per‑IP Rules

After confirming ipset bans are being enforced:

```bash
# Review large legacy chains first:
sudo iptables -S | grep -E 'f2b-|sip-auth'
sudo iptables -L INPUT -n --line-numbers

# Remove/flush legacy per‑IP rules and duplicate SSH jails (example; adjust to your chains)
# WARNING: Do this only after verifying ipset rules are active and early in INPUT.
# Example to flush a legacy chain:
# sudo iptables -F f2b-SSH
# sudo iptables -X f2b-SSH
```

Keep chain count small and rely on ipset matches instead of hundreds of per‑IP `REJECT/DROP` rules.

---

## Verify (end-to-end)

```bash
# Active jails
sudo fail2ban-client status

# Agent sync log
sudo tail -f /var/log/f2b-agent.log

# ipset contents (per-jail and/or global)
sudo ipset list | sed -n '1,120p'
sudo ipset list f2b-ssh | head -20
sudo ipset list f2b-sip | head -20
sudo ipset list f2b-global | head -20

# iptables INPUT shows short, ordered rules with early ipset matches
sudo iptables -S INPUT
sudo iptables -L INPUT -n --line-numbers | sed -n '1,120p'
```

---

## Maintenance

| Task | Command |
| --- | --- |
| Check a specific jail | `fail2ban-client status <jail>` |
| Reload Fail2Ban config | `fail2ban-client reload` |
| View blocked IPs | `ipset list f2b-<jail>` |
| Manual ban | `fail2ban-client set <jail> banip <ip>` |
| Unban locally | `fail2ban-client set <jail> unbanip <ip>` |
| Unban globally | Dashboard → Bans tab → Unban |
| Restart agent | `systemctl restart f2b-agent` |
| View agent log | `tail -f /var/log/f2b-agent.log` |

---

## Auth Model

| Endpoint | Auth | Called by |
| --- | --- | --- |
| `POST /api/ban` | `x-api-key` (per-server token) | Agent on Fail2Ban ban event |
| `GET /api/sync` | `x-api-key` (per-server token) | Agent sync-loop (every 60s) |
| `POST /api/unban` | JWT cookie | Dashboard admin only |

Ban expiry is handled by **Redis TTL** — agents do not need to call `/api/unban`.

---

## Remediation Playbook (step‑by‑step to fix existing hosts)

1) Baseline hygiene (from `linux/README.md`)
- Harden SSH (keys only, disable root login).
- Audit users and access; add office/VPN subnets to `ignoreip`.

2) Standardize Fail2Ban actions
- Install `f2be.conf` and set `banaction = f2be`.
- Switch priority jails (`sshd`, `nginx-*`, `sip/asterisk/freeswitch`, `postfix`) to `f2be[name=<jail>, setname=f2b-<jail>]`.

3) Create/confirm ipset sets
- `f2b-whitelist` (no timeout), `f2b-ssh`/`f2b-sip` (with timeout), keep `f2b-global`.

4) Fix firewall rule ordering
- Ensure `RELATED,ESTABLISHED` first.
- Add `ACCEPT -m set --match-set f2b-whitelist src`.
- Add `DROP -m set --match-set f2b-ssh src`, `f2b-sip`, and/or `f2b-global` before service `ACCEPT`s.
- Remove any unconditional early `ACCEPT all`.

5) Clean up legacy rules
- Flush per‑IP `REJECT/DROP` rules from Fail2Ban legacy chains once ipset path is confirmed working.
- Remove duplicate/overlapping SSH jails (`f2b-SSH` vs `f2b-sshd`).

6) Improve filters and test
- Tighten high‑volume filters (SIP/HTTP) and validate with `fail2ban-regex` on platform‑correct logs (`file` on Debian, `systemd` on openSUSE).
- Add IPv6 support where applicable.

7) Verify and monitor
- `fail2ban-client status` and `fail2ban-client status <jail>`.
- `ipset list f2b-<jail>` shows members; `iptables -L INPUT -n` shows few, ordered rules.
- Watch CPU and ban volumes; adjust thresholds if needed.

---

## Host‑specific notes

- Debian/FusionPBX:
  - `backend = file` (e.g., `/var/log/auth.log`, Nginx logs).
  - SIP protections (`freeswitch-ip`, `auth-challenge-ip`) should ban into `f2b-sip` via `f2be`.

- ViciDial/openSUSE:
  - `backend = systemd` for `sshd`/mail (dump logs with `journalctl` for regex testing).
  - Align Apache filter filenames with `error_log` / `access_log`.
