# 🔐 Security

## Supported versions

Only the latest release receives fixes. Foundry offers the update automatically
through the manifest URL.

| Version | Supported |
|---------|-----------|
| latest  | ✅ |
| older   | ❌ |

## Reporting a vulnerability

Use **GitHub private vulnerability reporting**:
[Security → Report a vulnerability](https://github.com/Aiacos/npc-token-replacer/security/advisories/new).
Please do not open a public issue for security problems. Expect a first reply
within a week.

## Security-relevant surfaces

The module runs in the GM's browser, has no server component and no runtime
dependencies. These are the places where untrusted data meets it:

- [x] **HTML rendering** — actor names, compendium labels and module names are escaped
  with `escapeHtml()` before reaching dialogs and notifications. → `scripts/main.js`
- [x] **Network probes** — wildcard token art is resolved with HEAD requests that reject
  absolute and protocol-relative URLs and are bounded by `httpTimeout`.
  → `scripts/lib/wildcard-resolver.js`
- [x] **Destructive actions are GM-only and previewed** — token replacement and D&D Beyond
  actor overwrites are listed before anything changes; the settings menu is
  `restricted`. → `scripts/main.js`
- [x] **Settings parsing** fails closed — an unreadable selection falls back to the
  default sources, an unreadable overwrite setting to *not* overwriting.
- [x] **Secrets** — none in the repository; gitleaks runs as a pre-commit hook where
  installed. The only CI secret, `FOUNDRY_PACKAGE_TOKEN`, is optional and exposed only
  to the registry-announcement step of the release workflow.
- [ ] **Live-world review of `update(…, {recursive: false})`** on D&D Beyond actors
  (see [TODO.md](TODO.md)).
