---
version: alpha
name: BUSIBER OSINT
description: Turkish OSINT operations console with dark surfaces and turquoise status accents.
colors:
  primary: "#00e5d4"
  background: "#080b10"
  surface: "#0d1117"
  text: "#e6edf3"
  muted: "#7d8590"
  border: "#21262d"
typography:
  sans:
    fontFamily: "Inter, system-ui, sans-serif"
  mono:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace"
rounded:
  control: "3px"
  dialog: "8px"
spacing:
  dialog-padding: "28px"
components:
  completion-dialog:
    width: "420px"
---

# Product identity

This is an existing Turkish operations dashboard for domain discovery and service analysis. Preserve its dark technical console, compact data display, turquoise actions, and persistent scan completion labels. Use plain Turkish for actions and completion feedback.

## Runtime ownership

The final `:root` parity layer in `src/index.css` is the canonical token source. This document mirrors those values; it does not generate a separate theme. Components consume `--primary-color`, `--card-bg`, `--text-main`, `--text-muted`, `--border-color`, and `--mono` directly.

## Completion feedback

`src/components/ScopeReadyDialog.tsx` owns scope-completion feedback. Its styled native dialog uses modal focus, an inert background, Escape dismissal, a visible focused button, and a width bounded by the viewport. The scope remains available after dismissal. The dialog identifies the domain and distinguishes a populated scope from an empty one.

Automatic scope generation uses the existing active web-service criteria in `getScopeOutput`. Completed analyses produce a dialog; cancelled or stopped analyses do not. Keep partial scan failures visible in the underlying result summary. Do not introduce decorative motion for this completion notification.

Generate the scope from committed final scan results and store it per domain in the user's local cache. Display saved scopes before result rows, including empty scopes. Reselecting a domain or reloading the page must preserve its scope without requiring the manual generation button; restoring a saved scope does not replay completion notifications.

## Authentication

App.tsx owns the Turkish login form and session recovery; server/routes/auth.ts owns identity decisions. Preserve existing visual tokens. On startup verify the HttpOnly cookie with the server before showing cached dashboard data. Never persist credentials or session tokens in browser storage. Disable duplicate login submission and show inline errors. Expiry aborts scans and returns to login. Failed logout must remain visible and allow retry.
