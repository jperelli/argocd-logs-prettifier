# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-09-24

### Changed

- Large, busy logs no longer make the page crawl. On a Deployment with ten pods and 10,000+ lines streaming in,
  the extension went from taking 62-72% of the main thread to 0.4%, at Argo CD's own baseline.
  - Only the most recent 1,000 rows are kept in the page; scrolling up (or the button at the top of the list)
    loads 1,000 more. Filters and counts still consider every line.
  - A new line updates only that line instead of rebuilding the list, and the list is only walked in full when
    the log actually changes shape.
  - The extension's own updates no longer trigger another update of themselves, which was causing a full
    rebuild several times a second.

### Added

- `scripts/perf.js`, which measures render cost and main-thread long tasks against a live Argo CD tab.

## [1.1.1] - 2026-09-24

### Fixed

- Clicks on rows were often lost while logs were streaming: every new line rebuilt the whole list, so the row
  under the pointer was replaced between press and release. Rows are now updated in place and keep their
  identity (and expanded state) as the tail rolls.
- A text selection elsewhere on the page no longer blocks expanding a row.

## [1.1.0] - 2026-09-24

### Added

- Clicking the extension icon opens a menu with **Enable on this site** (adds the current tab's Argo CD
  address and asks for permission right there, no copy-pasting), **Settings…** and **About**. The entry turns
  into **Disable on this site** where the extension is already enabled.
- Sites granted through Chrome's permission dialog are recorded by the background worker, so enabling works
  even though Chrome closes the popup while the dialog is open; the site list is also reconciled with the
  granted permissions on install and startup.

### Fixed

- Content script registration no longer races on install (duplicate script id error).

## [1.0.1] - 2026-09-23

### Changed

- Plain-language extension description and Chrome Web Store listing (the first submission was rejected for
  listing logging libraries and formats in the description).
- Store listing text, permission justifications and release steps moved to `CHROMEWEBSTORE.md`.
- Privacy policy now mentions that the list of Argo CD addresses is kept in Chrome sync storage.

## [1.0.0] - 2026-09-23

### Added

- Structured view for the Argo CD pod **Logs** tab: line number, time, level badge, logger, message and extra fields
  per line, toggled with a `{ } JSON` button in Argo's log toolbar (the choice is remembered).
- Expandable rows showing the full record as syntax-coloured JSON, with **Copy JSON** and **Copy raw**.
- Level chips with counts that filter rows (Ctrl/Alt-click solos one level, again to reset), a text filter,
  **Wrap** and **Expand all**.
- Parsers for JSON lines (.NET `LogLevel`/`Category`/`Message`/`Scopes`, dapr, pino numeric levels, Serilog
  compact, OpenTelemetry-style `severity_text`/`body`) and logfmt; plain lines are kept as-is.
- Trace ids picked up from `trace_id`/`traceId`/`TraceId`, including inside .NET `Scopes`.
- Dark-mode styling following Argo CD's inverted log viewer.
- Options page to register the Argo CD instances the extension may run on; permissions are requested per site.
- Follows live logs: new lines keep the list pinned to the bottom when it already was.

[1.2.0]: https://github.com/jperelli/argocd-logs-prettifier/releases/tag/v1.2.0
[1.1.1]: https://github.com/jperelli/argocd-logs-prettifier/releases/tag/v1.1.1
[1.1.0]: https://github.com/jperelli/argocd-logs-prettifier/releases/tag/v1.1.0
[1.0.1]: https://github.com/jperelli/argocd-logs-prettifier/releases/tag/v1.0.1
[1.0.0]: https://github.com/jperelli/argocd-logs-prettifier/releases/tag/v1.0.0
