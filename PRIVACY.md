# Privacy policy

Argo CD Logs Prettifier runs entirely inside your browser.

- It reads the log lines already displayed by the Argo CD web UI on the sites you explicitly add in its options
  page, and re-renders them on that same page. Log content is never stored or transmitted.
- It does not collect or send any data: there are no analytics, no error reporting and no network requests of
  its own.
- It stores two settings only: whether the formatted view is on (kept on your device) and the list of Argo CD
  addresses you added (kept in Chrome's sync storage, which Chrome may synchronise across your devices through
  your Google account when Chrome sync is enabled).
- Site access is requested per Argo CD address when you add it and can be revoked at any time from the options
  page or from `chrome://extensions`.

Questions: open an issue at https://github.com/jperelli/argocd-logs-prettifier/issues
