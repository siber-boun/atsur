# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is the **subdomainfinder** project: a passive subdomain / port / web-service OSINT scanner. The actual app lives in `dns-platform/` — a React+Vite frontend paired with an Express scan backend (`dns-platform/server/`). See `dns-platform/README.md` (or the root `README.md`, both describe the same app) for feature details.

Two unrelated side projects (`cybermaturity`, `portscan`) used to be committed into this same repo by mistake and have since been split out into their own repos (`siber-boun/cybermaturity`, `siber-boun/portscan`). If you see references to those elsewhere, they no longer belong here.

## Commands

```bash
cd dns-platform
npm install
npm run dev        # Vite dev server (proxies /api to localhost:3001 in dev)
npm run build       # tsc -b then vite build
npm run lint
npm run preview

cd dns-platform/server
npm install
npm run dev          # or whatever the server's start script is — check server/package.json
```

No test runner/tests exist in this project.

## Architecture

- **Frontend** (`dns-platform/src/`): React + TypeScript + Vite. Deployed to **GitHub Pages** with `base: '/subdomainfinder/'` set in `vite.config.ts`. In dev, `/api` requests are proxied to `http://localhost:3001`; in production the frontend calls the deployed backend directly via `VITE_API_URL`.
- **Backend** (`dns-platform/server/index.ts`): Express + CORS API deployed separately to **Render.com** (per README, cold-starts after 15 min idle — first scan can take ~40s). It does the actual network work:
  - Subdomain enumeration via `crt.sh` certificate transparency logs.
  - Port scanning ~24 common HTTP/HTTPS/panel ports (raw TCP `net.Socket` connect probing).
  - HTTP HEAD probing of open ports to get status codes and detect Cloudflare (via the `server` response header).
- **Deploy** (`.github/workflows/deploy.yml`): pushes to `main` trigger a build with `working-directory: ./dns-platform`, writing `VITE_API_URL=https://subdomainfinder-da2l.onrender.com` into `.env` before building, then publishing `dns-platform/dist` to GitHub Pages. The backend on Render is deployed independently (not by this workflow).
- Client-side state (scan history, multiple "user profiles") is kept in `localStorage` — there's no server-side persistence beyond the scan itself.

## Language

UI strings, README, and backend comments are in Turkish. Match the surrounding file when editing.
