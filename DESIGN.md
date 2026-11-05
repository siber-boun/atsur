---
version: alpha
name: ATSUR
description: Turkish passive OSINT console ("at sürenindir") with dark surfaces, turquoise status accents and a galloping-horse mark.
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

ATSUR is a Turkish operations console for domain discovery, service analysis and findings. Preserve its dark technical console, compact data display, turquoise actions, and persistent scan completion labels. Use plain Turkish for actions and completion feedback.

The mark is a galloping horse silhouette (`src/components/Logo.tsx`, `public/atsur.svg`) in the primary color on a dark teal tile, next to the mono wordmark "AT**SUR**" (SUR in the primary color) and the lowercase tagline "at sürenindir".

## Console structure

A sticky top bar holds the brand, the active-target selector, the add-domain command field, the two scan actions and the account button. A left rail (a horizontal strip below 900 px) switches pages: Dashboard, Varlıklar, Bulgular, Teknolojiler, Kapsam, AI Analiz, and under "Yönetim" Hedefler. Pages are hash routes. Asset details open in a right-side panel next to the table, not in a modal. Severity colors: Yüksek red, Orta amber, Düşük blue, Bilgi gray; badges always carry a text label so color is never the only signal.

## Runtime ownership

The final `:root` parity layer in `src/index.css` is the canonical token source. This document mirrors those values; it does not generate a separate theme. Components consume `--primary-color`, `--card-bg`, `--text-main`, `--text-muted`, `--border-color`, and `--mono` directly.

## Completion feedback

`src/components/ScopeReadyDialog.tsx` owns scope-completion feedback. Its styled native dialog uses modal focus, an inert background, Escape dismissal, a visible focused button, and a width bounded by the viewport. The scope remains available after dismissal. The dialog identifies the domain and distinguishes a populated scope from an empty one.

Automatic scope generation uses the existing active web-service criteria in `getScopeOutput`. Completed analyses produce a dialog; cancelled or stopped analyses do not. Keep partial scan failures visible in the underlying result summary. Do not introduce decorative motion for this completion notification.

Generate the scope from committed final scan results and store it per domain in the user's local cache. Show the saved scope on the Kapsam page and its summary on the Dashboard, including empty scopes. Reselecting a domain or reloading the page must preserve its scope without requiring the manual generation button; restoring a saved scope does not replay completion notifications.

## Authentication

App.tsx owns the Turkish login form and session recovery; server/routes/auth.ts owns identity decisions. Preserve existing visual tokens. On startup verify the HttpOnly cookie with the server before showing cached dashboard data. Never persist credentials or session tokens in browser storage. Disable duplicate login submission and show inline errors. Expiry aborts scans and returns to login. Failed logout must remain visible and allow retry.
