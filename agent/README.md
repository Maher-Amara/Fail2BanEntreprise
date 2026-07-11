# Fail2BanEntreprise Agent — Manual Installation

> Supported platforms:
> **ViciDial / ViciBox** (openSUSE/SLES)
> **FusionPBX** (Debian)
> **Generic Debian/Ubuntu**

---

## Files

| File/Dir                          | Destination                                    | Purpose                         |
| --------------------------------- | ---------------------------------------------- | ------------------------------- |
| `agent.py`                        | `/usr/local/bin/f2b-agent`                     | Agent binary                    |
| `f2b-agent.conf.example`          | `/etc/f2b-agent.conf`                          | Agent configuration (copy+edit) |
| `action.d/f2be.conf`              | `/etc/fail2ban/action.d/f2be.conf`             | Fail2Ban action (API notify)    |
| `action.d/ipset.conf`             | `/etc/fail2ban/action.d/ipset.conf`            | Fail2Ban action (ipset update)  |
| `jails/vicidial.conf`             | `/etc/fail2ban/jail.local`                     | jail.local for ViciDial         |
| `jails/fusionpbx.conf`            | `/etc/fail2ban/jail.local`                     | jail.local for FusionPBX        |
| `jails/debian.conf`               | `/etc/fail2ban/jail.local`                     | jail.local for Debian <= 11     |
| `jails/debian12.conf`             | `/etc/fail2ban/jail.local`                     | jail.local for Debian 12 / 13   |
| `jails/default.conf`              | `/etc/fail2ban/jail.local`                     | Reference default (optional)    |
| `system/f2b-agent.service`        | `/etc/systemd/system/f2b-agent.service`        | Systemd sync-loop daemon        |
| `system/ipset-restore.service`    | `/etc/systemd/system/ipset-restore.service`    | Systemd ipset restore daemon    |
| `system/iptables-restore.service` | `/etc/systemd/system/iptables-restore.service` | Systemd iptables restore daemon |

---

## Executive Summary (what “good” looks like)

- **Fail2Ban writes bans to ipset**, not per‑IP `iptables` rules.
- **iptables references small ipset sets** with a single rule per set, placed early in `INPUT`.
- **Per‑jail ipset sets** are preferred (e.g., `ssh`, `sip`, `web`) for clarity.
- No unconditional early `ACCEPT all` rules; keep `RELATED,ESTABLISHED` first, loopback `lo` accept, whitelist, then ipset‑based drops, then specific port accepts, and default policy is DROP.
- Visibility: `fail2ban-client status <jail>` shows bans; `ipset list <set>` shows members.
-
- Agent scope:
  - Agent never creates ipset sets and never alters iptables.
  - You must create ipset sets and iptables rules manually (see baseline below).
  - Agent distributes bans per jail into existing sets and reconciles membership only.

---

## 0) Server Inventory

| IP Address      | Role       | OS            | Hostname     | Domain                   | F2BE | Reason      |
| --------------- | ---------- | ------------- | ------------ | ------------------------ | ---- | ----------- |
| 81.95.119.130   | FusionPBX  | Debian 9      | pbx130       | pbx130.stcall.be         | yes  | SSH acess   |
| 81.95.119.153   | FusionPBX  | Debian 9      | pbx153       | pbx153.stcall.be         | no   | FA Fierwall |
| 213.144.214.200 | FusionPBX  | Debian 12     | pbx200       | pbx200.scopcall.eu       | yes  |             |
| 213.144.214.244 | FusionPBX  | Debian 12     | pbx244       | pbx244.scopcall.eu       | yes  |             |
| 81.95.124.53    | ViciBox 10 | openSUSE      | crm53        | crm53.stcall.be          | no   | Old OS      |
| 213.144.214.231 | ViciBox 12 | openSUSE 15.6 | crm231       | crm231.scopcall.eu       | yes  |             |
| 213.144.214.241 | Vicidial 9 | openSUSE 15   | crm241       | crm241.scopcall.eu       | no   | Old OS      |
| 213.144.214.243 | Vicidial 9 | openSUSE 15   | crm243       | crm243.scopcall.eu       |      |             |
| 213.144.214.252 | Docker     | Debian        | docker252    | docker252.scopcall.eu    |      |             |
| 162.19.231.240  | Docker     | Debian        | vps-7623759c | vps-7623759c.vps.ovh.net | yes  |             |

## Step 1 — Clone the Repository in Home Directory

```bash
cd ~
git clone https://github.com/Maher-Amara/Fail2BanEntreprise.git

# or
cd Fail2BanEntreprise
git pull

cd ~/Fail2BanEntreprise/agent
```

---

## Step 2 — Install prerequisites (ipset, iptables, Fail2Ban)

### ViciDial / ViciBox (openSUSE / SLES):**

```bash
sudo zypper refresh && zypper install iptables ipset fail2ban
```

### FusionPBX / Debian / Ubuntu:**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y iptables ipset fail2ban iptables-persistent ipset-persistent
```

## Step 3 — Baseline Firewall Ordering (iptables + ipset)

### Create ipset sets

```bash
# Whitelist: never banned; referenced early as ACCEPT
sudo ipset create whitelist hash:net -exist

# Per-category blacklists (with timeouts where policy requires)
sudo ipset create ssh   hash:ip -exist
sudo ipset create sip   hash:ip -exist
sudo ipset create db    hash:ip -exist
sudo ipset create web   hash:ip -exist
sudo ipset create proxy hash:ip -exist
sudo ipset create email hash:ip -exist

# Fallback blacklist
sudo ipset create blacklist hash:ip -exist
```

Verify sets are created:

```bash
sudo ipset list -n
```

Immediately whitelist baseline IPs (including your current IP):

```bash
# Add baseline entries (CIDRs supported by whitelist hash:net)
sudo ipset add whitelist 127.0.0.1 -exist
sudo ipset add whitelist 196.179.222.182 -exist
sudo ipset add whitelist 162.19.231.240 -exist
sudo ipset add whitelist 164.132.47.223 -exist
sudo ipset add whitelist 213.144.214.192/26 -exist
sudo ipset add whitelist 81.95.124.1/26 -exist
sudo ipset add whitelist 81.95.119.128/26 -exist
sudo ipset add whitelist ${MYIP} -exist

# Quick checks: membership and rule presence
sudo ipset test whitelist ${MYIP} || true
```

### Insert minimal, ordered iptables rules

Target order in `INPUT`:

1. `ACCEPT` state `RELATED,ESTABLISHED`
2. `ACCEPT` loopback interface (`lo`)
3. `ACCEPT` whitelist ipset (`whitelist`)
4. `DROP` per‑category ipset sets (`ssh`, `sip`, `db`, `web`, `proxy`, `email`) and/or `blacklist`
5. Specific `ACCEPT`s (ssh/http/https/quic/sip/rtp/vpn/other ports)
6. Final policy `DROP`

```bash
# 1. Update policy to ALLOW by default (to prevent lockouts while configuring)
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT

# 2. Flush existing rules to start with a clean slate
sudo iptables -F
sudo iptables -X
sudo iptables -t nat -F
sudo iptables -t nat -X
sudo iptables -t mangle -F
sudo iptables -t mangle -X

# 3. Early stateful accept
sudo iptables -A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# 4. Accept loopback traffic
sudo iptables -A INPUT -i lo -j ACCEPT

# 5. Office/VPN/IP infra whitelist via ipset
sudo iptables -A INPUT -m set --match-set whitelist src -j ACCEPT

# 6. Per-category drops (evaluate early)
sudo iptables -A INPUT -m set --match-set ssh   src -j DROP
sudo iptables -A INPUT -m set --match-set sip   src -j DROP
sudo iptables -A INPUT -m set --match-set db    src -j DROP
sudo iptables -A INPUT -m set --match-set web   src -j DROP
sudo iptables -A INPUT -m set --match-set proxy src -j DROP
sudo iptables -A INPUT -m set --match-set email src -j DROP
sudo iptables -A INPUT -m set --match-set blacklist src -j DROP

# 7. Specific services/ports
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT      # SSH
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT      # HTTP
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT     # HTTPS
sudo iptables -A INPUT -p udp --dport 443 -j ACCEPT     # HTTP/3 (QUIC)

# 8. Change default policy finally to block (DROP)
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT
```

### Persist firewall and ipset across reboots

#### debian

```bash
# Install persistence helpers
sudo apt-get update && sudo apt-get install -y iptables-persistent ipset-persistent

# Save current rules
sudo iptables-save   | sudo tee /etc/iptables/rules.v4 >/dev/null
sudo ipset save      | sudo tee /etc/ipset.conf        >/dev/null
sudo netfilter-persistent save

# Enable restore services
sudo systemctl enable netfilter-persistent
sudo systemctl start netfilter-persistent
sudo systemctl status netfilter-persistent --no-pager
```

#### openSuse

```bash
# Save current rules
sudo mkdir -p /etc/iptables
sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null
sudo ipset save    | sudo tee /etc/ipset.conf        >/dev/null

# Install restore units from repository (IPv4 + ipset)
sudo cp ~/Fail2BanEntreprise/agent/system/iptables-restore.service /etc/systemd/system/iptables-restore.service
sudo cp ~/Fail2BanEntreprise/agent/system/ipset-restore.service    /etc/systemd/system/ipset-restore.service

sudo systemctl daemon-reload
sudo systemctl enable iptables-restore ipset-restore
sudo systemctl start  iptables-restore ipset-restore

# Verify
sudo systemctl status iptables-restore --no-pager
sudo systemctl status ipset-restore    --no-pager
```

## Step 4 — Install Fail2Ban Actions (ipset + f2be)

```bash
sudo cp ~/Fail2BanEntreprise/agent/action.d/f2be.conf  /etc/fail2ban/action.d/f2be.conf
sudo cp ~/Fail2BanEntreprise/agent/action.d/ipset.conf /etc/fail2ban/action.d/ipset.conf
```

## Step 5 — Install jail.local (per‑platform baseline)

Choose the file that matches your platform:

```bash
# ViciDial / ViciBox
sudo cp ~/Fail2BanEntreprise/agent/jails/vicidial.conf /etc/fail2ban/jail.local

# FusionPBX
sudo cp ~/Fail2BanEntreprise/agent/jails/fusionpbx.conf /etc/fail2ban/jail.local

# Generic Debian (Debian <= 11)
sudo cp ~/Fail2BanEntreprise/agent/jails/debian.conf /etc/fail2ban/jail.local

# Generic Debian 12 / 13 (using systemd-journald)
sudo cp ~/Fail2BanEntreprise/agent/jails/debian12.conf /etc/fail2ban/jail.local

> **⚠️ Before reloading:** Edit `jail.local` and verify the `ignoreip` line includes your office IP and VPN exit IP. Getting blocked by any jail locks out SSH + web + SIP simultaneously.

```ini
# Already set in all configs — adjust if needed:
ignoreip = 127.0.0.1/8 ::1 196.179.222.182 162.19.231.240 164.132.47.223 213.144.214.192/26 81.95.124.0/26 81.95.119.128/26
```

## Step 6 — Enable and Reload Fail2Ban

```bash
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
sudo systemctl status fail2ban --no-pager

# Verify jails are active
sudo fail2ban-client status
```

## Step 7 — Install the Agent

```bash
# Copy agent binary
sudo cp ~/Fail2BanEntreprise/agent/agent.py /usr/local/bin/f2b-agent
sudo chmod +x /usr/local/bin/f2b-agent
sudo cp ~/Fail2BanEntreprise/agent/f2b-agent.conf.example /etc/f2b-agent.conf

# Verify
f2b-agent help
```

## Step 8 — Register This Server in the Dashboard

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

## Step 9 — Install agent systemd service

```bash
sudo cp ~/Fail2BanEntreprise/agent/system/f2b-agent.service /etc/systemd/system/f2b-agent.service
sudo systemctl daemon-reload
sudo systemctl enable f2b-agent
sudo systemctl restart f2b-agent
sudo systemctl status f2b-agent --no-pager
```

## Step 10 - Restart fail2ban fresh for immediat full log scan

first remove previous runs to start fresh

```bash
# stop fail2ban
sudo systemctl stop fail2ban

# Remove fail2ban database
sudo rm -f /var/lib/fail2ban/fail2ban.sqlite3

# start fail2ban
sudo systemctl start fail2ban

# Watch logs
sudo tail -f /var/log/fail2ban.log
```
