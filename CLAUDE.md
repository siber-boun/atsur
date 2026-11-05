# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**ATSUR** ("at sürenindir"; formerly branded "BUSIBER OSINT") — a passive OSINT console that enumerates a target company's subdomains, profiles the services running on them, derives findings, and can have an LLM comment on the results. Live at https://osint.busiber.workers.dev/.

## Commands

```bash
# Frontend (repo root)
npm install
npm run dev        # Vite dev server -> http://localhost:5173/
npm run build      # tsc -b (typecheck, includes tsconfig.test.json) then vite build
npm run lint       # note: pre-existing errors remain in some server/lib files
npm test           # node --test --import tsx src/lib/*.test.ts
npm run preview

# Backend (server/) — separate package, install separately
cd server
npm install
npm start          # tsx index.ts -> http://localhost:3001 (needs OSINT_LOGIN_EMAIL + OSINT_LOGIN_PASSWORD_HASH)
npm test           # node --test --import tsx (all server/**/*.test.ts)
```

Local dev: `API_BASE_URL` is `''` in production builds and `VITE_API_URL || ''` in dev; with it empty, Vite proxies `/api` to `localhost:3001`. A local `.env` (gitignored) may set `VITE_API_URL` to a remote backend — clear it to use the local server.

## Architecture

Three deployable pieces: the Vite SPA (`src/`), a Cloudflare Worker (`worker/index.ts`, `wrangler.jsonc`) that serves `dist/` and reverse-proxies `/api/*` and `/health` to the Render backend, and the Express backend (`server/`). `shared/scanPorts.ts` (the 45 scanned ports) is imported by the backend. No database.

### Frontend (`src/`)

- `App.tsx` owns **all state and orchestration**: auth/session, domain list, scan flows (`fetchSubdomains`, `handleAnalyzeSubdomain`, `handleAnalyzeAll`, `handleAdvancedAnalysis`), the auto-analysis countdown state machine, abort refs, scope generation and localStorage persistence. It renders the login screen or `<ConsoleShell>` and exposes everything to pages through `ConsoleContext` (`src/lib/console.ts`, read with `useConsole()`). Keep timing/abort logic in App; pages only read context and call `actions`.
- Pages live in `src/views/` (Dashboard, Assets + AssetDrawer, Findings, Technologies, Scope, AI, Targets). Pages that need a selected target wrap their content in `TargetGate` (no target / loading / Render wake-up / error / empty states).
- Routing is hash-based (`src/lib/route.ts`): `#/assets?host=…&tech=…`. No router dependency.
- `src/lib/workspace.ts` `buildWorkspace()` derives everything a page shows for the selected domain (asset rows, stats, technology inventory, findings). `src/lib/findings.ts` holds the rule-based findings (severity `high|medium|low|info`); rules only fire on measured values. Unit tests: `src/lib/findings.test.ts`.
- `src/types.ts` mirrors backend response shapes (`SslInfo`, `SecurityInfo`, … match `server/lib/tls.ts` and `server/lib/evidence.ts`).
- Styles: `src/index.css` (legacy, several stacked theme layers; the last `:root` block is the live token source; login, radar/wake-up and `ScopeReadyDialog` styles still come from here) plus `src/styles/console.css` for the console (`ac-` prefixed classes, uses the same tokens).
- Persistence: `localStorage` key `osint_users` → per-email `UserData` (`domains`, `subdomainsCache` keyed by domain, `subdomainDetailsCache` keyed by **subdomain FQDN**, `emailSecCache`, `scopes`, `aiReports`). Old records may hold subdomains as plain strings; `normalizeSubdomainList` converts them on load — keep that path. View preferences (last target, AI provider) live in `atsur_prefs`.
- `?view=design-process` renders a standalone presentation (`src/views/DesignProcessView.tsx`), unrelated to the console.

### Backend (`server/`)

Express 5 + CORS, run with `tsx`, CommonJS. `index.ts` wires middleware (`requireTrustedRequest` → JSON body parser → `requireAuthentication` → in-flight limiter) and routes from `server/routes/`. Auth is a single account from env (`server/AUTH_SETUP.md`), HttpOnly cookie session in memory, CSRF header on non-GET. All scan endpoints validate the target with `isValidDomain` and the SSRF guard rejects private IPs; `rejectUnauthorized: false` is deliberate so broken-TLS hosts still get profiled.

| Endpoint | Purpose |
|---|---|
| `GET /api/scan?domain=&validate=1` | Subdomain enumeration over `server/sources/*` (crt.sh, Certspotter, RapidDNS, HackerTarget, key-gated sources), wildcard detection, optional DNS validation |
| `POST /api/brute` | Wordlist / permutation DNS discovery |
| `GET /api/analyze?domain=` | Resolves IP, TCP-probes the 45 ports, HTTP(S)-probes web candidates |
| `GET /api/advanced?subdomain=` | TLS (graded), security headers (score/grade/missing), WAF, cookies, technologies, live HTTP evidence |
| `GET /api/email-sec?domain=` | SPF / DMARC / DKIM / DNSSEC / MTA-STS / CAA, scored and graded |
| `GET /api/ai/providers`, `POST /api/ai/chat` | AI analysis; see `server/AI_SETUP.md` |
| `/api/auth/*`, `/health`, `/api/crt`, `/api/tech`, `/api/validate`, `/api/wildcard`, `/api/sources` | auth, liveness and helpers |

AI (`server/lib/ai/`): providers are configured only by env vars (keys never reach the browser). Claude uses the official `@anthropic-ai/sdk` with `fallbacks: "default"`; ChatGPT/Gemini/OpenRouter/OpenCode use an OpenAI-compatible `/chat/completions` stream. The JSON body limit is 256 KB for `/api/ai/chat` and 16 KB elsewhere. Provider 401/403 is mapped to 502 because the frontend treats 401 as session expiry.

### Deployment

Frontend + Worker: `npm run build` then `wrangler deploy` (config in `wrangler.jsonc`). The backend is deployed separately on **Render.com** (Root Directory: `server`) and is not deployed by any repo workflow — server changes need a Render deploy. Render sleeps after ~15 min idle (first request ~40 s; the UI shows a wake-up radar).

## Conventions

UI strings, code comments and the README are in Turkish; commit messages are a mix of Turkish and English Conventional Commits. Match the file you are editing.
