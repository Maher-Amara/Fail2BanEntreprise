# 🚀 Fail2BanEntreprise

**Distributed Ban Intelligence for VoIP & High-Exposure Infrastructure**

Fail2BanEntreprise is a self-hosted, full-stack Next.js security platform that centralises, enriches, and orchestrates Fail2Ban decisions across multiple servers in real time.

Designed for VoIP environments (ViciDial, FusionPBX) and internet-exposed servers, it transforms traditional Fail2Ban into a distributed, intelligence-driven defence system — without external dependencies or complex clusters.

> **Built from a real incident.** This project was born from the forensic analysis of a production ViciDial server ([Security.md](../forensics/Security.md)) where the **complete absence of Fail2Ban** allowed a SIP brute-force flood (~204,000 attempts from 3 IPs) to cascade into a full platform outage — agents disconnected, calls blocked, processes spiralling, DAHDI destabilised. **Fail2Ban would have stopped it in seconds**, reducing 204,000 requests to ~9. Fail2BanEntreprise ensures that when one server learns about a threat, every server knows instantly.

---

## 📖 Documentation

| Document | Description |
| --- | --- |
| [Fail2Ban.md](Fail2Ban.md) | Complete ViciDial/ViciBox hardening guide — 11 jails, prerequisites, centralised ban propagation |
| [Security.md](../forensics/Security.md) | Full forensic report of the `vic-incident` DoS that motivated this project |

---

## 🧠 Core Philosophy

| Principle | Meaning |
| --- | --- |
| **Keep it simple** | No unnecessary clusters, no over-engineering — 1 Redis container + 1 Next.js container |
| **Stay sovereign** | No data sharing with external services, no cloud dependency |
| **React fast** | Ban propagation in seconds across all nodes |
| **Think smarter** | Threat intelligence + scoring instead of blind banning |
| **Defence in depth** | Fail2Ban is reactive — combine with SSH hardening, VPN-only access, monitoring, and firewall hygiene |

---

## 💥 The Problem — Why This Exists

A production ViciDial server with **zero Fail2Ban protection** was hit by a coordinated attack:

| Vector | Volume | What Happened |
| --- | --- | --- |
| SIP brute-force | **~204,000** attempts from 3 IPs | Saturated Asterisk → agents couldn't register → calls blocked → AMI collapsed → 200+ zombie processes → MySQL exhaustion → full outage |
| SSH brute-force | **87** attempts from 4 IPs | All unblocked — root password auth open to the internet |
| Apache probe | **1** request | Reconnaissance on `/server-status` |

**With Fail2Ban configured at `maxretry=3`**, all three SIP attackers would have been banned within seconds — reducing **204,000 requests to ~9**. None of the cascading failures would have occurred.

**With Fail2BanEntreprise**, the ban from the first server would have propagated to every other dialer in the fleet — **instantly**.

> See the full attack timeline, cascade analysis, and gap analysis in [Security.md](../forensics/Security.md).

---

## ⚙️ Architecture

Minimal, efficient, and production-ready:

```txt
┌─────────────────────────────────────────────────────────┐
│                  Fail2BanEntreprise                     │
│                                                         │
│   ┌──────────────┐       ┌──────────────────────────┐   │
│   │    Redis     │◄─────►│   Next.js (UI + API)     │   │
│   │  (Docker)    │       │   • Dashboard            │   │
│   │              │       │   • /api/ban             │   │
│   │  • Ban store │       │   • /api/unban           │   │
│   │  • Pub/Sub   │       │   • /api/sync            │   │
│   │  • Whitelist │       │   • /api/whitelist       │   │
│   │  • Metadata  │       │   • JWT + API key auth   │   │
│   └──────────────┘       └──────────┬───────────────┘   │
│                                     │                   │
└─────────────────────────────────────┼───────────────────┘
                                      │ HTTPS
          ┌───────────────────────────┼───────────────────┐
          │                           │                   │
    ┌─────▼─────┐   ┌────────────────▼┐   ┌─────────────▼──┐
    │ ViciDial  │   │   FusionPBX     │   │  Debian Host   │
    │ Server 1  │   │   Node          │   │  (SSH/Apache)  │
    │           │   │                 │   │                │
    │ Fail2Ban  │   │  Fail2Ban       │   │  Fail2Ban      │
    │ Agent     │   │  Agent          │   │  Agent         │
    └───────────┘   └─────────────────┘   └────────────────┘
```

| Component | Role |
| --- | --- |
| **Next.js** | Full-stack app — dashboard UI + API routes (ban, unban, sync, whitelist) |
| **Redis** | Single Docker instance — ban storage, pub/sub propagation, whitelist, IP metadata |
| **Fail2Ban agents** | Lightweight scripts (bash) on each server — push ban events, pull global bans |

No Redis cluster. No microservice sprawl. Just fast and controllable.

---

## 🛡️ Service Coverage — 11 Jails

Fail2BanEntreprise orchestrates bans across all services defined in the [hardening guide](Fail2Ban.md):

| # | Jail | Service | Threat | Ban Duration |
| --- | --- | --- | --- | --- |
| 1 | `asterisk-iptables` | SIP / IAX | Registration brute-force, credential stuffing, toll fraud | 70 days |
| 2 | `ssh-iptables` | SSH | Password brute-force, root login attempts | 70 days |
| 3 | `apache-auth` | Apache | ViciDial admin UI / agent screen login attacks | 1 hour |
| 4 | `apache-badbots` | Apache | Automated scanners, vulnerability probes | 70 days |
| 5 | `mysqld-auth` | MySQL / MariaDB | Database credential attacks | 24 hours |
| 6 | `asterisk-ami` | AMI (port 5038) | Manager interface brute-force, call origination attempts | 70 days |
| 7 | `asterisk-webrtc` | WebRTC (WSS 8089) | Browser softphone auth attacks | 24 hours |
| 8 | `vicibox-portal` | ViciBox Portal | Admin portal login brute-force | 24 hours |
| 9 | `dovecot` | IMAP / POP3 | Email credential stuffing | 24 hours |
| 10 | `postfix-sasl` | SMTP / SASL | Relay abuse, spam relay attempts | 70 days |
| 11 | `recidive` | Fail2Ban meta-jail | Repeat offenders across any jail → all-port ban | 70 days |

> **Key insight from the incident:** The Asterisk jail alone (`maxretry=3`) would have reduced 204,000 SIP attack requests to **~9**, preventing the entire cascading outage. See [Fail2Ban.md § 3](Fail2Ban.md#3-jail-1--asterisk-sip--iax-brute-force--registration-attacks).

---

## 🔄 Core Capabilities

### 🌐 Centralised Ban Orchestration

- All Fail2Ban instances push ban/unban events to the central API
- Global ban list shared across ViciDial servers, FusionPBX nodes, and Debian hosts
- When an IP is banned on **one** server, it is banned on **all** servers within seconds
- Eliminates the scenario where attackers rotate across nodes after being blocked on one dialer

> **From the incident:** The attacker IP `138.68.185.26` generated **136,099 SIP failures** on a single server. In a multi-server fleet without centralised banning, the same IP could simultaneously attack other dialers unimpeded.

### ⚡ Real-Time Sync (Redis Pub/Sub)

| Feature | Mechanism |
| --- | --- |
| Ban storage | Redis hash — IP, jail, reason, timestamp, server origin |
| Whitelist | Redis set — synced to all nodes |
| Metadata | Country, ASN, threat score per IP |
| Propagation | Pub/Sub — near-instant fan-out to all subscribers |
| Expiry | TTL matches `bantime` — bans expire consistently across nodes |

### 🖥️ Unified Control Panel

Built entirely with Next.js — a single interface to manage security across the entire fleet:

- **Global ban dashboard** — all active bans across all servers and jails, with **GeoIP location** (country, city, coordinates) displayed for every IP using the GeoLite2 City database
- **Filtering** — by IP, server, jail, country, threat score
- **Manual / one-click unban** — no more SSH-ing into individual servers
- **"Unban Me" button** — a self-service page that detects the visitor's IP and lets them request an immediate unban + 24-hour whitelist. Designed for team members or agents who get caught by an overzealous jail — one click removes the ban across all nodes and adds a temporary whitelist entry so they can resume work without waiting for an admin
- **Audit logs** — full history of ban/unban actions with attribution
- **Whitelist management** — central whitelist synced to all nodes (permanent and temporary 24h entries)

### 🔐 Secure API Layer

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/ban` | POST | API key | Fail2Ban agent reports a new ban |
| `/api/unban` | POST | API key | Fail2Ban agent reports an unban |
| `/api/unban-me` | POST | None | Self-service unban — detects visitor IP, unbans globally, adds 24h whitelist |
| `/api/sync` | GET | API key | Agent pulls current global ban list + whitelist |
| `/api/whitelist` | GET/POST | JWT | Admin manages central whitelist |
| `/api/geoip` | GET | JWT | GeoIP lookup — resolves IP to country, city, coordinates (GeoLite2 City) |
| `/api/dashboard` | GET | JWT | Dashboard data (bans, stats, top attackers, GeoIP locations) |

- **API keys** for Fail2Ban agent authentication (server-to-server)
- **JWT** for admin UI sessions
- Rate-limited and hardened endpoints

### 🛡️ Smart Whitelisting

Central whitelist synced to all nodes — prevents banning:

| Category | Examples | Why |
| --- | --- | --- |
| Internal infrastructure | Server subnet, loopback | Prevents self-banning |
| Office / VPN IPs | Static exit IPs | Team access must never be blocked |
| SIP providers | Trunk IPs | Inbound/outbound call paths |
| Agent device IPs | Office IPs with WebRTC clients | Agents failing auth during a DoS are victims, not attackers |

> **From the incident:** During the DoS, Asterisk logged **1,599 failed auth attempts** from a legitimate Belgium agent IP — those were agents trying to register while the server was overloaded. Without whitelisting, Fail2Ban would have banned the agents on top of the DoS.

---

## 🧬 Threat Intelligence & IP Scoring

Fail2BanEntreprise goes beyond reactive banning by integrating external intelligence and applying dynamic scoring.

### 🔗 Integrated Sources

| Source | Type | Data |
| --- | --- | --- |
| [AlienVault OTX](https://otx.alienvault.com/) | Open threat feed | Known malicious IPs, pulse indicators |
| [Pulsedive](https://pulsedive.com/) | Threat intelligence | Risk scores, threat categories |
| [IntelMQ](https://intelmq.org/) | Incident handling | Automated threat processing |
| [AbuseHelper](https://github.com/abusesa/abusehelper) | Abuse reporting | ISP abuse feeds |
| [MISP](https://www.misp-project.org/) | Threat sharing platform | IoC correlation, community feeds |

### 🧮 IP Scoring Engine

Each IP is evaluated using a dynamic scoring model combining local Fail2Ban data with external intelligence:

```txt
score =
    (fail2ban_hits × 2)                    # Local attack frequency
  + (listed_in_otx      ? 20 : 0)         # AlienVault match
  + (listed_in_misp     ? 25 : 0)         # MISP indicator match
  + (listed_in_pulsedive ? 15 : 0)        # Pulsedive risk
  + (repeat_offender    ? 15 : 0)         # Banned ≥5 times across jails
  + (high_risk_asn      ? 10 : 0)         # Known bulletproof hosting
```

### 🎯 Smart Actions Based on Score

| Score Range | Action | Example |
| --- | --- | --- |
| **0–20** (Low) | Temporary ban (24h) | Single SSH failure burst |
| **21–50** (Medium) | Extended ban (70 days) | Repeated SIP scanning |
| **51–80** (High) | Global permanent ban across all nodes | Known threat intel match + repeat offender |
| **Whitelisted** | Ignore | Office IP, SIP trunk, internal infra |

---

## 🔌 Fail2Ban Agent Integration

Custom Fail2Ban actions replace default local-only behaviour:

### On Ban (any jail triggers)

```txt
Fail2Ban detects attack → local iptables ban
    → POST /api/ban { ip, jail, server, timestamp }
        → Redis stores ban + publishes to Pub/Sub
            → All other nodes receive and apply ban locally
```

### On Unban (ban expires or manual)

```txt
Ban expires / admin unbans → local iptables unban
    → POST /api/unban { ip, jail, server }
        → Redis removes ban + publishes unban
            → All nodes remove local ban
```

### Periodic Sync (resilience)

```txt
Every 60s: GET /api/sync
    → Agent pulls current global ban list + whitelist
    → Reconciles local iptables with global state
    → Catches any missed Pub/Sub messages
```

---

## 📊 Monitoring

Ban activity is visualised in real time. Every IP displayed in the dashboard is enriched with **GeoIP location data** (country, city, coordinates) via the [GeoLite2 City](https://github.com/wp-statistics/GeoLite2-City) database.

| Panel                   | Description                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| **World Heatmap**       | Geographic distribution of banned IPs — plotted on an interactive map using GeoLite2 City  |
| **Ban Timeline**        | Time-series graph of bans per jail over time                                               |
| **Active Bans**         | Current ban count per jail across all servers, each IP showing country and city             |
| **Top Attackers**       | Most-banned IPs with country, city, ASN, and hit count                                     |
| **Jail Distribution**   | Pie chart — which services are targeted most                                               |
| **Event Log**           | Live feed of ban/unban events with IP, jail, server, GeoIP location, and timestamp         |
| **Unban Me**            | Self-service page — shows the visitor's detected IP and a single button to unban + whitelist for 24 hours across all nodes |

---

## 📡 Infrastructure Coverage

Optimised for Platform:

- **ViciDial / ViciBox**
- **FusionPBX**
- **Debian / openSUSE servers**

---

## 💡 Key Advantages

| | |
| --- | --- |
| 🔥 **Operational efficiency** | No more SSH-ing into multiple servers — one interface controls everything |
| ⚡ **Speed** | Ban propagation in seconds via Redis Pub/Sub |
| 🧠 **Intelligence-driven** | Not just blocking — understanding threats via scoring + external feeds |
| 🔒 **Sovereign** | Self-hosted, no data shared externally — a private CrowdSec alternative |
| 📈 **Observable** | Built-in GeoIP heatmaps, ban timelines, and real-time event feeds |
| 🏗️ **Minimal footprint** | 1× Redis container + 1× Next.js container — no cluster overhead |
| 🧩 **Stack-native** | Works with ViciDial, FusionPBX, FreeSWITCH |

---

## 🚀 Positioning

Fail2BanEntreprise is:

> **A private CrowdSec alternative** without data sharing
> \+
> **A lightweight SIEM-style layer** for ban intelligence
> \+
> **A real-time security orchestrator** for VoIP infrastructure

Built from the lessons of a [real-world DoS incident](../forensics/Security.md) — not theoretical threat models.
