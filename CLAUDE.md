# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**subdomainfinder** (branded "BUSIBER OSINT Platform") — a passive OSINT tool that enumerates a target company's subdomains and profiles the web services running on them. Live at https://siber-boun.github.io/subdomainfinder/.

The whole app lives under `dns-platform/`; the repo root holds only the README, the Pages workflow, and this file. `dns-platform` is just the folder name Vite scaffolded with — it is not a second project.

## Commands

```bash
# Frontend (dns-platform/)
cd dns-platform
npm install
npm run dev        # Vite dev server -> http://localhost:5173/subdomainfinder/
npm run build      # tsc -b (typecheck) then vite build
npm run lint
npm run preview

# Backend (dns-platform/server/) — separate package, install separately
cd dns-platform/server
npm install
npm start          # tsx index.ts -> http://localhost:3001
```

Run both together for local work. There is no test runner and no tests (`server`'s `test` script is the npm placeholder that exits 1).

**Local dev gotcha:** `vite.config.ts` proxies `/api` to `localhost:3001`, but that proxy only takes effect when `VITE_API_URL` is empty. `dns-platform/.env` sets `VITE_API_URL` to the deployed Render URL, so by default `npm run dev` talks to the *production* backend (which cold-starts, ~40s) and ignores your local server. Clear or comment out that variable to exercise the local backend.

## Architecture

Two independently deployed halves, no shared code, no database.

**Frontend** — `dns-platform/src/App.tsx` is the entire app (~880 lines): auth screens, dashboard, scan orchestration, and rendering all in one component; `index.css` (~1080 lines) is the entire stylesheet. There is no router and no component library — adding a feature usually means extending `App.tsx` and `index.css`.

- Built with `base: '/subdomainfinder/'`, so it only works under that path prefix.
- `API_BASE_URL = import.meta.env.VITE_API_URL || ''` — empty string makes calls relative so the Vite dev proxy can pick them up.
- "Auth" is `localStorage` only (key `osint_users`), storing passwords in plaintext next to each user's domains and scan caches (`subdomainsCache`, `subdomainDetailsCache`, `emailSecCache`). No server-side accounts or sessions exist. Old records may hold subdomains as plain strings instead of objects; the code carries explicit legacy-string fallbacks — preserve them when touching that data.
- The scan flow is progressive: `/api/scan` first, then per-subdomain `/api/analyze`, `/api/tech`, and `/api/advanced` fire independently and fill in the table as they resolve, each tracked by its own `analyzing` / `techAnalyzing` / `advancedAnalyzing` flag.
- A `wakingUp` state drives the "server is waking up" progress animation for Render's cold start.
- "Generate scope" (`handleGenerateScope`) produces a comma-separated pentest scope list: it drops mail/DNS hostnames by prefix (`mail.`, `webmail.`, `smtp.`, `ns1.`, `mx.`, …) and keeps only subdomains that returned an HTTP status from an open port.

**Backend** — `dns-platform/server/index.ts` (~470 lines, Express 5 + CORS, run with `tsx`, CommonJS). Every endpoint is `GET` and validates the target with `isValidDomain` before doing network work. Raw `net.Socket` connect probes and `https`/`http` HEAD requests do the scanning; `rejectUnauthorized: false` is deliberate so broken-TLS hosts still get profiled.

| Endpoint | Purpose |
|---|---|
| `/api/scan?domain=` | Subdomain enumeration, merging **crt.sh** certificate transparency + **HackerTarget** hostsearch; each result is tagged with its `source` |
| `/api/crt?domain=` | Thin crt.sh passthrough proxy |
| `/api/analyze?subdomain=` | Resolves IP, TCP-probes ~24 HTTP/HTTPS/panel ports (`HTTP_HTTPS_PORTS`), HEADs the open ones for status code + Cloudflare detection |
| `/api/tech?subdomain=` | Technology fingerprinting against `TECH_SIGNATURES` (CMS / e-commerce / frontend / backend), matching response headers and HTML body regexes |
| `/api/advanced?subdomain=` | TLS certificate info graded A–F by days-to-expiry (self-signed forces F), security-header score out of 100 graded A–E, and WAF detection (Cloudflare, Sucuri, …) |
| `/api/email-sec?domain=` | SPF / DMARC / DKIM lookups over DNS TXT, scored and graded |
| `/health` | Liveness check (used to wake the Render dyno) |

**Deployment** — `.github/workflows/deploy.yml` builds on every push to `main` with `working-directory: ./dns-platform`, writes `VITE_API_URL=https://subdomainfinder-da2l.onrender.com` into `.env` at build time, and publishes `dns-platform/dist` to GitHub Pages. The backend is deployed separately on **Render.com** and is *not* touched by this workflow — changing `server/index.ts` requires a Render deploy to take effect in production. Render sleeps after ~15 min idle.

## Conventions

UI strings, code comments, and both READMEs are in Turkish; commit messages are a mix of Turkish and English Conventional Commits. Match the file you are editing.
