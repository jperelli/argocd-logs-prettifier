# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/jperelli/argocd-logs-prettifier/releases/tag/v1.0.0
