# Chrome Web Store Listing — Argo CD Logs Prettifier

> Last Updated: 2026-09-24

Copy the fields below into the developer dashboard (https://chrome.google.com/webstore/devconsole).
The store strips markdown, so the description is plain text.

## Store Listing

**Extension Name**

Argo CD Logs Prettifier

**Short Description** (132 chars max)

Turns JSON log lines in the Argo CD pod Logs tab into readable rows with level, time, message and filters.

**Detailed Description**

```
Makes JSON log lines in the Argo CD Logs tab readable, right inside the Argo CD page.

Argo CD shows container logs as plain text. When your services write one JSON object per line, the Logs tab
turns into a wall of braces that is hard to scan. This extension formats each line so you can read it at a
glance, and leaves everything else in Argo CD untouched.

FEATURES
• Every log line becomes a row showing its level, time, logger, message and extra fields.
• Click a row to see the complete record, nicely formatted, and copy it.
• Filter rows by level or by text, wrap long messages, expand or collapse all rows.
• Lines that are not structured are shown exactly as they are.
• Stays fast on busy logs: only the most recent lines are drawn, and scrolling up loads the earlier ones.
• Argo CD's own controls keep working: container selection, follow, tail, since, filter and dark mode.
• A button in Argo CD's log toolbar switches back to the original view at any time.

HOW TO USE
1. Open your Argo CD instance, click the extension icon and choose "Enable on this site". Chrome will ask you
   to allow the extension on that site.
2. Open any pod in Argo CD and go to its Logs tab. The formatted view appears automatically.
3. Use the { } JSON button in the log toolbar to switch between the formatted view and the original lines.

PRIVACY
Everything happens in your browser. The extension reads only the log lines already shown on the Argo CD page
and never sends them anywhere. It stores just two things: whether the formatted view is on, and the list of
Argo CD addresses you added.

PERMISSIONS
• "Read and change your data on <your Argo CD address>" — asked only for the sites you enable, so the extension
  can reformat the log lines on those pages. You can disable a site at any time from the same menu or from the
  extension's settings.

SUPPORT
Found a bug or have a suggestion? Open an issue at https://github.com/jperelli/argocd-logs-prettifier/issues

Version 1.2.0 — much faster on large, busy logs.
```

**Category**

Developer Tools

**Single Purpose**

Reformats the log lines shown in the Argo CD web UI Logs tab into readable, filterable rows.

**Primary Language**

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `extension/icons/icon128.png` |
| Screenshot 1 | 1280×800 | ✅ Ready | `store/screenshot-1.png` |
| Small Promo Tile | 440×280 | ⬜ Not created | |

### Screenshot Notes

Screenshot 1: the Argo CD pod Logs tab with the formatted view on (level badges, filter chips, expanded row).
Refresh it whenever the toolbar or row layout changes.

## Permissions Justification

| Permission | Justification |
|------------|---------------|
| `storage` | Remembers whether the formatted view is on and the list of Argo CD addresses the user added in the options page. |
| `activeTab` | Lets the icon menu read the address of the current tab so "Enable on this site" can offer that site; used only while the menu is open. |
| `scripting` | Runs the formatting script on the Argo CD sites the user added. The extension has no fixed site list because Argo CD is self-hosted, so the script is registered for each address the user adds. |
| Optional host permission `https://*/*`, `http://*/*` | Argo CD is self-hosted, so its address is not known in advance. The extension never asks for all sites: it requests access for exactly one origin at a time, the site of the current tab when the user chooses "Enable on this site" in the icon menu, or the address typed in the settings page. Access can be removed per site from the options page or from chrome://extensions. |

**Remote code:** No. All code is included in the package.

## Privacy & Data Use

- **Data collected:** none. No analytics, no error reporting, no network requests of its own.
- **Data stored:** the on/off preference for the formatted view (local storage) and the list of Argo CD
  addresses the user added (Chrome sync storage, so it follows the user's Chrome profile if sync is on).
- **Data disclosure form:** tick "does not collect or use user data". Website content is read only to
  re-render it on the same page and is never stored or transmitted.
- **Privacy policy URL:** https://github.com/jperelli/argocd-logs-prettifier/blob/main/PRIVACY.md
  (the repository must be public for the reviewer to open it).

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.2.0 | 2026-09-24 | Performance: only the most recent 1,000 rows are drawn; incremental updates. No permission changes. |
| 1.1.1 | 2026-09-24 | Fix lost clicks while logs stream (rows updated in place). |
| 1.1.0 | 2026-09-24 | Icon menu with Enable on this site / Settings / About; activeTab permission added (justified above). |
| 1.0.1 | 2026-09-23 | Resubmission with the rewritten description; manifest description aligned with the short description. |
| 1.0.0 | 2026-09-23 | First submission. Rejected (Yellow Argon, "excessive keywords in the description"): the description listed logging libraries and formats the parser recognises (".NET (Microsoft.Extensions.Logging JSON), dapr, pino, Serilog compact, OpenTelemetry-style and logfmt"). Fix: rewrote the description in plain language from the user's point of view without naming libraries or formats; resubmitted as 1.0.1. |

## Release Steps

1. Bump `version` in `extension/manifest.json` and `package.json`; add a `CHANGELOG.md` entry and a row above.
2. `npm test && npm run package` (or push a `v<version>` tag: the Release workflow builds the zip and attaches it
   to a GitHub release).
3. Upload `argocd-logs-prettifier-<version>.zip` in the developer dashboard, paste the fields from this file,
   submit for review.
