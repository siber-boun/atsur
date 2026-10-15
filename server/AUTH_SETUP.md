# Backend authentication setup

Set these values in the Render service environment before deploying:

- `OSINT_LOGIN_EMAIL`: the authorized login email.
- `OSINT_LOGIN_PASSWORD_HASH`: create it locally with `cd server && node scripts/hash-password.mjs`; paste the printed value directly into Render. The password itself is never printed or stored in the repository.
- `OSINT_SESSION_SECRET`: a random secret of at least 32 bytes (`openssl rand -base64 48`).
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins. Default: `https://osint-2pq.pages.dev,http://localhost:5173,http://127.0.0.1:5173`.

After deploying the backend, deploy the frontend. The browser holds a two-hour signed bearer token in `sessionStorage`; logout revokes it for this backend process. Login attempts are limited to 10 per IP per 15 minutes. A Render restart invalidates revoked-token entries; all other tokens still expire within two hours.

Authenticated API calls default to 600 requests per user per 15 minutes. Tune with `USER_API_REQUESTS` and `USER_API_WINDOW_MS` if the expected scan volume needs a different budget.

All `/api/*` routes except `/api/auth/login` require authentication. `/health` remains available for Render health checks. The frontend no longer contains a shared password. Existing local scan caches stay associated with the email returned by the backend.
