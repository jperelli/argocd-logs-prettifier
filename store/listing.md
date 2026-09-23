# Chrome Web Store listing

Copy these into the developer dashboard (https://chrome.google.com/webstore/devconsole).

## Store listing

**Name:** Argo CD Logs Prettifier

**Summary (132 chars max):**
Structured, filterable view of JSON and logfmt log lines in the Argo CD pod Logs tab: level badges, filters, expandable records.

**Category:** Developer Tools

**Language:** English

**Description:**

Argo CD shows container logs as raw text. When your services log JSON (one object per line) or logfmt, the Logs
tab becomes a wall of braces that is hard to scan. This extension parses each line on the page and renders it as a
structured row, right inside the Argo CD UI:

- Level badge (TRACE to FATAL), timestamp, logger/category, message and extra fields per line
- Click a row to see the full record as colour-coded JSON, with copy buttons
- Level chips with counts to filter, a text filter, wrap and expand-all
- Recognises .NET (Microsoft.Extensions.Logging JSON), dapr, pino, Serilog compact, OpenTelemetry-style and
  logfmt lines; other lines are shown unchanged
- Works with Argo's own controls (container, follow, tail, since, filter, dark mode)
- A `{ } JSON` button in Argo's log toolbar toggles the view at any time

Setup: click the extension icon, add the URL of your Argo CD instance, allow access to that site. Nothing is sent
anywhere; the extension only reads what Argo CD already displays.

**Screenshots:** `store/screenshot-1.png` (1280x800).

**Icon:** `extension/icons/icon128.png`.

## Privacy tab

**Single purpose:** Render JSON/logfmt log lines in the Argo CD web UI Logs tab as structured, filterable rows.

**Permission justifications:**

- `storage`: remembers whether the structured view is on and the list of Argo CD URLs the user configured.
- `scripting`: registers the viewer content script on the Argo CD sites the user added in the options page.
- Host permissions (optional, `http(s)://*/*`): Argo CD is self-hosted, so the instance URL is not known in
  advance. Access is requested only for the URLs the user adds and can be revoked from the options page.

**Remote code:** none. **Data usage:** no user data is collected or transmitted.

**Privacy policy URL:** https://github.com/jperelli/argocd-logs-prettifier/blob/main/PRIVACY.md

## Release steps

1. Bump `version` in `extension/manifest.json` and `package.json`, add a section to `CHANGELOG.md`.
2. `npm test && npm run package` → `dist/argocd-logs-prettifier-<version>.zip`.
3. Upload the zip in the developer dashboard, update the listing text if needed, submit for review.
4. Tag and push: `git tag v<version> && git push origin v<version>` — the Release workflow builds the zip and attaches it to a GitHub release.
